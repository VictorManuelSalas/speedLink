import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuditLog } from '../audit/audit-log';
import { runtimeConfig } from '../runtime-config';
import { EmittedEvent, WebhookEvent, WEBHOOK_EVENTS, pendingWebhookEvents } from './webhook-events';

/*
 * Conexiones personalizadas (cualquier API externa: UISP, ERP, contabilidad…)
 * y webhooks que avisan a esas APIs de lo que pasa en el CRM.
 *
 * El navegador no debe llamar a APIs de terceros con credenciales (quedarían
 * expuestas y casi siempre lo bloquea CORS): las entregas se preparan aquí y
 * quedan «en cola» hasta que el servidor las envíe con la llave guardada.
 * «Enviar prueba» sí hace un POST real desde el navegador, sin credenciales.
 */

export type AuthType = 'none' | 'api-key' | 'bearer' | 'basic';

export interface CustomConnection {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly auth: AuthType;
  /** Encabezado de la API key (p. ej. x-auth-token) o usuario de Basic. */
  readonly authName: string;
  readonly secretTail: string;
  readonly headers: ReadonlyArray<{ readonly name: string; readonly value: string }>;
  readonly enabled: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface Webhook {
  readonly id: string;
  readonly name: string;
  readonly event: WebhookEvent;
  /** Conexión personalizada (usa su URL base y autenticación) o vacía = URL completa. */
  readonly connectionId: string;
  /** Ruta sobre la conexión, o URL completa si no hay conexión. */
  readonly target: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedBy: string;
}

export type DeliveryStatus = 'queued' | 'sent' | 'failed';

export interface WebhookDelivery {
  readonly id: string;
  readonly webhookId: string;
  readonly webhookName: string;
  readonly event: WebhookEvent;
  readonly url: string;
  readonly payload: string;
  readonly status: DeliveryStatus;
  readonly detail: string;
  readonly at: string;
  readonly test?: boolean;
}

export type IntegrationResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

export interface ConnectionInput {
  readonly name: string;
  readonly baseUrl: string;
  readonly auth: AuthType;
  readonly authName: string;
  readonly headers: ReadonlyArray<{ readonly name: string; readonly value: string }>;
  readonly enabled: boolean;
}

export interface WebhookInput {
  readonly name: string;
  readonly event: WebhookEvent;
  readonly connectionId: string;
  readonly target: string;
  readonly enabled: boolean;
}

const CONNECTIONS_KEY = 'speedlink-custom-connections';
const WEBHOOKS_KEY = 'speedlink-webhooks';
const DELIVERIES_KEY = 'speedlink-webhook-deliveries';
const MAX_DELIVERIES = 300;
const SEED_DATE = '2026-09-01T10:00:00-06:00';

const SEED_CONNECTIONS: ReadonlyArray<CustomConnection> = [
  {
    id: 'cx-erp',
    name: 'ERP contable',
    baseUrl: 'https://erp.speedlink.mx/api',
    auth: 'bearer',
    authName: '',
    secretTail: 'demo',
    headers: [],
    enabled: true,
    updatedAt: SEED_DATE,
    updatedBy: 'Andrea Torres',
  },
];

const SEED_WEBHOOKS: ReadonlyArray<Webhook> = [
  {
    id: 'wh-erp-payments',
    name: 'Pagos al ERP',
    event: 'payment.created',
    connectionId: 'cx-erp',
    target: '/hooks/crm/payments',
    enabled: true,
    createdAt: SEED_DATE,
    updatedBy: 'Andrea Torres',
  },
];

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class IntegrationsStore {
  private readonly audit = inject(AuditLog);

  readonly connections = signal<ReadonlyArray<CustomConnection>>(this.read(CONNECTIONS_KEY, SEED_CONNECTIONS));
  readonly webhooks = signal<ReadonlyArray<Webhook>>(this.read(WEBHOOKS_KEY, SEED_WEBHOOKS));
  readonly deliveries = signal<ReadonlyArray<WebhookDelivery>>(this.read(DELIVERIES_KEY, []));
  /** Con servidor las entregas en cola las envía él; sin servidor se quedan esperando. */
  readonly hasServer = !!runtimeConfig().apiBaseUrl?.trim();

  readonly stats = computed(() => {
    const day = Date.now() - 86400_000;
    const recent = this.deliveries().filter((delivery) => new Date(delivery.at).getTime() >= day);
    return {
      active: this.webhooks().filter((hook) => hook.enabled).length,
      queued: this.deliveries().filter((delivery) => delivery.status === 'queued').length,
      last24h: recent.length,
      failed: recent.filter((delivery) => delivery.status === 'failed').length,
    };
  });

  constructor() {
    effect(() => this.persist(CONNECTIONS_KEY, this.connections()));
    effect(() => this.persist(WEBHOOKS_KEY, this.webhooks()));
    effect(() => this.persist(DELIVERIES_KEY, this.deliveries()));
    // Cada evento emitido se vuelve una entrega por cada webhook suscrito.
    effect(() => {
      const queue = pendingWebhookEvents();
      if (!queue.length) return;
      untracked(() => {
        pendingWebhookEvents.set([]);
        queue.forEach((event) => this.dispatch(event));
      });
    });
  }

  connection(id: string): CustomConnection | undefined {
    return this.connections().find((item) => item.id === id);
  }

  usage(connectionId: string): number {
    return this.webhooks().filter((hook) => hook.connectionId === connectionId).length;
  }

  urlOf(hook: Pick<Webhook, 'connectionId' | 'target'>): string {
    const connection = hook.connectionId ? this.connection(hook.connectionId) : undefined;
    if (!connection) return hook.target.trim();
    const path = hook.target.trim();
    return `${connection.baseUrl.replace(/\/+$/, '')}${path ? `/${path.replace(/^\/+/, '')}` : ''}`;
  }

  eventLabel(event: WebhookEvent): string {
    return WEBHOOK_EVENTS.find((item) => item.value === event)?.label ?? event;
  }

  // ─────────────────────────────────────────────────── Conexiones propias

  validateConnection(input: ConnectionInput, id?: string): Partial<Record<keyof ConnectionInput, string>> {
    const errors: Partial<Record<keyof ConnectionInput, string>> = {};
    if (input.name.trim().length < 3) errors.name = 'Escribe un nombre de al menos 3 caracteres.';
    else if (this.connections().some((item) => item.id !== id && item.name.trim().toLowerCase() === input.name.trim().toLowerCase()))
      errors.name = 'Ya hay una conexión con ese nombre.';
    if (!isUrl(input.baseUrl.trim())) errors.baseUrl = 'URL completa, p. ej. https://api.ejemplo.com/v1';
    else if (input.baseUrl.trim().startsWith('http:')) errors.baseUrl = 'Usa HTTPS: por HTTP la llave viajaría sin cifrar.';
    if ((input.auth === 'api-key' || input.auth === 'basic') && !input.authName.trim())
      errors.authName = input.auth === 'api-key' ? 'Nombre del encabezado, p. ej. x-auth-token.' : 'Usuario de la cuenta.';
    if (input.headers.some((header) => !/^[A-Za-z0-9-]+$/.test(header.name.trim())))
      errors.headers = 'Nombre de encabezado inválido (letras, números y guiones).';
    return errors;
  }

  saveConnection(input: ConnectionInput, secret: string, actor: string, id?: string): IntegrationResult<CustomConnection> {
    if (Object.keys(this.validateConnection(input, id)).length) return { ok: false, error: 'Revisa los campos marcados.' };
    const existing = id ? this.connection(id) : undefined;
    if (!existing && input.auth !== 'none' && !secret.trim())
      return { ok: false, error: 'Escribe la llave o contraseña de la API.' };
    const connection: CustomConnection = {
      id: existing?.id ?? `cx-${Date.now().toString(36)}`,
      name: input.name.trim(),
      baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
      auth: input.auth,
      authName: input.authName.trim(),
      headers: input.headers.filter((header) => header.name.trim()).map((header) => ({ name: header.name.trim(), value: header.value.trim() })),
      enabled: input.enabled,
      // La llave se enviará al servidor: aquí sólo quedan sus últimos 4 caracteres.
      secretTail: input.auth === 'none' ? '' : secret.trim() ? secret.trim().slice(-4) : (existing?.secretTail ?? ''),
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    this.connections.update((list) =>
      existing ? list.map((item) => (item.id === connection.id ? connection : item)) : [...list, connection],
    );
    this.audit.record('Configuración', existing ? 'Conexión personalizada editada' : 'Conexión personalizada creada', connection.name, `${connection.baseUrl} · ${connection.auth}${secret.trim() ? ' · llave nueva' : ''}`, 'warning');
    return { ok: true, value: connection };
  }

  removeConnection(id: string): IntegrationResult {
    const used = this.usage(id);
    if (used) return { ok: false, error: `La usan ${used} webhook(s): cámbialos o elimínalos primero.` };
    const connection = this.connection(id);
    this.connections.update((list) => list.filter((item) => item.id !== id));
    this.audit.record('Configuración', 'Conexión personalizada eliminada', connection?.name ?? id, '', 'critical');
    return { ok: true, value: undefined };
  }

  // ──────────────────────────────────────────────────────────── Webhooks

  validateWebhook(input: WebhookInput): Partial<Record<keyof WebhookInput, string>> {
    const errors: Partial<Record<keyof WebhookInput, string>> = {};
    if (input.name.trim().length < 3) errors.name = 'Escribe un nombre.';
    if (input.connectionId) {
      if (!this.connection(input.connectionId)) errors.connectionId = 'Elige una conexión existente.';
      if (input.target.trim() && !/^\/?[\w\-./{}?=&]*$/.test(input.target.trim())) errors.target = 'Ruta inválida, p. ej. /hooks/pagos';
    } else if (!isUrl(input.target.trim())) errors.target = 'URL completa del endpoint, p. ej. https://hooks.ejemplo.com/crm';
    return errors;
  }

  saveWebhook(input: WebhookInput, actor: string, id?: string): IntegrationResult<Webhook> {
    if (Object.keys(this.validateWebhook(input)).length) return { ok: false, error: 'Revisa los campos marcados.' };
    const existing = id ? this.webhooks().find((hook) => hook.id === id) : undefined;
    const hook: Webhook = {
      id: existing?.id ?? `wh-${Date.now().toString(36)}`,
      name: input.name.trim(),
      event: input.event,
      connectionId: input.connectionId,
      target: input.target.trim(),
      enabled: input.enabled,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedBy: actor,
    };
    this.webhooks.update((list) => (existing ? list.map((item) => (item.id === hook.id ? hook : item)) : [...list, hook]));
    this.audit.record('Configuración', existing ? 'Webhook editado' : 'Webhook creado', hook.name, `${this.eventLabel(hook.event)} → ${this.urlOf(hook)}`);
    return { ok: true, value: hook };
  }

  removeWebhook(id: string): void {
    const hook = this.webhooks().find((item) => item.id === id);
    this.webhooks.update((list) => list.filter((item) => item.id !== id));
    this.audit.record('Configuración', 'Webhook eliminado', hook?.name ?? id, '', 'warning');
  }

  toggleWebhook(id: string, actor: string): void {
    this.webhooks.update((list) => list.map((hook) => (hook.id === id ? { ...hook, enabled: !hook.enabled, updatedBy: actor } : hook)));
  }

  /** POST real desde el navegador con un evento de ejemplo (sin credenciales). */
  async sendTest(id: string): Promise<WebhookDelivery | null> {
    const hook = this.webhooks().find((item) => item.id === id);
    if (!hook) return null;
    const payload = this.payload(hook.event, { id: 'EJEMPLO-001', ejemplo: true }, new Date().toISOString());
    const url = this.urlOf(hook);
    let status: DeliveryStatus = 'failed';
    let detail = '';
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SpeedLink-Event': hook.event },
        body: payload,
        signal: controller.signal,
      });
      status = response.ok ? 'sent' : 'failed';
      detail = `HTTP ${response.status}`;
    } catch {
      detail = 'Sin respuesta: el destino no está en línea o no permite llamadas desde el navegador (CORS).';
    } finally {
      window.clearTimeout(timer);
    }
    return this.addDelivery(hook, payload, url, status, detail, true);
  }

  /** Marca como reenviables las entregas fallidas o en cola (las toma el servidor). */
  requeue(id: string): void {
    this.deliveries.update((list) =>
      list.map((delivery) => (delivery.id === id ? { ...delivery, status: 'queued', detail: 'Reencolada' } : delivery)),
    );
  }

  private dispatch(emitted: EmittedEvent): void {
    const hooks = this.webhooks().filter((hook) => hook.enabled && hook.event === emitted.event);
    for (const hook of hooks) {
      const connection = hook.connectionId ? this.connection(hook.connectionId) : undefined;
      if (connection && !connection.enabled) continue;
      this.addDelivery(
        hook,
        this.payload(emitted.event, emitted.data, emitted.at),
        this.urlOf(hook),
        'queued',
        this.hasServer ? 'En cola en el servidor' : 'En cola: se enviará cuando el CRM tenga servidor',
      );
    }
  }

  private payload(event: WebhookEvent, data: Readonly<Record<string, unknown>>, at: string): string {
    return JSON.stringify({ event, occurredAt: at, source: 'speedlink-crm', data }, null, 2);
  }

  private addDelivery(
    hook: Webhook,
    payload: string,
    url: string,
    status: DeliveryStatus,
    detail: string,
    test = false,
  ): WebhookDelivery {
    const delivery: WebhookDelivery = {
      id: `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      webhookId: hook.id,
      webhookName: hook.name,
      event: hook.event,
      url,
      payload,
      status,
      detail,
      at: new Date().toISOString(),
      test,
    };
    this.deliveries.update((list) => [delivery, ...list].slice(0, MAX_DELIVERIES));
    return delivery;
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
