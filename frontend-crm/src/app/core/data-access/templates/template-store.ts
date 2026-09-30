import { Injectable, computed, effect, signal } from '@angular/core';
import {
  CrmTemplate,
  RenderContext,
  TemplateChannel,
  TemplateModule,
  htmlToText,
  mergeFieldGroups,
  renderTemplateText,
  tokensIn,
} from './template.model';

const STORAGE_KEY = 'speedlink-templates';

/**
 * Plantillas que usa una función del CRM por su id. Se pueden editar, pero no
 * eliminar ni dejar en borrador sin aviso: la función se quedaría sin texto.
 */
export const SYSTEM_TEMPLATE_USAGE: Readonly<Record<string, string>> = {
  'tpl-contract-send': 'Contratos › Enviar por correo',
  'tpl-contract-whatsapp': 'Contratos › Enviar por WhatsApp',
  'tpl-customer-portal-invite': 'Clientes › Invite Portal por correo',
  'tpl-customer-portal-whatsapp': 'Clientes › Invite Portal por WhatsApp',
  'tpl-wifi-changed': 'Equipamiento › Avisar cambio de WiFi',
};

export type TemplateResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

const SEED: ReadonlyArray<CrmTemplate> = [
  {
    id: 'tpl-contract-send',
    name: 'Envío de contrato',
    channel: 'email',
    module: 'contracts',
    format: 'text',
    subject: 'Tu contrato de servicio ${contract.number} · ${org.name}',
    body: [
      'Hola ${contract.client},',
      '',
      'Adjuntamos tu contrato de servicio ${contract.number}. En él encontrarás los servicios contratados, la mensualidad y la vigencia.',
      '',
      'Vigencia: ${contract.startDate} al ${contract.endDate}',
      'Mensualidad: ${contract.total}',
      '',
      'Por favor revísalo y, si todo está correcto, respóndenos con el documento firmado.',
      '',
      'Saludos,',
      '${user.name} · ${org.name}',
      '${org.phone} · ${org.email}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-08-01T10:00:00-06:00',
  },
  {
    id: 'tpl-contract-whatsapp',
    name: 'Contrato por WhatsApp',
    channel: 'sms',
    module: 'contracts',
    format: 'text',
    subject: '',
    body: [
      'Hola ${contract.client}, te compartimos tu contrato de servicio *${contract.number}* con ${org.name}.',
      '',
      'Vigencia: ${contract.startDate} al ${contract.endDate}',
      'Mensualidad: ${contract.total}',
      '',
      'Cualquier duda, escríbenos a ${org.phone}.',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-08-01T10:00:00-06:00',
  },
  {
    id: 'tpl-invoice-reminder',
    name: 'Recordatorio de pago',
    channel: 'email',
    module: 'invoices',
    format: 'text',
    subject: 'Recordatorio: factura ${invoice.folio} por vencer',
    body: [
      'Hola ${invoice.client},',
      '',
      'Te recordamos que tu factura ${invoice.folio} por ${invoice.total} vence el ${invoice.dueDate}.',
      '',
      'Si ya realizaste el pago, ignora este mensaje.',
      '',
      'Saludos,',
      '${org.name} · ${org.phone}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-07-28T10:00:00-06:00',
  },
  {
    id: 'tpl-lead-first-contact',
    name: 'Primer contacto',
    channel: 'email',
    module: 'leads',
    format: 'text',
    subject: 'Conoce las soluciones de ${org.name}',
    body: [
      'Hola ${lead.name},',
      '',
      'Gracias por tu interés en ${org.name}. Nos gustaría conocer tus necesidades de conectividad y ayudarte a encontrar el plan ideal.',
      '',
      '¿Podemos agendar una llamada breve?',
      '',
      'Saludos,',
      '${user.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-07-20T10:00:00-06:00',
  },
  {
    id: 'tpl-customer-welcome',
    name: 'Bienvenida al servicio',
    channel: 'email',
    module: 'customers',
    format: 'text',
    subject: '¡Bienvenido a ${org.name}, ${customer.name}!',
    body: [
      'Hola ${customer.name},',
      '',
      'Tu servicio ${customer.plan} ya está activo. A partir de hoy puedes contar con nosotros para cualquier tema de tu conexión.',
      '',
      'Guarda estos datos de contacto:',
      'Teléfono: ${org.phone}',
      'Correo: ${org.email}',
      '',
      'Gracias por elegirnos.',
      '${user.name} · ${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-07-10T10:00:00-06:00',
  },
  {
    id: 'tpl-customer-portal-invite',
    name: 'Invitación al portal',
    channel: 'email',
    module: 'customers',
    format: 'text',
    subject: 'Tu acceso al Portal de Clientes de ${org.name}',
    body: [
      'Hola ${customer.name},',
      '',
      'Ya puedes usar el Portal de Clientes de ${org.name}. Desde ahí puedes:',
      '',
      '• Consultar y descargar tus facturas',
      '• Revisar tu historial de pagos y tu saldo',
      '• Levantar y dar seguimiento a tus reportes de soporte',
      '• Actualizar tus datos de contacto',
      '',
      'Entra aquí: ${portal.url}',
      '',
      'Tus datos de acceso:',
      'Número de cliente: ${customer.id}',
      'PIN: ${portal.pin}',
      '',
      'Te recomendamos guardar este correo. Si tienes algún problema para entrar, escríbenos a ${org.email} o llámanos al ${org.phone}.',
      '',
      'Saludos,',
      '${user.name} · ${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-29T10:00:00-06:00',
  },
  {
    id: 'tpl-customer-portal-whatsapp',
    name: 'Invitación al portal por WhatsApp',
    channel: 'sms',
    module: 'customers',
    format: 'text',
    subject: '',
    body: [
      'Hola ${customer.name} 👋',
      '',
      'Te invitamos al *Portal de Clientes de ${org.name}*. Ahí puedes consultar tus facturas, pagos y reportes de soporte.',
      '',
      '🔗 ${portal.url}',
      '',
      '*Tus datos de acceso*',
      'Número de cliente: *${customer.id}*',
      'PIN: *${portal.pin}*',
      '',
      '¿Dudas? Escríbenos al ${org.phone}.',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-29T10:00:00-06:00',
  },
  {
    id: 'tpl-wifi-changed',
    name: 'Cambio de contraseña WiFi',
    channel: 'sms',
    module: 'equipment',
    format: 'text',
    subject: '',
    body: [
      'Hola, actualizamos el WiFi de tu servicio con ${org.name}.',
      '',
      'Red: *${wifi.ssid}* (${wifi.band})',
      'Contraseña: *${wifi.password}*',
      '',
      'Vuelve a conectar tus dispositivos con estos datos. ¿Dudas? ${org.phone}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-29T10:00:00-06:00',
  },
  {
    id: 'tpl-generic-followup',
    name: 'Seguimiento general',
    channel: 'email',
    // Sin módulo: disponible al redactar desde cualquier registro.
    module: '',
    format: 'text',
    subject: 'Seguimiento de ${org.name}',
    body: [
      'Hola,',
      '',
      'Queríamos dar seguimiento al tema que tratamos. ¿Tuviste oportunidad de revisarlo? Con gusto resolvemos cualquier duda.',
      '',
      'Saludos,',
      '${user.name} · ${org.name}',
      '${org.phone}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-07-05T10:00:00-06:00',
  },
  {
    id: 'tpl-payment-received',
    name: 'Pago recibido',
    channel: 'sms',
    module: 'payments',
    format: 'text',
    subject: '',
    body: 'Hola ${payment.client}, recibimos tu pago de ${payment.amount} el ${payment.date}. Referencia: ${payment.reference}. Gracias. ${org.name}',
    status: 'ACTIVE',
    updatedAt: '2026-07-15T10:00:00-06:00',
  },
];

@Injectable({ providedIn: 'root' })
export class TemplateStore {
  private readonly items = signal<ReadonlyArray<CrmTemplate>>(this.read());
  readonly all = computed(() => this.items());
  readonly activeCount = computed(() => this.items().filter((t) => t.status === 'ACTIVE').length);

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items()));
      } catch {
        // Sin almacenamiento los cambios duran sólo esta sesión.
      }
    });
  }

  /** Plantillas utilizables desde un módulo: las suyas y las generales. */
  forModule(module: TemplateModule, channel?: TemplateChannel): ReadonlyArray<CrmTemplate> {
    return this.items().filter(
      (template) =>
        template.status === 'ACTIVE' &&
        (!channel || template.channel === channel) &&
        (template.module === module || template.module === ''),
    );
  }

  /**
   * Plantilla de una función concreta: la del sistema si está activa y, si no,
   * la primera activa del módulo. Tomar siempre "la primera" dejaba que
   * cualquier plantilla nueva reemplazara sin aviso a la del envío.
   */
  forFeature(id: string, module: TemplateModule, channel: TemplateChannel): CrmTemplate | undefined {
    const own = this.find(id);
    if (own?.status === 'ACTIVE') return own;
    return this.forModule(module, channel).find((template) => template.module === module);
  }

  find(id: string): CrmTemplate | undefined {
    return this.items().find((template) => template.id === id);
  }

  usageOf(id: string): string | undefined {
    return SYSTEM_TEMPLATE_USAGE[id];
  }

  /** Motivos que impiden guardar; las variables desconocidas sólo bloquean si está activa. */
  validate(template: CrmTemplate): string | null {
    const name = template.name.trim();
    if (name.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
    if (
      this.items().some(
        (item) => item.id !== template.id && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      return 'Ya existe una plantilla con ese nombre.';
    if (template.channel === 'email' && !template.subject.trim()) return 'El correo necesita asunto.';
    if (!template.body.trim()) return 'Escribe el contenido.';
    if (template.status === 'ACTIVE') {
      const unknown = this.unknownTokens(template);
      if (unknown.length)
        return `Variables que no existen en este módulo: ${unknown.join(', ')}. Corrígelas o guárdala como borrador.`;
    }
    return null;
  }

  unknownTokens(template: Pick<CrmTemplate, 'module' | 'subject' | 'body'>): string[] {
    const known = new Set(mergeFieldGroups(template.module).flatMap((group) => group.fields.map((f) => f.token)));
    return [...new Set(tokensIn(`${template.subject} ${template.body}`))].filter((token) => !known.has(token));
  }

  save(template: CrmTemplate): TemplateResult<CrmTemplate> {
    const invalid = this.validate(template);
    if (invalid) return { ok: false, error: invalid };
    const stamped: CrmTemplate = {
      ...template,
      name: template.name.trim(),
      // El SMS no lleva asunto.
      subject: template.channel === 'sms' ? '' : template.subject,
      updatedAt: new Date().toISOString(),
    };
    this.items.update((items) =>
      items.some((item) => item.id === stamped.id)
        ? items.map((item) => (item.id === stamped.id ? stamped : item))
        : [stamped, ...items],
    );
    return { ok: true, value: stamped };
  }

  /** Copia en borrador con un nombre libre: "X (copia)", "X (copia 2)"… */
  duplicate(template: CrmTemplate): CrmTemplate {
    const names = new Set(this.items().map((item) => item.name.toLocaleLowerCase()));
    let name = `${template.name} (copia)`;
    for (let n = 2; names.has(name.toLocaleLowerCase()); n++) name = `${template.name} (copia ${n})`;
    const copy: CrmTemplate = {
      ...template,
      id: `tpl-${crypto.randomUUID?.() ?? Date.now()}`,
      name,
      status: 'DRAFT',
      updatedAt: new Date().toISOString(),
    };
    this.items.update((items) => [copy, ...items]);
    return copy;
  }

  remove(id: string): TemplateResult {
    const usage = this.usageOf(id);
    if (usage) return { ok: false, error: `La usa «${usage}»: edítala o déjala en borrador, pero no la elimines.` };
    this.items.update((items) => items.filter((item) => item.id !== id));
    return { ok: true, value: undefined };
  }

  /** Asunto y cuerpo con las variables ya sustituidas. */
  render(
    template: CrmTemplate,
    context: RenderContext,
  ): { subject: string; body: string } {
    const body = renderTemplateText(template.body, template.module, context);
    return {
      subject: renderTemplateText(template.subject, template.module, context),
      // El SMS no admite marcado: si la plantilla es HTML se aplana.
      body: template.channel === 'sms' && template.format === 'html' ? htmlToText(body) : body,
    };
  }

  /** Guardadas + las del sistema que falten (p. ej. agregadas en una versión nueva). */
  private read(): ReadonlyArray<CrmTemplate> {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as CrmTemplate[] | null;
      if (!Array.isArray(stored)) return SEED;
      const ids = new Set(stored.map((template) => template.id));
      const missingSystem = SEED.filter((template) => SYSTEM_TEMPLATE_USAGE[template.id] && !ids.has(template.id));
      return [...stored, ...missingSystem];
    } catch {
      return SEED;
    }
  }
}
