import { signal } from '@angular/core';

/*
 * Eventos del CRM que pueden notificarse a sistemas externos. Cualquier parte
 * del CRM los emite con `emitWebhookEvent` (sin inyectar nada, para no crear
 * ciclos); el almacén de webhooks los recoge y arma las entregas.
 */

export type WebhookEvent =
  | 'customer.created'
  | 'contract.created'
  | 'invoice.created'
  | 'invoice.paid'
  | 'payment.created'
  | 'ticket.created'
  | 'ticket.resolved'
  | 'network.blocked'
  | 'network.unblocked'
  | 'whatsapp.sent'
  | 'record.deleted';

export const WEBHOOK_EVENTS: ReadonlyArray<{ value: WebhookEvent; label: string; hint: string }> = [
  { value: 'payment.created', label: 'Pago registrado', hint: 'Importe, método, referencia y factura' },
  { value: 'invoice.paid', label: 'Factura pagada', hint: 'Cuando el saldo queda en cero' },
  { value: 'invoice.created', label: 'Factura creada', hint: 'Folio, cliente, total y vencimiento' },
  { value: 'customer.created', label: 'Cliente creado', hint: 'Datos de contacto del cliente nuevo' },
  { value: 'contract.created', label: 'Contrato creado', hint: 'Servicios y mensualidad' },
  { value: 'ticket.created', label: 'Ticket creado', hint: 'Asunto, prioridad y categoría' },
  { value: 'ticket.resolved', label: 'Ticket resuelto', hint: 'Al pasar a Resuelto o Cerrado' },
  { value: 'network.blocked', label: 'Internet bloqueado', hint: 'Cliente, IP y motivo (MikroTik)' },
  { value: 'network.unblocked', label: 'Internet desbloqueado', hint: 'Cliente e IP (MikroTik)' },
  { value: 'whatsapp.sent', label: 'WhatsApp enviado', hint: 'Plantilla y registro' },
  { value: 'record.deleted', label: 'Registro eliminado', hint: 'Módulo e id del registro' },
];

export interface EmittedEvent {
  readonly event: WebhookEvent;
  readonly data: Readonly<Record<string, unknown>>;
  readonly at: string;
}

/** Cola de eventos pendientes de convertirse en entregas. */
export const pendingWebhookEvents = signal<ReadonlyArray<EmittedEvent>>([]);

export function emitWebhookEvent(event: WebhookEvent, data: Readonly<Record<string, unknown>>): void {
  pendingWebhookEvents.update((queue) => [...queue, { event, data, at: new Date().toISOString() }]);
}
