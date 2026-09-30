/**
 * Plantillas de correo y SMS con campos dinámicos.
 *
 * El contenido puede llevar variables tipo `${contract.number}`. Al usar la
 * plantilla se sustituyen con los datos del registro desde el que se envía,
 * igual que los merge fields de Zoho.
 */

import { OperationalModuleKey } from '../../../features/operations/operational-modules.data';
import { customModule, nativeCustomFields } from '../../modules/custom-modules.model';
import { systemUserName } from '../system-users';

export type TemplateChannel = 'email' | 'sms' | 'whatsapp';
export type TemplateFormat = 'html' | 'text';
export type TemplateStatus = 'ACTIVE' | 'DRAFT';

/** Módulo al que se asocia una plantilla; vacío = disponible en todos. */
export type TemplateModule = OperationalModuleKey | 'customers' | 'tickets' | 'calendar' | '';

export interface CrmTemplate {
  readonly id: string;
  readonly name: string;
  readonly channel: TemplateChannel;
  readonly module: TemplateModule;
  readonly format: TemplateFormat;
  /** Sólo correo. */
  readonly subject: string;
  readonly body: string;
  readonly status: TemplateStatus;
  readonly updatedAt: string;
  /**
   * WhatsApp: el mensaje siempre lleva el enlace de descarga del documento
   * del registro (factura, comprobante…), aunque el texto no use la variable.
   */
  readonly attachDocument?: boolean;
  /**
   * WhatsApp: sólo se ofrece en el menú cuando el registro está en uno de
   * estos estados (vacío = siempre). P. ej. el recordatorio, sólo en vencidas.
   */
  readonly showWhen?: ReadonlyArray<string>;
}

export interface MergeField {
  /** Lo que se escribe entre `${...}`. */
  readonly token: string;
  readonly label: string;
  /** Clave del registro de la que se toma el valor. */
  readonly key: string;
  readonly format?: 'money' | 'date' | 'boolean' | 'user';
}

export interface MergeFieldGroup {
  readonly title: string;
  readonly fields: ReadonlyArray<MergeField>;
}

/** Disponibles en cualquier plantilla, sin importar el módulo. */
export const GLOBAL_MERGE_FIELDS: ReadonlyArray<MergeField> = [
  { token: 'org.name', label: 'Nombre de la empresa', key: '@org.name' },
  { token: 'org.phone', label: 'Teléfono de la empresa', key: '@org.phone' },
  { token: 'org.email', label: 'Correo de la empresa', key: '@org.email' },
  { token: 'org.address', label: 'Dirección de la empresa', key: '@org.address' },
  { token: 'org.website', label: 'Sitio web de la empresa', key: '@org.website' },
  { token: 'portal.url', label: 'Enlace al portal de clientes', key: 'portalUrl' },
  { token: 'user.name', label: 'Usuario que envía', key: '@user.name' },
  { token: 'today', label: 'Fecha de hoy', key: '@today' },
];

/** Campos por módulo, tomados de las claves reales de cada registro. */
export const MODULE_MERGE_FIELDS: Readonly<Record<string, ReadonlyArray<MergeField>>> = {
  contracts: [
    { token: 'contract.number', label: 'Número de contrato', key: 'contractNumber' },
    { token: 'contract.client', label: 'Cliente', key: 'client' },
    { token: 'contract.startDate', label: 'Inicio de vigencia', key: 'startDate', format: 'date' },
    { token: 'contract.endDate', label: 'Fin de vigencia', key: 'endDate', format: 'date' },
    { token: 'contract.total', label: 'Mensualidad', key: 'totalMonthly', format: 'money' },
    { token: 'contract.status', label: 'Estado', key: 'status' },
    { token: 'contract.services', label: 'Servicios contratados', key: 'servicesSummary' },
    { token: 'contract.daysToEnd', label: 'Días para el fin de vigencia', key: 'daysToEnd' },
    { token: 'contract.link', label: 'Enlace de descarga del contrato', key: 'documentUrl' },
  ],
  invoices: [
    { token: 'invoice.folio', label: 'Folio', key: 'folio' },
    { token: 'invoice.client', label: 'Cliente', key: 'client' },
    { token: 'invoice.total', label: 'Total', key: 'total', format: 'money' },
    { token: 'invoice.issueDate', label: 'Fecha de emisión', key: 'issueDate', format: 'date' },
    { token: 'invoice.dueDate', label: 'Fecha de vencimiento', key: 'dueDate', format: 'date' },
    { token: 'invoice.subtotal', label: 'Subtotal', key: 'subtotal', format: 'money' },
    { token: 'invoice.paid', label: 'Pagado a la fecha', key: 'paidAmount', format: 'money' },
    { token: 'invoice.status', label: 'Estado', key: 'status' },
    { token: 'invoice.balance', label: 'Saldo pendiente', key: 'balance', format: 'money' },
    { token: 'invoice.daysOverdue', label: 'Días de atraso', key: 'daysOverdue' },
    { token: 'invoice.link', label: 'Enlace de descarga de la factura', key: 'documentUrl' },
  ],
  payments: [
    { token: 'payment.reference', label: 'Referencia', key: 'reference' },
    { token: 'payment.client', label: 'Cliente', key: 'client' },
    { token: 'payment.amount', label: 'Importe', key: 'amount', format: 'money' },
    { token: 'payment.date', label: 'Fecha de pago', key: 'paidAt', format: 'date' },
    { token: 'payment.method', label: 'Forma de pago', key: 'methodLabel' },
    { token: 'payment.invoice', label: 'Factura pagada', key: 'invoice' },
    { token: 'payment.balance', label: 'Saldo restante de la factura', key: 'balance', format: 'money' },
    { token: 'payment.link', label: 'Enlace de descarga del comprobante', key: 'documentUrl' },
  ],
  leads: [
    { token: 'lead.name', label: 'Prospecto', key: 'name' },
    { token: 'lead.email', label: 'Correo', key: 'email' },
    { token: 'lead.phone', label: 'Teléfono', key: 'phone' },
    { token: 'lead.source', label: 'Origen', key: 'source' },
    { token: 'lead.address', label: 'Dirección', key: 'address' },
  ],
  customers: [
    { token: 'customer.name', label: 'Cliente', key: 'name' },
    { token: 'customer.email', label: 'Correo', key: 'email' },
    { token: 'customer.phone', label: 'Teléfono', key: 'phone' },
    { token: 'customer.plan', label: 'Plan contratado', key: 'plan' },
    { token: 'customer.balance', label: 'Saldo actual', key: 'currentBalance', format: 'money' },
    { token: 'customer.speed', label: 'Velocidad contratada', key: 'speed' },
    { token: 'customer.monthlyFee', label: 'Mensualidad', key: 'monthlyFee', format: 'money' },
    { token: 'customer.billingDay', label: 'Día de cobro', key: 'billingDay' },
    { token: 'customer.address', label: 'Dirección', key: 'address' },
    { token: 'customer.ip', label: 'IP asignada', key: 'ipAddress' },
    { token: 'customer.overdueTotal', label: 'Adeudo vencido', key: 'overdueTotal', format: 'money' },
    { token: 'customer.overdueCount', label: 'Facturas vencidas', key: 'overdueCount' },
    { token: 'customer.cutoffDate', label: 'Fecha de corte', key: 'cutoffDate', format: 'date' },
    { token: 'customer.statementLink', label: 'Enlace del estado de cuenta', key: 'documentUrl' },
  ],
  calendar: [
    { token: 'event.title', label: 'Título de la cita', key: 'title' },
    { token: 'event.type', label: 'Tipo de cita', key: 'typeLabel' },
    { token: 'event.date', label: 'Fecha', key: 'startsAt', format: 'date' },
    { token: 'event.time', label: 'Hora', key: 'timeLabel' },
    { token: 'event.client', label: 'Cliente', key: 'clientName' },
    { token: 'event.technician', label: 'Responsable', key: 'assigneeName' },
    { token: 'event.address', label: 'Dirección del cliente', key: 'address' },
    { token: 'event.mapsLink', label: 'Ubicación en Google Maps', key: 'mapsUrl' },
    { token: 'event.clientPhone', label: 'Teléfono del cliente', key: 'clientPhone' },
  ],
  tickets: [
    { token: 'ticket.folio', label: 'Folio del ticket', key: 'id' },
    { token: 'ticket.subject', label: 'Asunto', key: 'subject' },
    { token: 'ticket.client', label: 'Cliente', key: 'clientName' },
    { token: 'ticket.status', label: 'Estado', key: 'statusLabel' },
    { token: 'ticket.technician', label: 'Responsable', key: 'assigneeName' },
    { token: 'ticket.category', label: 'Categoría', key: 'category' },
    { token: 'ticket.priority', label: 'Prioridad', key: 'priorityLabel' },
    { token: 'ticket.createdAt', label: 'Fecha del reporte', key: 'createdAt', format: 'date' },
  ],
  equipment: [
    { token: 'equipment.name', label: 'Equipo', key: 'name' },
    { token: 'wifi.ssid', label: 'Nombre de la red WiFi', key: 'wifiSsid' },
    { token: 'wifi.band', label: 'Banda WiFi', key: 'wifiBand' },
    { token: 'wifi.password', label: 'Contraseña WiFi', key: 'wifiPassword' },
  ],
  assignments: [
    { token: 'assignment.folio', label: 'Folio de asignación', key: 'name' },
    { token: 'assignment.client', label: 'Cliente', key: 'client' },
    { token: 'assignment.equipment', label: 'Equipo', key: 'equipment' },
    { token: 'assignment.serial', label: 'Número de serie', key: 'serial' },
    { token: 'assignment.date', label: 'Fecha de entrega', key: 'assignedAt', format: 'date' },
    { token: 'assignment.link', label: 'Enlace de descarga del acuse', key: 'documentUrl' },
  ],
};

/** Acceso al portal de clientes; sólo existen al enviar desde un cliente. */
export const PORTAL_MERGE_FIELDS: ReadonlyArray<MergeField> = [
  { token: 'customer.id', label: 'Usuario (número de cliente)', key: 'id' },
  { token: 'portal.pin', label: 'PIN de acceso', key: 'portalPin' },
];

/** Campos disponibles para un módulo, agrupados para el selector del editor. */
export function mergeFieldGroups(module: TemplateModule): ReadonlyArray<MergeFieldGroup> {
  const custom = module ? customModule(module) : undefined;
  // Un módulo personalizado sólo trae su campo principal como campo "del módulo".
  const moduleFields = custom
    ? [{ token: 'record.name', label: custom.primaryLabel, key: 'name' }]
    : module
      ? (MODULE_MERGE_FIELDS[module] ?? [])
      : [];
  const customFields = module ? customFieldTokens(module) : [];
  return [
    ...(moduleFields.length ? [{ title: 'Campos del módulo', fields: moduleFields }] : []),
    ...(customFields.length ? [{ title: 'Campos personalizados', fields: customFields }] : []),
    ...(module === 'customers' ? [{ title: 'Portal del cliente', fields: PORTAL_MERGE_FIELDS }] : []),
    { title: 'Generales', fields: GLOBAL_MERGE_FIELDS },
  ];
}

/** Campos creados en Ajustes > Módulos, como `${custom.cf_…}`. */
function customFieldTokens(module: string): ReadonlyArray<MergeField> {
  const fields = customModule(module)?.fields ?? nativeCustomFields(module);
  return fields.map((field) => ({
    token: `custom.${field.key}`,
    label: field.label,
    key: field.key,
    format:
      field.type === 'currency'
        ? 'money'
        : field.type === 'date'
          ? 'date'
          : field.type === 'checkbox'
            ? 'boolean'
            : field.type === 'user'
              ? 'user'
              : undefined,
  }));
}

export interface RenderContext {
  /** Registro desde el que se envía. */
  readonly record?: Readonly<Record<string, unknown>>;
  readonly organization: { name: string; phone: string; email: string; address: string; website?: string };
  readonly userName: string;
  readonly formatMoney: (value: unknown) => string;
  readonly formatDate: (value: unknown) => string;
}

const TOKEN_PATTERN = /\$\{\s*([\w.]+)\s*\}/g;

/**
 * Sustituye las variables del texto. Un token sin valor se deja vacío en vez de
 * imprimir `${...}`: el cliente no debe ver el marcador crudo.
 */
export function renderTemplateText(
  text: string,
  module: TemplateModule,
  context: RenderContext,
): string {
  const fields = new Map(
    mergeFieldGroups(module).flatMap((group) => group.fields).map(
      (field) => [field.token, field],
    ),
  );
  return text.replace(TOKEN_PATTERN, (_match, token: string) => {
    const field = fields.get(token);
    if (!field) return '';
    return resolveField(field, context);
  });
}

function resolveField(field: MergeField, context: RenderContext): string {
  if (field.key.startsWith('@')) {
    switch (field.key) {
      case '@org.name':
        return context.organization.name;
      case '@org.phone':
        return context.organization.phone;
      case '@org.email':
        return context.organization.email;
      case '@org.address':
        return context.organization.address;
      case '@org.website':
        return context.organization.website ?? '';
      case '@user.name':
        return context.userName;
      case '@today':
        return context.formatDate(new Date().toISOString());
      default:
        return '';
    }
  }
  const raw = context.record?.[field.key];
  if (raw === undefined || raw === null || raw === '') return '';
  if (field.format === 'money') return context.formatMoney(raw);
  if (field.format === 'date') return context.formatDate(raw);
  if (field.format === 'boolean') return String(raw) === 'true' ? 'Sí' : 'No';
  if (field.format === 'user') return systemUserName(String(raw)) ?? String(raw);
  return String(raw);
}

/** Tokens usados en un texto, para avisar de variables inexistentes. */
export function tokensIn(text: string): ReadonlyArray<string> {
  return [...text.matchAll(TOKEN_PATTERN)].map((match) => match[1]);
}

/** Contenido HTML convertido a texto plano, para SMS o vista previa simple. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
