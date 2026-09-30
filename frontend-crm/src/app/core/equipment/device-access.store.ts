import { Injectable, effect, signal } from '@angular/core';
import {
  DeviceAccess,
  ModelDefaults,
  WifiBand,
  WifiNetwork,
  WifiSecurity,
  emptyAccess,
  isValidIpv4,
  ssidProblem,
} from './device-access.model';
import { DEMO_DEVICE_ACCESS } from '../data-access/demo-fixtures';

const ACCESS_KEY = 'speedlink-device-access';
const DEFAULTS_KEY = 'speedlink-device-model-defaults';

/** Valores de fábrica conocidos de los modelos del inventario de demostración. */
const SEED_DEFAULTS: ReadonlyArray<ModelDefaults> = [
  { modelKey: 'tp-link archer c6', username: 'admin', ip: '192.168.0.1', note: 'Contraseña en la etiqueta inferior.' },
  { modelKey: 'ubiquiti litebeam 5ac', username: 'ubnt', ip: '192.168.1.20', note: 'AirOS pide cambiarla al primer acceso.' },
  { modelKey: 'mikrotik cap ac', username: 'admin', ip: '192.168.88.1', note: 'RouterOS 7: contraseña en la etiqueta.' },
];

export type AccessResult<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): AccessResult<T> => ({ ok: true, value });
const fail = <T = never>(error: string): AccessResult<T> => ({ ok: false, error });

export interface AdminAccessInput {
  readonly managementIp: string;
  readonly managementPort: number | null;
  readonly username: string;
  readonly firmware: string;
}

export interface WifiInput {
  readonly ssid: string;
  readonly band: WifiBand;
  readonly security: WifiSecurity;
  readonly enabled: boolean;
}

/**
 * Datos de acceso de los equipos que NO son secretos. Las contraseñas las
 * guarda el servidor (CredentialVault); aquí sólo se registra si se cambiaron.
 */
@Injectable({ providedIn: 'root' })
export class DeviceAccessStore {
  /** Lo guardado tiene prioridad; los equipos de demostración se agregan si faltan. */
  readonly records = signal<Readonly<Record<string, DeviceAccess>>>({
    ...DEMO_DEVICE_ACCESS,
    ...this.read(ACCESS_KEY, {}),
  });
  readonly defaults = signal<ReadonlyArray<ModelDefaults>>(
    // Las claves se normalizan al leer: versiones anteriores las guardaban con "·".
    this.read(DEFAULTS_KEY, SEED_DEFAULTS).map((item) => ({
      ...item,
      modelKey: item.modelKey.replace(/·/g, ' ').replace(/\s+/g, ' ').trim(),
    })),
  );

  constructor() {
    effect(() => this.persist(ACCESS_KEY, this.records()));
    effect(() => this.persist(DEFAULTS_KEY, this.defaults()));
  }

  access(equipmentId: string): DeviceAccess {
    return this.records()[equipmentId] ?? emptyAccess(equipmentId);
  }

  modelDefaults(modelKey: string): ModelDefaults | undefined {
    return this.defaults().find((item) => item.modelKey === modelKey);
  }

  /** Otra unidad que ya usa esa IP de gestión (dos equipos con la misma IP chocan en la red). */
  ipConflict(ip: string, exceptId: string): string | undefined {
    const wanted = ip.trim();
    if (!wanted) return undefined;
    return Object.values(this.records()).find(
      (access) => access.equipmentId !== exceptId && access.managementIp === wanted,
    )?.equipmentId;
  }

  saveAdmin(equipmentId: string, input: AdminAccessInput, actor: string): AccessResult<DeviceAccess> {
    const ip = input.managementIp.trim();
    if (ip && !isValidIpv4(ip)) return fail('IP inválida: cuatro números de 0 a 255, p. ej. 10.20.30.40');
    const conflict = this.ipConflict(ip, equipmentId);
    if (conflict) return fail(`La IP ${ip} ya la usa el equipo ${conflict}.`);
    if (
      input.managementPort !== null &&
      (!Number.isInteger(input.managementPort) || input.managementPort < 1 || input.managementPort > 65535)
    )
      return fail('Puerto entre 1 y 65535.');
    if (input.username.length > 64) return fail('El usuario admite hasta 64 caracteres.');
    return ok(
      this.write(equipmentId, actor, {
        managementIp: ip,
        managementPort: input.managementPort,
        username: input.username.trim(),
        firmware: input.firmware.trim(),
      }),
    );
  }

  /** Confirma si la contraseña de fábrica ya se cambió en el equipo. */
  setFactoryPasswordChanged(equipmentId: string, changed: boolean, actor: string): void {
    this.write(equipmentId, actor, {
      factoryPasswordChanged: changed,
      passwordChangedAt: changed ? new Date().toISOString() : undefined,
      // Cambiar la contraseña también resuelve la rotación pendiente.
      ...(changed ? { credentialsNeedRotation: false } : {}),
    });
  }

  clearRotation(equipmentId: string, actor: string): void {
    this.write(equipmentId, actor, {
      credentialsNeedRotation: false,
      passwordChangedAt: new Date().toISOString(),
    });
  }

  clearWifiReset(equipmentId: string, actor: string): void {
    this.write(equipmentId, actor, { wifiNeedsReset: false });
  }

  /**
   * Al devolverse o reasignarse, el equipo pasó por manos de otro cliente o
   * técnico: se marca para cambiar credenciales y restablecer el WiFi.
   */
  markReturned(equipmentId: string, actor: string): void {
    const current = this.access(equipmentId);
    this.write(equipmentId, actor, {
      credentialsNeedRotation: true,
      wifiNeedsReset: current.wifi.length > 0 || current.wifiNeedsReset,
    });
  }

  saveNetwork(
    equipmentId: string,
    input: WifiInput,
    actor: string,
    networkId?: string,
  ): AccessResult<WifiNetwork> {
    const invalid = ssidProblem(input.ssid);
    if (invalid) return fail(invalid);
    const current = this.access(equipmentId);
    if (
      current.wifi.some(
        (network) => network.id !== networkId && network.ssid === input.ssid.trim() && network.band === input.band,
      )
    )
      return fail('El equipo ya tiene una red con ese nombre en esa banda.');
    if (!networkId && current.wifi.length >= 6) return fail('Un equipo admite hasta 6 redes.');
    const existing = current.wifi.find((network) => network.id === networkId);
    const network: WifiNetwork = {
      ...existing,
      id: networkId ?? `wifi-${crypto.randomUUID?.() ?? Date.now()}`,
      ssid: input.ssid.trim(),
      band: input.band,
      security: input.security,
      enabled: input.enabled,
    };
    this.write(equipmentId, actor, {
      wifi: existing
        ? current.wifi.map((item) => (item.id === networkId ? network : item))
        : [...current.wifi, network],
    });
    return ok(network);
  }

  removeNetwork(equipmentId: string, networkId: string, actor: string): void {
    const current = this.access(equipmentId);
    this.write(equipmentId, actor, { wifi: current.wifi.filter((network) => network.id !== networkId) });
  }

  saveDefaults(input: ModelDefaults): AccessResult<ModelDefaults> {
    if (input.ip && !isValidIpv4(input.ip)) return fail('IP de fábrica inválida.');
    const clean: ModelDefaults = {
      modelKey: input.modelKey,
      username: input.username.trim(),
      ip: input.ip.trim(),
      note: input.note.trim().slice(0, 200),
    };
    this.defaults.update((defaults) =>
      defaults.some((item) => item.modelKey === clean.modelKey)
        ? defaults.map((item) => (item.modelKey === clean.modelKey ? clean : item))
        : [...defaults, clean],
    );
    return ok(clean);
  }

  private write(equipmentId: string, actor: string, patch: Partial<DeviceAccess>): DeviceAccess {
    const next: DeviceAccess = {
      ...this.access(equipmentId),
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    this.records.update((records) => ({ ...records, [equipmentId]: next }));
    return next;
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
