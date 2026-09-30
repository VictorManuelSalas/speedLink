import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionContext } from '../auth/session-context';
import { AuditLog } from '../audit/audit-log';
import { emitWebhookEvent } from '../integrations/webhook-events';
import { CUSTOMERS } from '../data-access/mock-crm-data';
import { OperationalStore } from '../../features/operations/operational-store';
import type { OperationalRecord } from '../../features/operations/operational-modules.data';
import {
  BlockReason,
  CutoffRules,
  ExecutionStatus,
  MikrotikRouter,
  NETWORK_ACTION_LABEL,
  NetworkAction,
  NetworkLogEntry,
  RouterApi,
  RouterCommands,
  Speed,
  SpeedProfile,
  Subscriber,
  defaultUpload,
  isValidIpv4,
  mbpsIn,
  speedLabel,
} from './mikrotik.model';

const ROUTERS_KEY = 'speedlink-mikrotik-routers';
const PROFILES_KEY = 'speedlink-mikrotik-profiles';
const SUBSCRIBERS_KEY = 'speedlink-mikrotik-subscribers';
const LOG_KEY = 'speedlink-mikrotik-log';
const RULES_KEY = 'speedlink-mikrotik-rules';
const MAX_LOG = 300;

const SEED_DATE = '2026-02-01T10:00:00-06:00';
const SEED_BY = 'Andrea Torres';
export const DEMO_ROUTER_ID = 'rtr-demo';

const SEED_ROUTERS: ReadonlyArray<MikrotikRouter> = [
  {
    id: DEMO_ROUTER_ID,
    name: 'Torre Ejido Martha',
    node: 'Ejido Martha · Mapimí',
    host: '10.20.4.1',
    port: 443,
    api: 'rest',
    username: 'crm-api',
    secretTail: 'demo',
    enabled: true,
    simulated: true,
    blockList: 'morosos',
    identity: 'SL-MARTHA-CCR',
    version: 'RouterOS 7.14.2',
    lastCheckAt: SEED_DATE,
    lastCheckOk: true,
    updatedAt: SEED_DATE,
    updatedBy: SEED_BY,
  },
];

const profile = (download: number, upload: number, name: string, burst = true): SpeedProfile => ({
  id: `prf-${download}`,
  name,
  download,
  upload,
  burst,
  serviceId: '',
});

/** Velocidades de los clientes (5/10/15) y de los planes del catálogo (10 a 150). */
const SEED_PROFILES: ReadonlyArray<SpeedProfile> = [
  profile(5, 1, 'Básico 5 Mbps'),
  profile(10, 2, 'Hogar 10 Mbps'),
  profile(15, 3, 'Hogar 15 Mbps'),
  profile(20, 4, 'Standard 20 Mbps'),
  profile(50, 10, 'Premium 50 Mbps'),
  profile(100, 20, 'Elite 100 Mbps', false),
  profile(150, 30, 'Ultra 150 Mbps', false),
];

/** Cliente que queda sin cola para mostrar «Crear usuario en MikroTik». */
const UNPROVISIONED_DEMO = 'SL-1061';

function seedSubscribers(): Record<string, Subscriber> {
  const entries = CUSTOMERS.filter(
    (customer) =>
      (customer.status === 'active' || customer.status === 'suspended') && customer.id !== UNPROVISIONED_DEMO,
  ).map((customer): Subscriber => {
    const suspended = customer.status === 'suspended';
    return {
      customerId: customer.id,
      customerName: customer.name,
      routerId: DEMO_ROUTER_ID,
      queueName: `${customer.id} ${customer.name}`,
      ip: customer.ipAddress,
      // SL-1043 quedó con una velocidad distinta a su plan: muestra el aviso de desfase.
      speed: customer.id === 'SL-1043' ? { download: 8, upload: 2 } : null,
      burst: true,
      blocked: suspended,
      blockedAt: suspended ? '2026-09-12T10:00:00-06:00' : undefined,
      blockReason: suspended ? 'Falta de pago' : undefined,
      createdAt: customer.installDate,
      updatedAt: customer.installDate,
      updatedBy: SEED_BY,
    };
  });
  return Object.fromEntries(entries.map((entry) => [entry.customerId, entry]));
}

const SEED_RULES: CutoffRules = {
  graceDays: 5,
  windowStart: '09:00',
  windowEnd: '18:00',
  skipWeekends: true,
  reactivateOnPayment: true,
  updatedAt: SEED_DATE,
  updatedBy: SEED_BY,
};

export type NetworkResult<T = void> = { ok: true; value: T; status: ExecutionStatus } | { ok: false; error: string };

/** De dónde sale la velocidad que le toca al cliente. */
export interface PlanSpeed {
  readonly speed: Speed | null;
  readonly profile?: SpeedProfile;
  readonly source: 'contract' | 'customer' | 'none';
  readonly label: string;
  readonly contractId?: string;
}

export interface RouterInput {
  readonly name: string;
  readonly node: string;
  readonly host: string;
  readonly port: number;
  readonly api: RouterApi;
  readonly username: string;
  readonly blockList: string;
  readonly enabled: boolean;
}

export interface ProvisionInput {
  readonly routerId: string;
  readonly ip: string;
  readonly queueName: string;
  readonly speed: Speed;
  readonly burst: boolean;
}

export interface OverdueSummary {
  readonly count: number;
  readonly amount: number;
  /** Días desde el vencimiento más antiguo. */
  readonly days: number;
}

@Injectable({ providedIn: 'root' })
export class MikrotikStore {
  private readonly ops = inject(OperationalStore);
  private readonly session = inject(SessionContext);
  private readonly audit = inject(AuditLog);
  /** Servicios de Internet vistos en la sincronización anterior (null = aún no se sincroniza). */
  private knownPlans: ReadonlySet<string> | null = null;

  readonly routers = signal<ReadonlyArray<MikrotikRouter>>(this.read(ROUTERS_KEY, SEED_ROUTERS));
  readonly profiles = signal<ReadonlyArray<SpeedProfile>>(this.read(PROFILES_KEY, SEED_PROFILES));
  readonly subscribers = signal<Readonly<Record<string, Subscriber>>>(this.read(SUBSCRIBERS_KEY, seedSubscribers()));
  readonly log = signal<ReadonlyArray<NetworkLogEntry>>(this.read(LOG_KEY, []));
  readonly rules = signal<CutoffRules>({ ...SEED_RULES, ...this.read<Partial<CutoffRules>>(RULES_KEY, {}) });

  /** Hay al menos un router activo: sin él, ningún botón de red se muestra. */
  readonly connected = computed(() => this.routers().some((router) => router.enabled));
  readonly activeRouters = computed(() => this.routers().filter((router) => router.enabled));
  readonly subscriberList = computed(() =>
    Object.values(this.subscribers()).sort((a, b) => a.customerId.localeCompare(b.customerId)),
  );

  constructor() {
    effect(() => this.persist(ROUTERS_KEY, this.routers()));
    effect(() => this.persist(PROFILES_KEY, this.profiles()));
    effect(() => this.persist(SUBSCRIBERS_KEY, this.subscribers()));
    effect(() => this.persist(LOG_KEY, this.log()));
    effect(() => this.persist(RULES_KEY, this.rules()));
    // Cada servicio de Internet es un perfil de velocidad: crearlo, cambiar su
    // velocidad o borrarlo en Servicios se refleja aquí y en las colas.
    effect(() => {
      // Hasta que cargan los datos, los servicios son de ejemplo y se reemplazan.
      if (!this.ops.dataReady()) return;
      const services = this.ops.recordsFor('services');
      untracked(() => this.syncPlans(services));
    });
  }

  // ───────────────────────────────────────────────────────────── Consultas

  router(id: string): MikrotikRouter | undefined {
    return this.routers().find((router) => router.id === id);
  }

  subscriber(customerId: string): Subscriber | undefined {
    const sub = this.subscribers()[customerId];
    // Una cola en un router apagado o borrado no está disponible.
    return sub && this.router(sub.routerId)?.enabled ? sub : undefined;
  }

  /**
   * Velocidad que corresponde al cliente: la del plan de internet de su
   * contrato activo; si no tiene, la velocidad registrada en su ficha.
   */
  planFor(customerId: string): PlanSpeed {
    const contract = this.ops
      .recordsFor('contracts')
      .find((record) => record['clientId'] === customerId && record['status'] === 'ACTIVE');
    const service = contract ? this.internetService(contract) : undefined;
    if (contract && service) {
      const mbps = mbpsIn(service['name']) ?? mbpsIn(service['description']);
      const profile =
        this.profiles().find((item) => item.serviceId === service.id) ??
        (mbps ? this.profiles().find((item) => item.download === mbps) : undefined);
      const speed = profile ?? (mbps ? { download: mbps, upload: defaultUpload(mbps) } : null);
      return {
        speed: speed ? { download: speed.download, upload: speed.upload } : null,
        profile,
        source: 'contract',
        label: String(service['name'] ?? service.id),
        contractId: contract.id,
      };
    }
    const customer = CUSTOMERS.find((item) => item.id === customerId);
    const mbps = mbpsIn(customer?.speed);
    if (!customer || !mbps) return { speed: null, source: 'none', label: 'Sin plan' };
    // Sin contrato sólo aplican perfiles manuales: el de un plan es de quien lo contrató.
    const profile = this.profiles().find((item) => !item.serviceId && item.download === mbps);
    return {
      speed: profile ? { download: profile.download, upload: profile.upload } : { download: mbps, upload: defaultUpload(mbps) },
      profile,
      source: 'customer',
      label: `${customer.plan} · ${customer.speed}`,
    };
  }

  /** Velocidad configurada en la cola del router. */
  appliedSpeed(sub: Subscriber): Speed | null {
    return sub.speed ?? this.planFor(sub.customerId).speed;
  }

  /** La cola no tiene la velocidad del plan (subió/bajó a mano o cambió el contrato). */
  outOfSync(sub: Subscriber): boolean {
    const plan = this.planFor(sub.customerId).speed;
    const applied = this.appliedSpeed(sub);
    return !!plan && !!applied && (plan.download !== applied.download || plan.upload !== applied.upload);
  }

  /** Facturas vencidas del cliente (módulo Facturas). */
  overdueFor(customerId: string, now = new Date()): OverdueSummary {
    const overdue = this.ops
      .recordsFor('invoices')
      .filter((invoice) => invoice['clientId'] === customerId && invoice['status'] === 'OVERDUE');
    const oldest = overdue.reduce(
      (min, invoice) => (String(invoice['dueDate'] ?? '') < min ? String(invoice['dueDate']) : min),
      '9999',
    );
    const days = overdue.length ? Math.floor((now.getTime() - new Date(`${oldest.slice(0, 10)}T12:00:00`).getTime()) / 86400_000) : 0;
    return {
      count: overdue.length,
      amount: overdue.reduce((sum, invoice) => sum + (Number(invoice['total']) || 0), 0),
      days,
    };
  }

  /** Clientes con internet activo y deuda vencida más allá de los días de gracia. */
  readonly cutoffCandidates = computed(() => {
    const grace = this.rules().graceDays;
    return this.subscriberList()
      .filter((sub) => !sub.blocked && this.router(sub.routerId)?.enabled)
      .map((sub) => ({ sub, overdue: this.overdueFor(sub.customerId) }))
      .filter((item) => item.overdue.count > 0 && item.overdue.days > grace);
  });

  /** Bloqueados por falta de pago que ya no deben nada. */
  readonly reactivationCandidates = computed(() =>
    this.rules().reactivateOnPayment
      ? this.subscriberList().filter(
          (sub) => sub.blocked && sub.blockReason === 'Falta de pago' && this.overdueFor(sub.customerId).count === 0,
        )
      : [],
  );

  /** ¿Se puede cortar ahora según el horario configurado? */
  inCutoffWindow(now = new Date()): boolean {
    const rules = this.rules();
    if (rules.skipWeekends && [0, 6].includes(now.getDay())) return false;
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return time >= rules.windowStart && time < rules.windowEnd;
  }

  logFor(customerId: string): ReadonlyArray<NetworkLogEntry> {
    return this.log().filter((entry) => entry.customerId === customerId);
  }

  // ─────────────────────────────────────────────────── Acciones por cliente

  /** Crea la cola simple del cliente («crear el usuario en MikroTik»). */
  provision(customerId: string, input: ProvisionInput, actor: string): NetworkResult<Subscriber> {
    const router = this.router(input.routerId);
    if (!router?.enabled) return this.fail('Elige un router activo.');
    if (this.subscribers()[customerId]) return this.fail('El cliente ya tiene una cola.');
    const ip = input.ip.trim();
    const ipError = this.ipProblem(ip, customerId);
    if (ipError) return this.fail(ipError);
    const queueName = input.queueName.trim();
    if (!queueName) return this.fail('Escribe el nombre de la cola.');
    if (Object.values(this.subscribers()).some((sub) => sub.routerId === router.id && sub.queueName === queueName))
      return this.fail('Ya hay una cola con ese nombre en el router.');
    const speedError = this.speedProblem(input.speed);
    if (speedError) return this.fail(speedError);
    const now = new Date().toISOString();
    const customer = CUSTOMERS.find((item) => item.id === customerId);
    const sub: Subscriber = {
      customerId,
      customerName: customer?.name ?? customerId,
      routerId: router.id,
      queueName,
      ip,
      speed: { ...input.speed },
      burst: input.burst,
      blocked: false,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor,
    };
    this.subscribers.update((subs) => ({ ...subs, [customerId]: sub }));
    const status = this.record(router, sub, 'provision', actor, `Cola «${queueName}» · ${ip} · ${speedLabel(input.speed)}`, [
      RouterCommands.provision(sub, input.speed, input.burst),
    ]);
    return { ok: true, value: sub, status };
  }

  /** Sube o baja la velocidad de la cola. */
  setSpeed(customerId: string, speed: Speed, burst: boolean, actor: string, reason = ''): NetworkResult {
    const sub = this.subscriber(customerId);
    if (!sub) return this.fail('El cliente no tiene cola activa.');
    const speedError = this.speedProblem(speed);
    if (speedError) return this.fail(speedError);
    const previous = this.appliedSpeed(sub);
    this.patch(customerId, { speed: { ...speed }, burst }, actor);
    const status = this.record(
      this.router(sub.routerId)!,
      sub,
      'speed',
      actor,
      `${speedLabel(previous)} → ${speedLabel(speed)}${reason ? ` · ${reason}` : ''}`,
      [RouterCommands.speed(customerId, speed, burst)],
    );
    return { ok: true, value: undefined, status };
  }

  block(customerId: string, reason: BlockReason, note: string, actor: string): NetworkResult {
    const sub = this.subscriber(customerId);
    if (!sub) return this.fail('El cliente no tiene cola activa.');
    if (sub.blocked) return this.fail('El internet ya está bloqueado.');
    const router = this.router(sub.routerId)!;
    this.patch(customerId, { blocked: true, blockedAt: new Date().toISOString(), blockReason: reason, blockNote: note.trim() }, actor);
    emitWebhookEvent('network.blocked', { customerId, ip: sub.ip, router: router.name, reason, note: note.trim() });
    const status = this.record(router, sub, 'block', actor, `${reason}${note.trim() ? ` · ${note.trim()}` : ''}`, [
      RouterCommands.block(customerId, sub.ip, router.blockList, reason),
    ]);
    return { ok: true, value: undefined, status };
  }

  unblock(customerId: string, actor: string, note = ''): NetworkResult {
    const sub = this.subscriber(customerId);
    if (!sub) return this.fail('El cliente no tiene cola activa.');
    if (!sub.blocked) return this.fail('El internet no está bloqueado.');
    const router = this.router(sub.routerId)!;
    this.patch(customerId, { blocked: false, blockedAt: undefined, blockReason: undefined, blockNote: undefined }, actor);
    emitWebhookEvent('network.unblocked', { customerId, ip: sub.ip, router: router.name });
    const status = this.record(router, sub, 'unblock', actor, note || `Estaba bloqueado por: ${sub.blockReason ?? '—'}`, [
      RouterCommands.unblock(sub.ip, router.blockList),
    ]);
    return { ok: true, value: undefined, status };
  }

  changeIp(customerId: string, ip: string, actor: string): NetworkResult {
    const sub = this.subscriber(customerId);
    if (!sub) return this.fail('El cliente no tiene cola activa.');
    const clean = ip.trim();
    if (clean === sub.ip) return this.fail('Es la misma IP.');
    const ipError = this.ipProblem(clean, customerId);
    if (ipError) return this.fail(ipError);
    const router = this.router(sub.routerId)!;
    this.patch(customerId, { ip: clean }, actor);
    // Si está bloqueado, el bloqueo debe seguir a la IP nueva.
    const commands = [RouterCommands.ip(customerId, clean)];
    if (sub.blocked)
      commands.push(
        RouterCommands.unblock(sub.ip, router.blockList),
        RouterCommands.block(customerId, clean, router.blockList, sub.blockReason ?? 'Otro'),
      );
    const status = this.record(router, sub, 'ip', actor, `${sub.ip} → ${clean}`, commands);
    return { ok: true, value: undefined, status };
  }

  resetCounters(customerId: string, actor: string): NetworkResult {
    const sub = this.subscriber(customerId);
    if (!sub) return this.fail('El cliente no tiene cola activa.');
    this.patch(customerId, { countersResetAt: new Date().toISOString() }, actor);
    const status = this.record(this.router(sub.routerId)!, sub, 'reset', actor, 'Consumo del mes desde cero', [
      RouterCommands.reset(customerId),
    ]);
    return { ok: true, value: undefined, status };
  }

  /** Borra la cola (baja del servicio). Si estaba bloqueado, también sale de la lista. */
  removeQueue(customerId: string, actor: string): NetworkResult {
    const sub = this.subscriber(customerId);
    if (!sub) return this.fail('El cliente no tiene cola activa.');
    const router = this.router(sub.routerId)!;
    this.subscribers.update((subs) => {
      const { [customerId]: _removed, ...rest } = subs;
      return rest;
    });
    const commands = [RouterCommands.remove(customerId)];
    if (sub.blocked) commands.push(RouterCommands.unblock(sub.ip, router.blockList));
    const status = this.record(router, sub, 'remove', actor, `Cola «${sub.queueName}» eliminada`, commands);
    return { ok: true, value: undefined, status };
  }

  /** Aplica a varios clientes la misma acción; devuelve cuántos se procesaron. */
  blockMany(customerIds: ReadonlyArray<string>, reason: BlockReason, actor: string): number {
    return customerIds.filter((id) => this.block(id, reason, '', actor).ok).length;
  }
  unblockMany(customerIds: ReadonlyArray<string>, actor: string, note = ''): number {
    return customerIds.filter((id) => this.unblock(id, actor, note).ok).length;
  }
  syncManyToPlan(customerIds: ReadonlyArray<string>, actor: string): number {
    return customerIds.filter((id) => {
      const sub = this.subscriber(id);
      const plan = this.planFor(id);
      return sub && plan.speed ? this.setSpeed(id, plan.speed, plan.profile?.burst ?? sub.burst, actor, 'Igualada al plan').ok : false;
    }).length;
  }

  // ─────────────────────────────────────────────────────────── Routers

  validateRouter(input: RouterInput, exceptId = ''): Partial<Record<keyof RouterInput, string>> {
    const errors: Partial<Record<keyof RouterInput, string>> = {};
    if (!input.name.trim()) errors.name = 'Escribe un nombre.';
    const host = input.host.trim();
    if (!isValidIpv4(host) && !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(host)) errors.host = 'IP o dominio inválido.';
    else if (this.routers().some((router) => router.id !== exceptId && router.host === host))
      errors.host = 'Ya hay un router con esa dirección.';
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) errors.port = 'Puerto entre 1 y 65535.';
    if (!/^[a-z0-9_.-]{2,32}$/i.test(input.username.trim())) errors.username = 'Usuario de 2 a 32 caracteres, sin espacios.';
    if (!/^[a-z0-9_-]{2,32}$/i.test(input.blockList.trim())) errors.blockList = 'Letras, números, - o _.';
    return errors;
  }

  saveRouter(input: RouterInput, secret: string, actor: string, id?: string): NetworkResult<MikrotikRouter> {
    if (Object.keys(this.validateRouter(input, id)).length) return this.fail('Revisa los campos marcados.');
    const existing = id ? this.router(id) : undefined;
    if (!existing && !secret.trim()) return this.fail('Escribe la contraseña del usuario del CRM.');
    const now = new Date().toISOString();
    const router: MikrotikRouter = {
      ...(existing ?? {
        id: `rtr-${Date.now().toString(36)}`,
        simulated: false,
        identity: '',
        version: '',
        lastCheckAt: '',
        lastCheckOk: null,
        secretTail: '',
      }),
      name: input.name.trim(),
      node: input.node.trim(),
      host: input.host.trim(),
      port: input.port,
      api: input.api,
      username: input.username.trim(),
      blockList: input.blockList.trim(),
      enabled: input.enabled,
      secretTail: secret.trim() ? secret.trim().slice(-4) : (existing?.secretTail ?? ''),
      updatedAt: now,
      updatedBy: actor,
    };
    this.routers.update((routers) =>
      existing ? routers.map((item) => (item.id === router.id ? router : item)) : [...routers, router],
    );
    this.audit.record('Red', existing ? 'Router editado' : 'Router agregado', router.name, `${router.host}:${router.port} · ${router.enabled ? 'activo' : 'inactivo'}${secret.trim() ? ' · contraseña nueva' : ''}`, 'warning');
    return { ok: true, value: router, status: router.simulated ? 'simulated' : 'manual' };
  }

  /** Un router con clientes no se borra: sus colas quedarían huérfanas en el CRM. */
  removeRouter(id: string): NetworkResult {
    const count = this.countOn(id);
    if (count) return this.fail(`Tiene ${count} cliente(s). Muévelos o elimina sus colas primero.`);
    const removedRouter = this.router(id);
    this.routers.update((routers) => routers.filter((router) => router.id !== id));
    this.audit.record('Red', 'Router eliminado', removedRouter?.name ?? id, removedRouter?.host ?? '', 'critical');
    return { ok: true, value: undefined, status: 'manual' };
  }

  /** Prueba la conexión. Sólo el router simulado responde mientras no haya servidor. */
  async testRouter(id: string): Promise<{ ok: boolean; message: string }> {
    const router = this.router(id);
    if (!router) return { ok: false, message: 'Router no encontrado.' };
    if (!router.simulated)
      return { ok: false, message: 'Sin servidor no se puede alcanzar un router real desde el navegador.' };
    await new Promise((resolve) => setTimeout(resolve, 600));
    this.routers.update((routers) =>
      routers.map((item) => (item.id === id ? { ...item, lastCheckAt: new Date().toISOString(), lastCheckOk: true } : item)),
    );
    return { ok: true, message: `${router.identity} · ${router.version} · ${this.countOn(id)} colas · respondió en 38 ms` };
  }

  countOn(routerId: string): number {
    return Object.values(this.subscribers()).filter((sub) => sub.routerId === routerId).length;
  }

  // ───────────────────────────────────────────────────────── Perfiles

  /**
   * Guarda un perfil. Si es el de un plan de Servicios, lo que se edita es el
   * servicio (nombre y velocidad): la sincronización lleva el cambio a las colas.
   */
  saveProfile(input: Omit<SpeedProfile, 'id' | 'serviceId'>, id?: string): NetworkResult<SpeedProfile> {
    if (!input.name.trim()) return this.fail('Escribe un nombre.');
    const speedError = this.speedProblem(input);
    if (speedError) return this.fail(speedError);
    const existing = id ? this.profiles().find((item) => item.id === id) : undefined;
    if (existing?.serviceId && this.ops.find('services', existing.serviceId)) {
      this.profiles.update((profiles) =>
        profiles.map((item) => (item.id === id ? { ...item, burst: input.burst } : item)),
      );
      this.ops.update('services', existing.serviceId, {
        name: input.name.trim(),
        downloadMbps: input.download,
        uploadMbps: input.upload,
      });
      return { ok: true, value: this.profiles().find((item) => item.id === id)!, status: 'simulated' };
    }
    const clean: SpeedProfile = {
      ...input,
      name: input.name.trim(),
      serviceId: '',
      id: id ?? `prf-${Date.now().toString(36)}`,
    };
    this.profiles.update((profiles) =>
      id
        ? profiles.map((item) => (item.id === id ? clean : item))
        : [...profiles, clean].sort((a, b) => a.download - b.download),
    );
    return { ok: true, value: clean, status: 'simulated' };
  }

  /** Los perfiles de un plan se eliminan borrando el servicio, no desde aquí. */
  removeProfile(id: string): NetworkResult {
    const profile = this.profiles().find((item) => item.id === id);
    if (profile?.serviceId && this.ops.find('services', profile.serviceId))
      return this.fail('Es el perfil de un plan de Servicios: elimina o cambia el servicio.');
    this.profiles.update((profiles) => profiles.filter((item) => item.id !== id));
    return { ok: true, value: undefined, status: 'simulated' };
  }

  /** Clientes cuyo plan resuelve a este perfil. */
  profileUsage(profileId: string): number {
    return this.subscriberList().filter((sub) => this.planFor(sub.customerId).profile?.id === profileId).length;
  }

  saveRules(input: Omit<CutoffRules, 'updatedAt' | 'updatedBy'>, actor: string): NetworkResult {
    if (!Number.isInteger(input.graceDays) || input.graceDays < 0 || input.graceDays > 60)
      return this.fail('Días de gracia entre 0 y 60.');
    if (!input.windowStart || !input.windowEnd || input.windowStart >= input.windowEnd)
      return this.fail('El horario de cortes debe terminar después de empezar.');
    this.rules.set({ ...input, updatedAt: new Date().toISOString(), updatedBy: actor });
    this.audit.record('Red', 'Reglas de corte', 'MikroTik', `${input.graceDays} días de gracia · ${input.windowStart}–${input.windowEnd}${input.skipWeekends ? ' · sin fines de semana' : ''}`);
    return { ok: true, value: undefined, status: 'simulated' };
  }

  // ───────────────────────────────────────── Planes de internet ↔ perfiles

  /** Velocidad que declara un servicio de Internet: sus campos o, si no, su nombre. */
  serviceSpeed(service: OperationalRecord): Speed | null {
    if (service['type'] !== 'Internet') return null;
    const download = Number(service['downloadMbps']) || mbpsIn(service['name']) || 0;
    if (!(download > 0)) return null;
    const upload = Number(service['uploadMbps']) || defaultUpload(download);
    return { download, upload };
  }

  /** Servicios de Internet sin velocidad: no pueden tener perfil. */
  readonly plansWithoutSpeed = computed(() =>
    this.ops.recordsFor('services').filter((service) => service['type'] === 'Internet' && !this.serviceSpeed(service)),
  );

  private syncPlans(services: ReadonlyArray<OperationalRecord>): void {
    // Sin servicios los datos aún no cargan: no hay nada que comparar.
    if (!services.length) return;
    const plans = services.filter((service) => this.serviceSpeed(service));
    const ids = new Set(plans.map((service) => service.id));
    const firstRun = this.knownPlans === null;

    for (const profile of this.profiles().filter((item) => item.serviceId && !ids.has(item.serviceId))) {
      // Se borró (o dejó de ser de Internet) en esta sesión: se elimina su perfil.
      if (!firstRun && this.knownPlans!.has(profile.serviceId)) this.removePlanProfile(profile);
      // Servicio de una sesión anterior que ya no existe: el perfil queda como manual.
      else this.profiles.update((list) => list.map((item) => (item.id === profile.id ? { ...item, serviceId: '' } : item)));
    }

    for (const service of plans) {
      const speed = this.serviceSpeed(service)!;
      const name = String(service['name'] ?? service.id);
      const linked = this.profiles().find((item) => item.serviceId === service.id);
      if (linked) {
        if (linked.download !== speed.download || linked.upload !== speed.upload)
          this.changePlanSpeed(linked, speed, name);
        else if (linked.name !== name)
          this.profiles.update((list) => list.map((item) => (item.id === linked.id ? { ...item, name } : item)));
        continue;
      }
      // Un perfil manual con la misma velocidad pasa a ser el de este plan.
      const adopt = this.profiles().find(
        (item) => !item.serviceId && item.download === speed.download && item.upload === speed.upload,
      );
      if (adopt) {
        this.profiles.update((list) =>
          list.map((item) => (item.id === adopt.id ? { ...item, serviceId: service.id, name } : item)),
        );
        continue;
      }
      const profile: SpeedProfile = {
        id: `prf-${service.id}`,
        name,
        ...speed,
        burst: speed.download < 100,
        serviceId: service.id,
      };
      this.profiles.update((list) => [...list, profile].sort((a, b) => a.download - b.download));
      if (!firstRun)
        this.logPlan(
          `Plan «${name}» creado: ${speedLabel(speed)}. Se aplica al crear o igualar la cola de sus clientes.`,
          [],
        );
    }
    this.knownPlans = ids;
  }

  /** Clientes cuyo plan (contrato activo) es este perfil. */
  private subscribersOnPlan(profile: SpeedProfile): Subscriber[] {
    return this.subscriberList().filter(
      (sub) =>
        this.planFor(sub.customerId).profile?.id === profile.id ||
        // Si el servicio ya se borró, el contrato todavía lo referencia.
        (!!profile.serviceId && this.contractServiceIds(sub.customerId).includes(profile.serviceId)),
    );
  }

  private contractServiceIds(customerId: string): string[] {
    const contract = this.ops
      .recordsFor('contracts')
      .find((record) => record['clientId'] === customerId && record['status'] === 'ACTIVE');
    if (!contract) return [];
    try {
      const raw = contract['items'];
      const items: ReadonlyArray<{ serviceId: string }> = (typeof raw === 'string' ? JSON.parse(raw || '[]') : raw) ?? [];
      return items.map((item) => item.serviceId);
    } catch {
      return [];
    }
  }

  /**
   * Cambió la velocidad del plan: se actualizan las colas que la seguían. Las
   * que tenían una velocidad personalizada (promoción, ajuste a mano) no se tocan.
   */
  private changePlanSpeed(profile: SpeedProfile, speed: Speed, name: string): void {
    const previous: Speed = { download: profile.download, upload: profile.upload };
    const onPlan = this.subscribersOnPlan(profile);
    const following = onPlan.filter(
      (sub) => !sub.speed || (sub.speed.download === previous.download && sub.speed.upload === previous.upload),
    );
    this.profiles.update((list) => list.map((item) => (item.id === profile.id ? { ...item, ...speed, name } : item)));
    const actor = this.actor();
    for (const sub of following) {
      if (sub.speed) this.patch(sub.customerId, { speed: { ...speed } }, actor);
      this.ops.logActivity(
        sub.customerId,
        'MikroTik · Velocidad del plan',
        `${speedLabel(previous)} → ${speedLabel(speed)} (${name})`,
        'blue',
        'Red',
        'EDIT',
      );
    }
    const kept = onPlan.length - following.length;
    this.logPlan(
      `Plan «${name}»: ${speedLabel(previous)} → ${speedLabel(speed)} · ${following.length} cola(s) actualizada(s)` +
        (kept ? ` · ${kept} con velocidad personalizada sin cambios` : ''),
      following.map((sub) => RouterCommands.speed(sub.customerId, speed, sub.burst)),
      following,
    );
  }

  /** Se borró el plan: sus clientes conservan la velocidad que tenían (no se les cambia sola). */
  private removePlanProfile(profile: SpeedProfile): void {
    const onPlan = this.subscribersOnPlan(profile);
    const actor = this.actor();
    for (const sub of onPlan.filter((item) => !item.speed))
      this.patch(sub.customerId, { speed: { download: profile.download, upload: profile.upload } }, actor);
    this.profiles.update((list) => list.filter((item) => item.id !== profile.id));
    this.logPlan(`Plan «${profile.name}» eliminado · ${onPlan.length} cola(s) conservan ${speedLabel(profile)}`, []);
  }

  private logPlan(summary: string, commands: string[], subs: ReadonlyArray<Subscriber> = []): void {
    const router = (subs[0] && this.router(subs[0].routerId)) || this.activeRouters()[0];
    const status: ExecutionStatus = subs.some((sub) => !this.router(sub.routerId)?.simulated) ? 'manual' : 'simulated';
    const entry: NetworkLogEntry = {
      id: `net-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      actor: this.actor(),
      routerId: router?.id ?? '',
      routerName: router?.name ?? 'MikroTik',
      action: 'plan',
      summary,
      commands,
      status,
    };
    this.log.update((log) => [entry, ...log].slice(0, MAX_LOG));
  }

  private actor(): string {
    return this.session.user()?.name ?? 'Sistema';
  }

  // ─────────────────────────────────────────────────────────── Interno

  private internetService(contract: OperationalRecord): OperationalRecord | undefined {
    let items: ReadonlyArray<{ serviceId: string }> = [];
    try {
      const raw = contract['items'];
      items = (typeof raw === 'string' ? JSON.parse(raw || '[]') : raw) ?? [];
    } catch {
      return undefined;
    }
    return items
      .map((item) => this.ops.find('services', item.serviceId))
      .find((service) => service && (service['type'] === 'Internet' || mbpsIn(service['name'])));
  }

  private ipProblem(ip: string, customerId: string): string | undefined {
    if (!isValidIpv4(ip)) return 'IP inválida, p. ej. 10.20.4.45';
    const other = Object.values(this.subscribers()).find((sub) => sub.ip === ip && sub.customerId !== customerId);
    return other ? `La IP ${ip} ya es de ${other.customerName} (${other.customerId}).` : undefined;
  }

  private speedProblem(speed: Speed): string | undefined {
    const valid = (value: number) => Number.isFinite(value) && value > 0 && value <= 10000;
    if (!valid(speed.download) || !valid(speed.upload)) return 'Velocidad entre 0.1 y 10 000 Mbps.';
    return undefined;
  }

  private patch(customerId: string, changes: Partial<Subscriber>, actor: string): void {
    this.subscribers.update((subs) => ({
      ...subs,
      [customerId]: { ...subs[customerId], ...changes, updatedAt: new Date().toISOString(), updatedBy: actor },
    }));
  }

  /** Registra la acción en la bitácora de red y en la actividad del cliente. */
  private record(
    router: MikrotikRouter,
    sub: Subscriber,
    action: NetworkAction,
    actor: string,
    summary: string,
    commands: string[],
  ): ExecutionStatus {
    const status: ExecutionStatus = router.simulated ? 'simulated' : 'manual';
    const entry: NetworkLogEntry = {
      id: `net-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      actor,
      routerId: router.id,
      routerName: router.name,
      customerId: sub.customerId,
      customerName: sub.customerName,
      action,
      summary,
      commands,
      status,
    };
    this.log.update((log) => [entry, ...log].slice(0, MAX_LOG));
    this.ops.logActivity(
      sub.customerId,
      `MikroTik · ${NETWORK_ACTION_LABEL[action]}`,
      summary,
      action === 'block' || action === 'remove' ? 'amber' : action === 'unblock' || action === 'provision' ? 'green' : 'blue',
      'Red',
      action === 'provision' ? 'CREATE' : action === 'remove' ? 'DELETE' : 'EDIT',
    );
    return status;
  }

  private fail<T = void>(error: string): NetworkResult<T> {
    return { ok: false, error };
  }

  private read<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
    } catch {
      return fallback;
    }
  }

  private persist(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Sin almacenamiento los cambios duran sólo esta sesión.
    }
  }
}
