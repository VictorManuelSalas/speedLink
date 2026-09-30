/*
 * Conexión con routers MikroTik (RouterOS).
 *
 * Cada cliente es una «cola simple» (Simple Queue) con su IP como target y la
 * velocidad del plan como max-limit. Bloquear el internet es agregar su IP a
 * una address-list (p. ej. `morosos`) que una regla del firewall descarta.
 *
 * El navegador no puede hablar con el router (CORS, contraseña expuesta y el
 * router no debe abrirse a internet): eso lo hará el servidor. Mientras tanto
 * cada acción genera el comando RouterOS exacto, y:
 *  - en un router SIMULADO se aplica al estado simulado (para la demo);
 *  - en un router REAL queda como «manual»: el técnico copia el comando y lo
 *    pega en Winbox › New Terminal, como lo hace hoy.
 */

export type RouterApi = 'rest' | 'api-ssl';

export interface MikrotikRouter {
  readonly id: string;
  readonly name: string;
  /** Torre o nodo donde está el router. */
  readonly node: string;
  readonly host: string;
  readonly port: number;
  readonly api: RouterApi;
  readonly username: string;
  /** La contraseña nunca se guarda en el navegador: sólo sus últimos 4 caracteres. */
  readonly secretTail: string;
  readonly enabled: boolean;
  /** Router de demostración: las acciones se aplican a un estado simulado. */
  readonly simulated: boolean;
  /** address-list que el firewall bloquea. */
  readonly blockList: string;
  readonly identity: string;
  readonly version: string;
  readonly lastCheckAt: string;
  readonly lastCheckOk: boolean | null;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

/** Velocidad de una cola, en Mbps. */
export interface Speed {
  readonly download: number;
  readonly upload: number;
}

export interface SpeedProfile extends Speed {
  readonly id: string;
  readonly name: string;
  /** Ráfaga: permite superar el límite unos segundos (páginas cargan más rápido). */
  readonly burst: boolean;
  /** Plan del catálogo de Servicios ligado a este perfil (opcional). */
  readonly serviceId: string;
}

export type BlockReason = 'Falta de pago' | 'Solicitud del cliente' | 'Mantenimiento' | 'Otro';
export const BLOCK_REASONS: ReadonlyArray<BlockReason> = [
  'Falta de pago',
  'Solicitud del cliente',
  'Mantenimiento',
  'Otro',
];

/** Cola simple de un cliente en el router. */
export interface Subscriber {
  readonly customerId: string;
  readonly customerName: string;
  readonly routerId: string;
  readonly queueName: string;
  readonly ip: string;
  /** Velocidad aplicada; `null` = la cola sigue igual al plan (semilla sincronizada). */
  readonly speed: Speed | null;
  readonly burst: boolean;
  readonly blocked: boolean;
  readonly blockedAt?: string;
  readonly blockReason?: BlockReason;
  readonly blockNote?: string;
  readonly countersResetAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export type NetworkAction = 'provision' | 'speed' | 'block' | 'unblock' | 'remove' | 'reset' | 'ip' | 'router' | 'plan';
/** `simulated`: aplicado al router de demo · `manual`: falta ejecutarlo en el router real. */
export type ExecutionStatus = 'simulated' | 'manual';

export interface NetworkLogEntry {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly routerId: string;
  readonly routerName: string;
  readonly customerId?: string;
  readonly customerName?: string;
  readonly action: NetworkAction;
  readonly summary: string;
  readonly commands: ReadonlyArray<string>;
  readonly status: ExecutionStatus;
}

export interface CutoffRules {
  /** Días después del vencimiento antes de cortar. */
  readonly graceDays: number;
  /** Horario en que se permite cortar (nadie quiere quedarse sin internet de noche). */
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly skipWeekends: boolean;
  /** Al quedar al corriente, sugerir la reactivación. */
  readonly reactivateOnPayment: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export const NETWORK_ACTION_LABEL: Readonly<Record<NetworkAction, string>> = {
  provision: 'Cola creada',
  speed: 'Velocidad cambiada',
  block: 'Internet bloqueado',
  unblock: 'Internet desbloqueado',
  remove: 'Cola eliminada',
  reset: 'Contadores reiniciados',
  ip: 'IP cambiada',
  router: 'Router',
  plan: 'Plan de velocidad',
};

// ───────────────────────────────────────────────────────────── Utilidades

export function speedLabel(speed: Speed | null | undefined): string {
  return speed ? `${formatMbps(speed.download)} / ${formatMbps(speed.upload)}` : '—';
}

export function formatMbps(value: number): string {
  if (value >= 1000) return `${+(value / 1000).toFixed(1)} Gbps`;
  if (value < 1) return `${Math.round(value * 1000)} kbps`;
  return `${+value.toFixed(1)} Mbps`;
}

export function formatGb(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} TB` : `${value.toFixed(1)} GB`;
}

/** Extrae «50» de «Internet Premium 50 Mbps» o de «10 Mbps». */
export function mbpsIn(text: unknown): number | null {
  const match = /(\d+(?:[.,]\d+)?)\s*(m|g)b(ps|its)?/i.exec(String(text ?? ''));
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return match[2].toLowerCase() === 'g' ? value * 1000 : value;
}

/** Subida por defecto cuando el plan sólo dice la bajada (relación 5:1 habitual). */
export function defaultUpload(download: number): number {
  return Math.max(1, Math.round(download / 5));
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.trim().split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

// ─────────────────────────────────────────────────────── Comandos RouterOS

const rate = (speed: Speed) => `${speed.upload}M/${speed.download}M`;
const find = (customerId: string) => `[find comment="crm:${customerId}"]`;
const quote = (text: string) => `"${text.replace(/"/g, "'")}"`;

/** max-limit va como subida/bajada; la ráfaga deja pasar 1.5× durante 8 s. */
function limits(speed: Speed, burst: boolean): string {
  const base = `max-limit=${rate(speed)}`;
  if (!burst) return base;
  const scaled = (factor: number) =>
    `${Math.round(speed.upload * factor * 10) / 10}M/${Math.round(speed.download * factor * 10) / 10}M`;
  return `${base} burst-limit=${scaled(1.5)} burst-threshold=${scaled(0.75)} burst-time=8s/8s`;
}

export const RouterCommands = {
  provision: (sub: Pick<Subscriber, 'customerId' | 'queueName' | 'ip'>, speed: Speed, burst: boolean) =>
    `/queue simple add name=${quote(sub.queueName)} target=${sub.ip}/32 ${limits(speed, burst)} comment="crm:${sub.customerId}"`,
  speed: (customerId: string, speed: Speed, burst: boolean) =>
    `/queue simple set ${find(customerId)} ${limits(speed, burst)}${burst ? '' : ' burst-limit=0/0'}`,
  block: (customerId: string, ip: string, list: string, reason: string) =>
    `/ip firewall address-list add list=${list} address=${ip} comment=${quote(`crm:${customerId} ${reason}`)}`,
  unblock: (ip: string, list: string) => `/ip firewall address-list remove [find list=${list} address=${ip}]`,
  remove: (customerId: string) => `/queue simple remove ${find(customerId)}`,
  reset: (customerId: string) => `/queue simple reset-counters ${find(customerId)}`,
  ip: (customerId: string, ip: string) => `/queue simple set ${find(customerId)} target=${ip}/32`,
};

/** Configuración que el router necesita una sola vez para que el CRM funcione. */
export function routerSetupScript(router: Pick<MikrotikRouter, 'blockList' | 'username' | 'api'>): string[] {
  return [
    '# 1) Grupo y usuario con permisos mínimos para el CRM',
    `/user group add name=crm policy=read,write,api,${router.api === 'rest' ? 'rest-api,' : ''}!ftp,!reboot,!policy,!password,!sniff,!sensitive,!romon`,
    `/user add name=${router.username || 'crm-api'} group=crm password="<contraseña segura>"`,
    `# 2) Servicio de ${router.api === 'rest' ? 'REST (HTTPS)' : 'API-SSL'} solo desde la IP del servidor del CRM`,
    router.api === 'rest'
      ? '/ip service set www-ssl disabled=no address=<IP del servidor>/32'
      : '/ip service set api-ssl disabled=no address=<IP del servidor>/32',
    `# 3) Bloqueo: todo lo que esté en la lista «${router.blockList}» se queda sin internet`,
    `/ip firewall filter add chain=forward src-address-list=${router.blockList} action=drop comment="crm:bloqueo"`,
    '# Mueve esta regla arriba de tus reglas «accept» (Winbox › IP › Firewall) para que tenga efecto.',
  ];
}

// ─────────────────────────────────────────────── Métricas (simulación demo)

/** FNV-1a: el mismo cliente siempre produce las mismas cifras. */
function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
function noise(seed: string): number {
  return (hash(seed) % 10000) / 10000;
}

/** Uso típico de un hogar por hora (fracción del plan): bajo de madrugada, pico de 20 a 22 h. */
const DIURNAL = [
  0.1, 0.07, 0.05, 0.04, 0.04, 0.05, 0.1, 0.18, 0.24, 0.27, 0.3, 0.32, 0.36, 0.38, 0.36, 0.38, 0.44,
  0.52, 0.62, 0.75, 0.86, 0.9, 0.72, 0.4,
];
/** Parte del plan que un hogar usa en promedio (≈7 % → ~250 GB/mes con 10 Mbps). */
const USAGE_SCALE = 0.2;

export type LinkStatus = 'online' | 'offline' | 'blocked';

export interface TrafficSnapshot {
  readonly status: LinkStatus;
  /** Bajada y subida actuales, Mbps. */
  readonly rx: number;
  readonly tx: number;
  readonly latencyMs: number;
  /** Uso de la bajada respecto al plan, 0–1. */
  readonly utilization: number;
  readonly uptimeDays: number;
}

export interface HourPoint {
  readonly label: string;
  readonly rx: number;
  readonly tx: number;
}

export interface DayPoint {
  readonly date: string;
  readonly gb: number;
}

/**
 * Lo que un hogar realmente usa no crece en proporción a la velocidad: con
 * 150 Mbps no se ve 15 veces más video que con 10. Se escala por raíz.
 */
function usageBase(download: number): number {
  return download <= 10 ? download : Math.sqrt(download * 10);
}

/** Perfil de consumo del cliente: unos usan poco, otros hacen streaming todo el día. */
function heaviness(customerId: string): number {
  return 0.45 + noise(`heavy:${customerId}`) * 1.1;
}

/** ~5 % de los clientes aparece desconectado (equipo apagado o sin energía). */
export function isOffline(customerId: string, now: Date): boolean {
  return noise(`off:${customerId}:${now.toISOString().slice(0, 10)}`) < 0.05;
}

export function trafficNow(customerId: string, speed: Speed | null, blocked: boolean, now = new Date()): TrafficSnapshot {
  const uptimeDays = 1 + (hash(`up:${customerId}`) % 40);
  if (isOffline(customerId, now)) return { status: 'offline', rx: 0, tx: 0, latencyMs: 0, utilization: 0, uptimeDays: 0 };
  const latencyMs = Math.round(6 + (hash(`lat:${customerId}`) % 18) + noise(`lat:${customerId}:${now.getMinutes()}`) * 8);
  if (blocked || !speed) return { status: blocked ? 'blocked' : 'online', rx: 0, tx: 0, latencyMs, utilization: 0, uptimeDays };
  // Muestra cada 5 s: el tráfico instantáneo es a ráfagas, muy por encima del promedio.
  const tick = Math.floor(now.getTime() / 5000);
  const burst = 0.3 + noise(`rx:${customerId}:${tick}`) * 2.2;
  const rx = Math.min(speed.download, usageBase(speed.download) * DIURNAL[now.getHours()] * USAGE_SCALE * heaviness(customerId) * burst);
  const tx = Math.min(speed.upload, rx * 0.12 + speed.upload * 0.02 * noise(`tx:${customerId}:${tick}`));
  return { status: 'online', rx, tx, latencyMs, utilization: rx / speed.download, uptimeDays };
}

/** Bajada/subida promedio de las últimas 24 horas, una muestra por hora. */
export function lastHours(customerId: string, speed: Speed | null, blockedAt: string | undefined, now = new Date()): HourPoint[] {
  const points: HourPoint[] = [];
  for (let back = 23; back >= 0; back--) {
    const at = new Date(now.getTime() - back * 3600_000);
    const off = !speed || (blockedAt && at.toISOString() >= blockedAt);
    const factor = 0.75 + noise(`h:${customerId}:${at.toISOString().slice(0, 13)}`) * 0.5;
    const rx = off ? 0 : usageBase(speed!.download) * DIURNAL[at.getHours()] * USAGE_SCALE * heaviness(customerId) * factor;
    points.push({ label: `${String(at.getHours()).padStart(2, '0')}h`, rx, tx: rx * 0.12 });
  }
  return points;
}

/** GB consumidos por día; 0 los días bloqueado o antes de reiniciar contadores. */
export function lastDays(
  customerId: string,
  speed: Speed | null,
  days: number,
  options: { blockedAt?: string; since?: string } = {},
  now = new Date(),
): DayPoint[] {
  const average = DIURNAL.reduce((sum, value) => sum + value, 0) / DIURNAL.length;
  const points: DayPoint[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const date = new Date(now.getTime() - back * 86400_000).toISOString().slice(0, 10);
    const skipped =
      !speed ||
      (options.blockedAt && date > options.blockedAt.slice(0, 10)) ||
      (options.since && date < options.since.slice(0, 10));
    const weekend = [0, 6].includes(new Date(`${date}T12:00:00`).getDay()) ? 1.2 : 1;
    const factor = (0.7 + noise(`d:${customerId}:${date}`) * 0.6) * weekend;
    // Mbps promedio × 86 400 s ÷ 8 bits ÷ 1000 = GB del día. Hoy cuenta sólo lo transcurrido.
    const share = back === 0 ? (now.getHours() * 60 + now.getMinutes()) / 1440 : 1;
    const mbps = skipped ? 0 : usageBase(speed!.download) * average * USAGE_SCALE * heaviness(customerId) * factor;
    points.push({ date, gb: (mbps * 86400 * share) / 8 / 1000 });
  }
  return points;
}

/** Consumo del mes en curso (desde el día 1 o el último reinicio de contadores). */
export function monthUsage(
  customerId: string,
  speed: Speed | null,
  options: { blockedAt?: string; since?: string } = {},
  now = new Date(),
): { download: number; upload: number } {
  const monthStart = `${now.toISOString().slice(0, 7)}-01`;
  const since = options.since && options.since > monthStart ? options.since : monthStart;
  const download = lastDays(customerId, speed, now.getDate(), { ...options, since }, now).reduce(
    (sum, day) => sum + day.gb,
    0,
  );
  return { download, upload: download * 0.12 };
}
