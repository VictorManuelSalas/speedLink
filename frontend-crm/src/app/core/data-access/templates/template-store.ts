import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuditLog } from '../../audit/audit-log';
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
/** Plantillas de fábrica que el usuario eliminó: no se vuelven a agregar. */
const DELETED_KEY = 'speedlink-templates-deleted';

/**
 * Plantillas que usa una función del CRM por su id. Se pueden editar, pero no
 * eliminar ni dejar en borrador sin aviso: la función se quedaría sin texto.
 */
export const SYSTEM_TEMPLATE_USAGE: Readonly<Record<string, string>> = {
  'tpl-contract-send': 'Contratos › Enviar por correo',
  'tpl-customer-portal-invite': 'Clientes › Invite Portal por correo',
  'tpl-customer-portal-whatsapp': 'Clientes › Invite Portal por WhatsApp',
  'tpl-wifi-changed': 'Equipamiento › Avisar cambio de WiFi',
  // Avisos que dispara una acción de Red (bloquear, reactivar, lista de cortes).
  'tpl-customer-cutoff-warning': 'Red › Cortes por falta de pago › Avisar',
  'tpl-network-suspended': 'Red › Bloquear › Avisar al cliente',
  'tpl-network-reactivated': 'Red › Desbloquear › Avisar al cliente',
  'tpl-event-tech-location': 'Calendario › Enviar ubicación al técnico',
};
// Las demás plantillas de WhatsApp sólo aparecen en el menú de su módulo:
// se pueden editar, duplicar o eliminar libremente.

/**
 * Plantillas que sólo usa una acción concreta y no salen en el menú WhatsApp:
 * la invitación al portal necesita generar el PIN y el cambio de WiFi los
 * datos de la red.
 */
export const ACTION_ONLY_TEMPLATES: ReadonlySet<string> = new Set([
  'tpl-customer-portal-whatsapp',
  'tpl-wifi-changed',
  // Se manda al desbloquear en Red; en el menú saldría en cualquier cliente al corriente.
  'tpl-network-reactivated',
  // Va al técnico, no al cliente: tiene su propio botón en la cita.
  'tpl-event-tech-location',
]);

export type TemplateResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

const RAW_SEED: ReadonlyArray<CrmTemplate> = [
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
      'Descárgalo aquí: ${contract.link}',
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
    body: [
      'Hola ${payment.client}, recibimos tu pago de *${payment.amount}* el ${payment.date}. ✅',
      'Referencia: ${payment.reference} · Factura: ${payment.invoice}',
      'Saldo restante: ${payment.balance}',
      '',
      'Tu comprobante: ${payment.link}',
      '',
      'Gracias por tu pago. ${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-07-15T10:00:00-06:00',
  },
  {
    id: 'tpl-invoice-whatsapp',
    name: 'Factura por WhatsApp',
    channel: 'sms',
    module: 'invoices',
    format: 'text',
    subject: '',
    body: [
      'Hola ${invoice.client}, te compartimos tu factura *${invoice.folio}* de ${org.name}.',
      '',
      'Total: ${invoice.total}',
      'Vence: ${invoice.dueDate}',
      '',
      'Descárgala aquí: ${invoice.link}',
      '',
      'Cualquier duda, escríbenos por aquí o llama al ${org.phone}.',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-invoice-reminder-whatsapp',
    name: 'Recordatorio de pago por WhatsApp',
    channel: 'sms',
    module: 'invoices',
    format: 'text',
    subject: '',
    body: [
      'Hola ${invoice.client}, te recordamos que tu factura *${invoice.folio}* por ${invoice.balance} venció el ${invoice.dueDate} (${invoice.daysOverdue} días de atraso).',
      '',
      'Realiza tu pago para evitar la suspensión del servicio.',
      'Factura: ${invoice.link}',
      '',
      'Si ya pagaste, mándanos tu comprobante por este medio. ${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-customer-welcome-whatsapp',
    name: 'Bienvenida por WhatsApp',
    channel: 'sms',
    module: 'customers',
    format: 'text',
    subject: '',
    body: [
      '¡Bienvenido a ${org.name}, ${customer.name}! 🎉',
      '',
      'Tu internet ${customer.plan} (${customer.speed}) ya está activo.',
      'Tu número de cliente es *${customer.id}*: tenlo a la mano para pagos y soporte.',
      '',
      'Guarda este número: por aquí te atendemos.',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-customer-statement-whatsapp',
    name: 'Estado de cuenta por WhatsApp',
    channel: 'sms',
    module: 'customers',
    format: 'text',
    subject: '',
    body: [
      'Hola ${customer.name}, este es tu estado de cuenta al ${today}.',
      '',
      'Saldo actual: ${customer.balance}',
      'Descárgalo aquí: ${customer.statementLink}',
      '',
      '${org.name} · ${org.phone}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-customer-reminder-whatsapp',
    name: 'Recordatorio de adeudo por WhatsApp',
    channel: 'sms',
    module: 'customers',
    format: 'text',
    subject: '',
    body: [
      'Hola ${customer.name}, tienes ${customer.overdueCount} factura(s) vencida(s) por ${customer.overdueTotal}.',
      '',
      'Consulta el detalle: ${customer.statementLink}',
      '',
      'Si ya pagaste, envíanos tu comprobante por aquí. ¡Gracias! ${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-customer-cutoff-warning',
    name: 'Aviso de corte por WhatsApp',
    channel: 'sms',
    module: 'customers',
    format: 'text',
    subject: '',
    body: [
      'Hola ${customer.name}, tu servicio de internet se suspenderá el *${customer.cutoffDate}* por un adeudo de ${customer.overdueTotal}.',
      '',
      'Paga antes de esa fecha para evitar el corte.',
      'Estado de cuenta: ${customer.statementLink}',
      '',
      '${org.name} · ${org.phone}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-network-suspended',
    name: 'Servicio suspendido por WhatsApp',
    channel: 'sms',
    module: 'customers',
    format: 'text',
    subject: '',
    body: [
      'Hola ${customer.name}, tu servicio de internet fue suspendido por un adeudo de ${customer.overdueTotal}.',
      '',
      'En cuanto recibamos tu pago lo reactivamos.',
      'Estado de cuenta: ${customer.statementLink}',
      '',
      '${org.name} · ${org.phone}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-network-reactivated',
    name: 'Servicio reactivado por WhatsApp',
    channel: 'sms',
    module: 'customers',
    format: 'text',
    subject: '',
    body: [
      'Hola ${customer.name}, tu servicio de internet ya está activo de nuevo. ✅',
      '',
      'Si no navegas, reinicia tu módem (desconéctalo 30 segundos). Cualquier cosa, escríbenos por aquí.',
      '${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-ticket-received',
    name: 'Ticket recibido por WhatsApp',
    channel: 'sms',
    module: 'tickets',
    format: 'text',
    subject: '',
    body: [
      'Hola ${ticket.client}, recibimos tu reporte «${ticket.subject}».',
      'Tu folio es *${ticket.folio}*. Te avisaremos por aquí cómo va.',
      '${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-ticket-onsite',
    name: 'Técnico en camino por WhatsApp',
    channel: 'sms',
    module: 'tickets',
    format: 'text',
    subject: '',
    body: [
      'Hola ${ticket.client}, ${ticket.technician} va en camino para atender tu reporte *${ticket.folio}*.',
      'Por favor ten acceso al equipo. ¡Gracias!',
      '${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-ticket-resolved',
    name: 'Ticket resuelto por WhatsApp',
    channel: 'sms',
    module: 'tickets',
    format: 'text',
    subject: '',
    body: [
      'Hola ${ticket.client}, dimos por resuelto tu reporte *${ticket.folio}* («${ticket.subject}»).',
      '¿Todo funciona bien? Si no, respóndenos aquí y lo reabrimos.',
      '${org.name}',
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T10:00:00-06:00',
  },
  {
    id: 'tpl-lead-first-contact-whatsapp',
    name: 'Primer contacto por WhatsApp',
    channel: 'sms',
    module: 'leads',
    format: 'text',
    subject: '',
    body: [
      "Hola ${lead.name}, soy ${user.name} de ${org.name}. 👋",
      "Recibimos tu interés en nuestro servicio de internet.",
      "",
      "¿Te gustaría que revisemos la cobertura en ${lead.address}? Con gusto te paso planes y precios.",
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T12:00:00-06:00',
  },
  {
    id: 'tpl-lead-followup-whatsapp',
    name: 'Seguimiento de prospecto por WhatsApp',
    channel: 'sms',
    module: 'leads',
    format: 'text',
    subject: '',
    body: [
      "Hola ${lead.name}, ¿pudiste revisar la información que te compartimos?",
      "Si quieres, agendamos la instalación esta semana. Solo respóndenos por aquí.",
      "${user.name} · ${org.name}",
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T12:00:00-06:00',
  },
  {
    id: 'tpl-contract-signature-reminder',
    name: 'Recordatorio de firma de contrato',
    channel: 'sms',
    module: 'contracts',
    format: 'text',
    subject: '',
    body: [
      "Hola ${contract.client}, tu contrato *${contract.number}* está listo y solo falta tu firma.",
      "",
      "Revísalo aquí: ${contract.link}",
      "",
      "Cualquier duda, escríbenos. ${org.name}",
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T12:00:00-06:00',
  },
  {
    id: 'tpl-contract-renewal',
    name: 'Aviso de renovación de contrato',
    channel: 'sms',
    module: 'contracts',
    format: 'text',
    subject: '',
    body: [
      "Hola ${contract.client}, tu contrato *${contract.number}* vence el ${contract.endDate} (en ${contract.daysToEnd} días).",
      "",
      "¿Lo renovamos con las mismas condiciones? También podemos revisar un plan con más velocidad.",
      "${org.name} · ${org.phone}",
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T12:00:00-06:00',
  },
  {
    id: 'tpl-assignment-receipt',
    name: 'Acuse de entrega de equipo',
    channel: 'sms',
    module: 'assignments',
    format: 'text',
    subject: '',
    body: [
      "Hola ${assignment.client}, te entregamos el equipo *${assignment.equipment}* (serie ${assignment.serial}) el ${assignment.date}.",
      "",
      "Tu acuse de entrega: ${assignment.link}",
      "",
      "Consérvalo: el equipo es propiedad de ${org.name} y se devuelve al terminar el servicio.",
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T12:00:00-06:00',
  },
  {
    id: 'tpl-event-confirmation',
    name: 'Confirmación de cita por WhatsApp',
    channel: 'sms',
    module: 'calendar',
    format: 'text',
    subject: '',
    body: [
      "Hola ${event.client}, te confirmamos tu cita de *${event.type}* el ${event.date} a las ${event.time}.",
      "${event.technician} te visitará en ${event.address}.",
      "",
      "¿Nos confirmas que alguien estará en casa? Responde *SÍ* o dinos otro horario.",
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T12:00:00-06:00',
  },
  {
    id: 'tpl-event-reminder',
    name: 'Recordatorio de cita por WhatsApp',
    channel: 'sms',
    module: 'calendar',
    format: 'text',
    subject: '',
    body: [
      "Hola ${event.client}, te recordamos tu cita de *${event.type}* mañana ${event.date} a las ${event.time}.",
      "Cualquier cambio, avísanos por aquí. ${org.name}",
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T12:00:00-06:00',
  },
  {
    id: 'tpl-event-tech-location',
    name: 'Ubicación para el técnico',
    channel: 'sms',
    module: 'calendar',
    format: 'text',
    subject: '',
    body: [
      "*${event.type}* · ${event.date} ${event.time}",
      "Cliente: ${event.client} · ${event.clientPhone}",
      "Dirección: ${event.address}",
      "Ubicación: ${event.mapsLink}",
      "",
      "${event.title}",
    ].join('\n'),
    status: 'ACTIVE',
    updatedAt: '2026-09-30T12:00:00-06:00',
  },
];

/**
 * Plantillas de WhatsApp de fábrica: antes se guardaban como «SMS». Cada una
 * trae si adjunta el enlace del documento y en qué estados se ofrece.
 */
const WHATSAPP_DEFAULTS: Readonly<Record<string, Pick<CrmTemplate, 'attachDocument' | 'showWhen'>>> = {
  'tpl-contract-whatsapp': { attachDocument: true, showWhen: ['ACTIVE', 'PENDING_SIGNATURE'] },
  'tpl-customer-portal-whatsapp': { showWhen: [] },
  'tpl-wifi-changed': { showWhen: [] },
  'tpl-payment-received': { attachDocument: true, showWhen: [] },
  'tpl-invoice-whatsapp': { attachDocument: true, showWhen: ['PENDING', 'OVERDUE'] },
  'tpl-invoice-reminder-whatsapp': { attachDocument: true, showWhen: ['OVERDUE'] },
  'tpl-customer-welcome-whatsapp': { showWhen: [] },
  'tpl-customer-statement-whatsapp': { attachDocument: true, showWhen: [] },
  'tpl-customer-reminder-whatsapp': { attachDocument: true, showWhen: ['overdue'] },
  'tpl-customer-cutoff-warning': { attachDocument: true, showWhen: ['overdue'] },
  'tpl-network-suspended': { attachDocument: true, showWhen: ['blocked'] },
  'tpl-network-reactivated': { showWhen: ['current'] },
  'tpl-ticket-received': { showWhen: ['open', 'waiting'] },
  'tpl-ticket-onsite': { showWhen: ['open', 'in_progress'] },
  'tpl-ticket-resolved': { showWhen: ['resolved', 'closed'] },
  'tpl-lead-first-contact-whatsapp': { showWhen: ['NEW'] },
  'tpl-lead-followup-whatsapp': { showWhen: ['CONTACTED', 'QUALIFIED'] },
  'tpl-contract-signature-reminder': { attachDocument: true, showWhen: ['PENDING_SIGNATURE'] },
  'tpl-contract-renewal': { showWhen: ['ACTIVE'] },
  'tpl-assignment-receipt': { attachDocument: true, showWhen: ['ACTIVE'] },
  'tpl-event-confirmation': { showWhen: [] },
  'tpl-event-reminder': { showWhen: [] },
  'tpl-event-tech-location': { showWhen: [] },
};

const SEED: ReadonlyArray<CrmTemplate> = RAW_SEED.map((template) =>
  WHATSAPP_DEFAULTS[template.id] ? { ...template, channel: 'whatsapp', ...WHATSAPP_DEFAULTS[template.id] } : template,
);

@Injectable({ providedIn: 'root' })
export class TemplateStore {
  private readonly audit = inject(AuditLog);
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

  /**
   * Plantillas de WhatsApp activas para el menú de un módulo: las suyas y las
   * de «Todos los módulos».
   */
  whatsappFor(module: TemplateModule): ReadonlyArray<CrmTemplate> {
    return this.items()
      .filter(
        (template) =>
          template.status === 'ACTIVE' &&
          template.channel === 'whatsapp' &&
          !ACTION_ONLY_TEMPLATES.has(template.id) &&
          (template.module === module || template.module === ''),
      )
      .sort((a, b) => Number(a.module === '') - Number(b.module === '') || a.name.localeCompare(b.name));
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
    const existed = this.items().some((item) => item.id === template.id);
    const stamped: CrmTemplate = {
      ...template,
      name: template.name.trim(),
      // SMS y WhatsApp no llevan asunto ni HTML.
      subject: template.channel === 'email' ? template.subject : '',
      format: template.channel === 'email' ? template.format : 'text',
      // Las opciones de WhatsApp sólo aplican a ese canal.
      attachDocument: template.channel === 'whatsapp' ? !!template.attachDocument : undefined,
      showWhen: template.channel === 'whatsapp' && template.showWhen?.length ? [...template.showWhen] : undefined,
      updatedAt: new Date().toISOString(),
    };
    this.items.update((items) =>
      items.some((item) => item.id === stamped.id)
        ? items.map((item) => (item.id === stamped.id ? stamped : item))
        : [stamped, ...items],
    );
    this.audit.record('Configuración', existed ? 'Plantilla editada' : 'Plantilla creada', stamped.name, `${stamped.channel} · ${stamped.status === 'ACTIVE' ? 'activa' : 'borrador'}`);
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
    const removed = this.find(id);
    this.items.update((items) => items.filter((item) => item.id !== id));
    this.audit.record('Configuración', 'Plantilla eliminada', removed?.name ?? id, '', 'warning');
    if (SEED.some((template) => template.id === id)) {
      try {
        const deleted = new Set<string>(JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]'));
        localStorage.setItem(DELETED_KEY, JSON.stringify([...deleted.add(id)]));
      } catch {
        // Sin almacenamiento volvería a aparecer al recargar.
      }
    }
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
      body: template.channel !== 'email' && template.format === 'html' ? htmlToText(body) : body,
    };
  }

  /** Guardadas + las del sistema que falten (p. ej. agregadas en una versión nueva). */
  private read(): ReadonlyArray<CrmTemplate> {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as CrmTemplate[] | null;
      if (!Array.isArray(stored)) return SEED;
      const ids = new Set(stored.map((template) => template.id));
      // Plantillas de fábrica nuevas (de versiones posteriores) que aún no tiene.
      const deleted = new Set<string>(JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]'));
      const missing = SEED.filter((template) => !ids.has(template.id) && !deleted.has(template.id));
      return [...stored.map(migrate), ...missing];
    } catch {
      return SEED;
    }
  }
}

/** Guardadas antes del canal WhatsApp: las de fábrica se pasan de «SMS» a WhatsApp. */
function migrate(template: CrmTemplate): CrmTemplate {
  const defaults = WHATSAPP_DEFAULTS[template.id];
  if (!defaults || template.channel === 'email') return template;
  return {
    ...template,
    channel: 'whatsapp',
    attachDocument: template.attachDocument ?? defaults.attachDocument,
    showWhen: template.showWhen ?? defaults.showWhen,
  };
}
