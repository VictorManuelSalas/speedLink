import { Injectable, effect, inject, signal } from '@angular/core';
import { SessionContext } from '../auth/session-context';
import { whatsappLink, whatsappNumber } from '../connections/connections.model';
import { TemplateStore } from '../data-access/templates/template-store';
import { TemplateModule } from '../data-access/templates/template.model';
import { ORGANIZATION } from '../organization/organization.model';
import { OperationalStore } from '../../features/operations/operational-store';
import { MessageContext } from './message-context';
import { emitWebhookEvent } from '../integrations/webhook-events';

/*
 * Envíos por WhatsApp en modo manual (wa.me): el CRM arma el mensaje con la
 * plantilla y abre el chat del cliente; quien envía revisa y toca «Enviar».
 * No hay API de Meta de por medio, así que no hay límites ni costo por
 * mensaje, pero tampoco confirmación de entrega: se registra que se abrió.
 */

export interface WhatsappMessage {
  /** Plantilla de Ajustes › Plantillas (canal WhatsApp). */
  readonly templateId: string;
  readonly module: TemplateModule;
  /** Datos para las variables de la plantilla. */
  readonly record: Readonly<Record<string, unknown>>;
  readonly phone: unknown;
  /** Registro en cuya actividad queda el envío (factura, pago, ticket…). */
  readonly recordId: string;
  /** Cliente al que también se le registra, si es otro registro. */
  readonly customerId?: string;
  /** Texto si la plantilla no existe o está en borrador. */
  readonly fallback: string;
  /**
   * Enlace de descarga que el mensaje debe llevar sí o sí. Si la plantilla
   * (quizá editada) no lo incluye, se agrega al final con esta etiqueta.
   */
  readonly attachLink?: { readonly label: string; readonly url: string };
  /** Documento del registro: se agrega si la plantilla tiene «Incluir enlace de descarga». */
  readonly document?: { readonly label: string; readonly url: string };
}

export interface WhatsappLogEntry {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly templateId: string;
  readonly templateName: string;
  readonly recordId: string;
  readonly customerId?: string;
}

const LOG_KEY = 'speedlink-whatsapp-log';
const MAX_LOG = 500;

@Injectable({ providedIn: 'root' })
export class WhatsappSender {
  private readonly templates = inject(TemplateStore);
  private readonly ops = inject(OperationalStore);
  private readonly session = inject(SessionContext);
  private readonly context = inject(MessageContext);

  readonly log = signal<ReadonlyArray<WhatsappLogEntry>>(this.read());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(LOG_KEY, JSON.stringify(this.log()));
      } catch {
        // Sin almacenamiento el registro dura sólo esta sesión.
      }
    });
  }

  /** Texto final, con las variables ya sustituidas. */
  text(message: WhatsappMessage): string {
    const text = this.rendered(message);
    const template = this.templates.find(message.templateId);
    const link = message.attachLink ?? (template?.attachDocument ? message.document : undefined);
    return link && !text.includes(link.url) ? `${text.trimEnd()}\n\n${link.label}: ${link.url}` : text;
  }

  /** Mensaje de una plantilla para un registro de cualquier módulo. */
  fromRecord(module: TemplateModule, record: Readonly<Record<string, unknown>>, templateId: string): WhatsappMessage {
    const context = this.context.build(module, record);
    return {
      templateId,
      module,
      record: context.data,
      phone: context.phone,
      recordId: String(record['id'] ?? ''),
      customerId: context.customerId,
      document: context.document,
      fallback: '',
    };
  }

  private rendered(message: WhatsappMessage): string {
    const template = this.templates.forFeature(message.templateId, message.module, 'whatsapp');
    if (!template) return message.fallback;
    return this.templates.render(template, {
      record: message.record,
      organization: ORGANIZATION,
      userName: this.actor(),
      formatMoney: (value) =>
        new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(
          Number(value) || 0,
        ),
      formatDate: (value) => {
        // «2026-10-01» sin hora se leería como medianoche UTC: el día anterior en México.
        const raw = String(value ?? '');
        const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
        return Number.isNaN(date.getTime())
          ? ''
          : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
      },
    }).body;
  }

  /** ¿Hay un número al que mandar? */
  hasPhone(phone: unknown): boolean {
    return whatsappNumber(phone).length >= 10;
  }

  /** Abre el chat con el mensaje listo y deja registro. Llamar desde un clic. */
  open(message: WhatsappMessage): void {
    const text = this.text(message);
    window.open(whatsappLink(message.phone, text), '_blank', 'noopener');
    const template = this.templates.find(message.templateId);
    const name = template?.name ?? 'Mensaje';
    const entry: WhatsappLogEntry = {
      id: `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      actor: this.actor(),
      templateId: message.templateId,
      templateName: name,
      recordId: message.recordId,
      customerId: message.customerId,
    };
    this.log.update((log) => [entry, ...log].slice(0, MAX_LOG));
    emitWebhookEvent('whatsapp.sent', { template: name, recordId: message.recordId, customerId: message.customerId ?? null });
    // Queda en la actividad del registro con el texto y el número; la ficha del
    // cliente lo muestra por la relación, sin duplicarlo.
    this.ops.logActivity(message.recordId, 'WhatsApp enviado', name, 'green', 'WhatsApp', 'CREATE', {
      channel: 'whatsapp',
      message: text,
      phone: `+${whatsappNumber(message.phone)}`,
    });
  }

  /** Último envío de un registro (opcionalmente de una plantilla), para no repetirlo. */
  last(recordId: string, templateId?: string): WhatsappLogEntry | undefined {
    return this.log().find(
      (entry) =>
        (entry.recordId === recordId || entry.customerId === recordId) && (!templateId || entry.templateId === templateId),
    );
  }

  private actor(): string {
    return this.session.user()?.name ?? 'SpeedLink';
  }

  private read(): ReadonlyArray<WhatsappLogEntry> {
    try {
      const stored = JSON.parse(localStorage.getItem(LOG_KEY) ?? 'null');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }
}
