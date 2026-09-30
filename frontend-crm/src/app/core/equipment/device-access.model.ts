/*
 * Acceso a equipos de red. Tres tipos de dato con distinta sensibilidad:
 *  - Valores de fábrica del MODELO (usuario e IP de fábrica): públicos, en el manual.
 *  - Acceso de administración de cada UNIDAD (IP de gestión, usuario, contraseña).
 *  - Redes WiFi del cliente instaladas en la unidad (nombre, banda, seguridad, contraseña).
 *
 * Las contraseñas nunca se guardan en el navegador: viven cifradas en el
 * servidor y se leen bajo demanda (ver CredentialVault). Aquí sólo hay datos
 * que no son secretos.
 */

export type WifiBand = '2.4' | '5' | 'dual' | 'guest';
export type WifiSecurity = 'WPA2' | 'WPA3' | 'WPA2/WPA3' | 'open';

export interface WifiNetwork {
  readonly id: string;
  readonly ssid: string;
  readonly band: WifiBand;
  readonly security: WifiSecurity;
  readonly enabled: boolean;
  /** Cuándo se definió la contraseña por última vez (el valor vive en el servidor). */
  readonly passwordChangedAt?: string;
}

export interface DeviceAccess {
  readonly equipmentId: string;
  readonly managementIp: string;
  readonly managementPort: number | null;
  readonly username: string;
  readonly firmware: string;
  /**
   * `false`: sigue con la contraseña de fábrica (riesgo: cualquiera con el
   * manual entra al equipo). `null`: no se ha verificado.
   */
  readonly factoryPasswordChanged: boolean | null;
  readonly passwordChangedAt?: string;
  /** El equipo se devolvió o reasignó: quien lo tuvo conoce sus credenciales. */
  readonly credentialsNeedRotation: boolean;
  /** El WiFi es del cliente anterior: hay que restablecerlo antes de reinstalar. */
  readonly wifiNeedsReset: boolean;
  readonly wifi: ReadonlyArray<WifiNetwork>;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

/** Valores de fábrica de un modelo: iguales en todas sus unidades. */
export interface ModelDefaults {
  readonly modelKey: string;
  readonly username: string;
  readonly ip: string;
  readonly note: string;
}

export const WIFI_BANDS: ReadonlyArray<{ value: WifiBand; label: string }> = [
  { value: '2.4', label: '2.4 GHz' },
  { value: '5', label: '5 GHz' },
  { value: 'dual', label: 'Doble banda' },
  { value: 'guest', label: 'Invitados' },
];

export const WIFI_SECURITY: ReadonlyArray<{ value: WifiSecurity; label: string }> = [
  { value: 'WPA2', label: 'WPA2' },
  { value: 'WPA3', label: 'WPA3' },
  { value: 'WPA2/WPA3', label: 'WPA2/WPA3 (mixto)' },
  { value: 'open', label: 'Abierta (sin contraseña)' },
];

export function emptyAccess(equipmentId: string): DeviceAccess {
  return {
    equipmentId,
    managementIp: '',
    managementPort: null,
    username: '',
    firmware: '',
    factoryPasswordChanged: null,
    credentialsNeedRotation: false,
    wifiNeedsReset: false,
    wifi: [],
    updatedAt: '',
    updatedBy: '',
  };
}

/**
 * Nombre legible del modelo. Los registros traen la marca y el modelo de
 * varias formas ("TP-Link · Archer C6", o marca "TP-Link" + modelo
 * "TP-Link Archer C6"): no se repite la marca si el modelo ya la incluye.
 */
export function modelLabelOf(record: Readonly<Record<string, unknown>>): string {
  const clean = (value: unknown) => String(value ?? '').replace(/·/g, ' ').replace(/\s+/g, ' ').trim();
  const brand = clean(record['brand']);
  const model = clean(record['model']);
  if (!model) return brand || clean(record['name']);
  return model.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase()) ? model : `${brand} ${model}`.trim();
}

/** Clave estable del modelo para sus valores de fábrica (sin mayúsculas ni separadores). */
export function modelKeyOf(record: Readonly<Record<string, unknown>>): string {
  return modelLabelOf(record).toLocaleLowerCase();
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.trim().split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && String(Number(part)) === part)
  );
}

/** Nombre de red: 1 a 32 bytes (UTF-8), como exige el estándar 802.11. */
export function ssidProblem(ssid: string): string | null {
  const bytes = new TextEncoder().encode(ssid).length;
  if (!ssid.trim()) return 'Escribe el nombre de la red.';
  if (bytes > 32) return 'El nombre de la red admite hasta 32 bytes (los acentos cuentan doble).';
  return null;
}

/**
 * Contraseña WPA2/WPA3: 8 a 63 caracteres. Se valida aquí aunque se guarde en
 * el servidor, para avisar antes de enviarla.
 */
export function wifiPasswordProblem(password: string): string | null {
  if (password.length < 8 || password.length > 63) return 'De 8 a 63 caracteres.';
  if (/^(12345678|password|00000000|11111111|admin123)$/i.test(password))
    return 'Es una contraseña muy común: elige otra.';
  return null;
}
