import { Injectable, computed, effect, signal } from '@angular/core';
import { runtimeConfig } from '../runtime-config';
import { currentOrganization, isValidRfc } from '../organization/organization.model';
import {
  CFDI_PROVIDERS,
  CfdiConfig,
  ConnectionKey,
  ConnectionStatus,
  ConnectionsState,
  MAPS_KEY_PATTERN,
  PAYMENT_PROVIDERS,
  PaymentsConfig,
  googleMapsApiKey,
  setLiveConnections,
} from './connections.model';

const STORAGE_KEY = 'speedlink-connections';
const SEED_DATE = '2026-01-12T09:30:00-06:00';
const SEED_BY = 'Andrea Torres';

const SEED: ConnectionsState = {
  maps: { apiKey: '', updatedAt: SEED_DATE, updatedBy: SEED_BY },
  whatsapp: { countryCode: '52', updatedAt: SEED_DATE, updatedBy: SEED_BY },
  payments: {
    enabled: false,
    provider: 'conekta',
    mode: 'sandbox',
    publicKey: '',
    secretTail: '',
    secretSetAt: '',
    updatedAt: SEED_DATE,
    updatedBy: SEED_BY,
  },
  cfdi: {
    enabled: false,
    provider: 'facturama',
    mode: 'sandbox',
    username: '',
    secretTail: '',
    secretSetAt: '',
    updatedAt: SEED_DATE,
    updatedBy: SEED_BY,
  },
};

export type PaymentsInput = Pick<PaymentsConfig, 'enabled' | 'provider' | 'mode' | 'publicKey'>;
export type CfdiInput = Pick<CfdiConfig, 'enabled' | 'provider' | 'mode' | 'username'>;
export type ConnectionErrors = Partial<Record<string, string>>;
export type ConnectionResult = { ok: true } | { ok: false; error: string };

export interface ApiTestResult {
  readonly ok: boolean;
  readonly message: string;
}

@Injectable({ providedIn: 'root' })
export class ConnectionsStore {
  readonly state = signal<ConnectionsState>(this.read());

  /** Dirección del servidor: se fija al desplegar (runtime-config.js), no desde Ajustes. */
  readonly apiBaseUrl = (runtimeConfig().apiBaseUrl ?? '').trim();
  readonly deployedMapsKey = (runtimeConfig().googleMapsApiKey ?? '').trim();

  readonly statuses = computed<Readonly<Record<ConnectionKey, ConnectionStatus>>>(() => {
    const state = this.state();
    return {
      'google-maps': this.mapsKey() ? 'active' : 'disabled',
      'speedlink-api': this.apiBaseUrl ? 'active' : 'demo',
      // Los enlaces wa.me no necesitan cuenta: siempre están disponibles.
      whatsapp: 'active',
      payments: this.integrationStatus(state.payments.enabled, this.validatePayments(state.payments, false)),
      cfdi: this.integrationStatus(state.cfdi.enabled, this.validateCfdi(state.cfdi, false)),
    };
  });

  constructor() {
    setLiveConnections(this.state());
    effect(() => {
      const state = this.state();
      setLiveConnections(state);
      this.persist(state);
    });
  }

  /** Llave que usan los mapas ahora mismo. */
  mapsKey(): string {
    this.state();
    return googleMapsApiKey();
  }

  // ─────────────────────────────────────────────────────────── Google Maps

  validateMapsKey(key: string): string | undefined {
    const clean = key.trim();
    if (!clean) return undefined;
    return MAPS_KEY_PATTERN.test(clean)
      ? undefined
      : 'Una API key de Google empieza con «AIza» y tiene 39 caracteres.';
  }

  /** Vacío vuelve a la llave del despliegue. */
  saveMapsKey(key: string, actor: string): ConnectionResult {
    const error = this.validateMapsKey(key);
    if (error) return { ok: false, error };
    this.state.update((state) => ({ ...state, maps: { apiKey: key.trim(), ...this.audit(actor) } }));
    return { ok: true };
  }

  // ────────────────────────────────────────────────────────────── WhatsApp

  validateCountryCode(code: string): string | undefined {
    return /^[1-9]\d{0,2}$/.test(code.trim()) ? undefined : 'Lada de país de 1 a 3 dígitos, sin «+» (México: 52).';
  }

  saveWhatsapp(countryCode: string, actor: string): ConnectionResult {
    const error = this.validateCountryCode(countryCode);
    if (error) return { ok: false, error };
    this.state.update((state) => ({
      ...state,
      whatsapp: { countryCode: countryCode.trim(), ...this.audit(actor) },
    }));
    return { ok: true };
  }

  // ──────────────────────────────────────────────────────── Pagos en línea

  /** `newSecret`: si viene, reemplaza la llave privada; vacío conserva la registrada. */
  validatePayments(input: PaymentsInput, checkSecret = true, newSecret = ''): ConnectionErrors {
    const errors: ConnectionErrors = {};
    const provider = PAYMENT_PROVIDERS.find((item) => item.value === input.provider);
    const key = input.publicKey.trim();
    const prefix = provider?.prefixes?.[input.mode];
    if (key.length < 12) errors['publicKey'] = `Escribe la ${provider?.publicLabel.toLowerCase() ?? 'llave pública'}.`;
    else if (prefix && !key.startsWith(prefix))
      errors['publicKey'] =
        `En modo ${input.mode === 'sandbox' ? 'de pruebas' : 'producción'} la llave de ${provider?.label} empieza con «${prefix}».`;
    const hasSecret = newSecret.trim().length > 0 || !!this.state().payments.secretTail;
    if (!hasSecret) errors['secret'] = `Falta la ${provider?.secretLabel.toLowerCase() ?? 'llave privada'}.`;
    else if (checkSecret && newSecret && newSecret.trim().length < 12) errors['secret'] = 'La llave es demasiado corta.';
    return errors;
  }

  savePayments(input: PaymentsInput, newSecret: string, actor: string): ConnectionResult {
    const clean: PaymentsInput = { ...input, publicKey: input.publicKey.trim() };
    // Apagada se puede guardar a medias; encendida debe estar completa.
    if (clean.enabled && Object.keys(this.validatePayments(clean, true, newSecret)).length)
      return { ok: false, error: 'Revisa los campos marcados.' };
    this.state.update((state) => ({
      ...state,
      payments: { ...state.payments, ...clean, ...this.secretMark(newSecret, state.payments), ...this.audit(actor) },
    }));
    return { ok: true };
  }

  // ──────────────────────────────────────────────────────── Timbrado CFDI

  validateCfdi(input: CfdiInput, checkSecret = true, newSecret = ''): ConnectionErrors {
    const errors: ConnectionErrors = {};
    const provider = CFDI_PROVIDERS.find((item) => item.value === input.provider);
    if (input.username.trim().length < 3) errors['username'] = `Escribe el ${provider?.userLabel.toLowerCase() ?? 'usuario'}.`;
    const hasSecret = newSecret.trim().length > 0 || !!this.state().cfdi.secretTail;
    if (!hasSecret) errors['secret'] = `Falta la ${provider?.secretLabel.toLowerCase() ?? 'contraseña'}.`;
    else if (checkSecret && newSecret && newSecret.trim().length < 6) errors['secret'] = 'Demasiado corta.';
    errors['organization'] = this.fiscalProblems().join(' ') || undefined;
    if (!errors['organization']) delete errors['organization'];
    return errors;
  }

  saveCfdi(input: CfdiInput, newSecret: string, actor: string): ConnectionResult {
    const clean: CfdiInput = { ...input, username: input.username.trim() };
    if (clean.enabled && Object.keys(this.validateCfdi(clean, true, newSecret)).length)
      return { ok: false, error: 'Revisa los campos marcados.' };
    this.state.update((state) => ({
      ...state,
      cfdi: { ...state.cfdi, ...clean, ...this.secretMark(newSecret, state.cfdi), ...this.audit(actor) },
    }));
    return { ok: true };
  }

  /** Datos del emisor que exige el CFDI 4.0 y que viven en Ajustes › Organización. */
  fiscalProblems(): string[] {
    const profile = currentOrganization();
    const problems: string[] = [];
    if (!isValidRfc(profile.rfc)) problems.push('Falta un RFC válido.');
    if (!profile.legalName.trim()) problems.push('Falta la razón social.');
    if (!profile.taxRegime) problems.push('Falta el régimen fiscal.');
    if (!/^\d{5}$/.test(profile.fiscalPostalCode)) problems.push('Falta el código postal fiscal.');
    return problems;
  }

  /** Apaga la integración y olvida la llave privada registrada. */
  disconnect(key: 'payments' | 'cfdi', actor: string): void {
    this.state.update((state) => ({
      ...state,
      [key]: { ...state[key], enabled: false, secretTail: '', secretSetAt: '', ...this.audit(actor) },
    }));
  }

  // ─────────────────────────────────────────────────────── Servidor (API)

  /** Llama al servidor configurado y dice si respondió. Sin servidor no hay nada que probar. */
  async testApi(): Promise<ApiTestResult> {
    if (!this.apiBaseUrl) return { ok: false, message: 'No hay servidor configurado: el CRM usa datos de demostración.' };
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    const started = performance.now();
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/v1/tickets?limit=1`, { signal: controller.signal });
      const ms = Math.round(performance.now() - started);
      return response.ok
        ? { ok: true, message: `Respondió en ${ms} ms (HTTP ${response.status}).` }
        : { ok: false, message: `El servidor respondió con error HTTP ${response.status}.` };
    } catch {
      return { ok: false, message: 'Sin respuesta en 8 s: revisa la dirección, el CORS o que el servidor esté en línea.' };
    } finally {
      window.clearTimeout(timer);
    }
  }

  // ─────────────────────────────────────────────────────────────── Interno

  private integrationStatus(enabled: boolean, errors: ConnectionErrors): ConnectionStatus {
    if (!enabled) return 'disabled';
    if (Object.keys(errors).length) return 'incomplete';
    return this.apiBaseUrl ? 'active' : 'pending-server';
  }

  private secretMark(newSecret: string, current: { secretTail: string; secretSetAt: string }) {
    const secret = newSecret.trim();
    return secret
      ? { secretTail: secret.slice(-4), secretSetAt: new Date().toISOString() }
      : { secretTail: current.secretTail, secretSetAt: current.secretSetAt };
  }

  private audit(actor: string) {
    return { updatedAt: new Date().toISOString(), updatedBy: actor };
  }

  private read(): ConnectionsState {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ConnectionsState> | null;
      if (!stored) return SEED;
      return {
        maps: { ...SEED.maps, ...stored.maps },
        whatsapp: { ...SEED.whatsapp, ...stored.whatsapp },
        payments: { ...SEED.payments, ...stored.payments },
        cfdi: { ...SEED.cfdi, ...stored.cfdi },
      };
    } catch {
      return SEED;
    }
  }

  private persist(state: ConnectionsState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Sin almacenamiento los cambios duran sólo esta sesión.
    }
  }
}
