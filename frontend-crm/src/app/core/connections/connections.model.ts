import { signal } from '@angular/core';
import { runtimeConfig } from '../runtime-config';

/*
 * Conexiones con servicios externos. Sólo se listan las que el CRM usa o va a
 * usar de verdad; cada una dice en qué pantallas se nota.
 */

export type ConnectionKey = 'google-maps' | 'speedlink-api' | 'whatsapp' | 'payments' | 'cfdi' | 'mikrotik';

/**
 * - `active`: funcionando.
 * - `demo`: el CRM trabaja con datos de demostración en su lugar.
 * - `pending-server`: configurada, pero necesita el servidor para operar.
 * - `incomplete`: activada con datos faltantes o inválidos.
 * - `disabled`: sin configurar o apagada.
 */
export type ConnectionStatus = 'active' | 'demo' | 'pending-server' | 'incomplete' | 'disabled';

export type PaymentProvider = 'conekta' | 'mercadopago' | 'openpay' | 'stripe';
export type CfdiProvider = 'facturama' | 'facturapi' | 'sw';
export type ConnectionMode = 'sandbox' | 'production';

interface Audit {
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface MapsConfig extends Audit {
  /** Llave capturada en Ajustes; si está vacía se usa la del despliegue (runtime-config.js). */
  readonly apiKey: string;
}

export interface WhatsappConfig extends Audit {
  /** Lada que se antepone a los números de 10 dígitos (52 = México). */
  readonly countryCode: string;
}

/** La llave privada nunca se guarda en el navegador: sólo sus últimos 4 caracteres. */
export interface SecretMark {
  readonly secretTail: string;
  readonly secretSetAt: string;
}

export interface PaymentsConfig extends Audit, SecretMark {
  readonly enabled: boolean;
  readonly provider: PaymentProvider;
  readonly mode: ConnectionMode;
  readonly publicKey: string;
}

export interface CfdiConfig extends Audit, SecretMark {
  readonly enabled: boolean;
  readonly provider: CfdiProvider;
  readonly mode: ConnectionMode;
  readonly username: string;
}

export interface ConnectionsState {
  readonly maps: MapsConfig;
  readonly whatsapp: WhatsappConfig;
  readonly payments: PaymentsConfig;
  readonly cfdi: CfdiConfig;
}

export const PAYMENT_PROVIDERS: ReadonlyArray<{
  value: PaymentProvider;
  label: string;
  publicLabel: string;
  secretLabel: string;
  /** Prefijo de la llave pública según el modo, cuando el proveedor lo distingue. */
  prefixes?: Readonly<Record<ConnectionMode, string>>;
}> = [
  { value: 'conekta', label: 'Conekta', publicLabel: 'Llave pública', secretLabel: 'Llave privada', prefixes: { sandbox: 'key_', production: 'key_' } },
  { value: 'mercadopago', label: 'Mercado Pago', publicLabel: 'Public key', secretLabel: 'Access token', prefixes: { sandbox: 'TEST-', production: 'APP_USR-' } },
  { value: 'openpay', label: 'Openpay (BBVA)', publicLabel: 'Llave pública', secretLabel: 'Llave privada', prefixes: { sandbox: 'pk_', production: 'pk_' } },
  { value: 'stripe', label: 'Stripe', publicLabel: 'Publishable key', secretLabel: 'Secret key', prefixes: { sandbox: 'pk_test_', production: 'pk_live_' } },
];

export const CFDI_PROVIDERS: ReadonlyArray<{ value: CfdiProvider; label: string; userLabel: string; secretLabel: string }> = [
  { value: 'facturama', label: 'Facturama', userLabel: 'Usuario API', secretLabel: 'Contraseña API' },
  { value: 'facturapi', label: 'Facturapi', userLabel: 'ID de organización', secretLabel: 'Llave secreta' },
  { value: 'sw', label: 'SW Sapien', userLabel: 'Usuario', secretLabel: 'Token' },
];

export const MAPS_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/;

// ── Valores vivos que leen otras pantallas sin inyectar el store ──────────────

const liveMapsKey = signal('');
const liveCountryCode = signal('52');

export function setLiveConnections(state: ConnectionsState): void {
  liveMapsKey.set(state.maps.apiKey.trim());
  liveCountryCode.set(state.whatsapp.countryCode || '52');
}

/** Llave de Google Maps vigente: la de Ajustes o, si no hay, la del despliegue. */
export function googleMapsApiKey(): string {
  return liveMapsKey() || runtimeConfig().googleMapsApiKey?.trim() || '';
}

/**
 * Número listo para wa.me: sólo dígitos y con lada de país. Los teléfonos del
 * CRM se capturan a 10 dígitos (8715084696) y wa.me sin lada abre un chat
 * con un número inexistente.
 */
export function whatsappNumber(phone: unknown): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `${liveCountryCode()}${digits}` : digits;
}

export function whatsappLink(phone: unknown, text?: string): string {
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${whatsappNumber(phone)}${query}`;
}
