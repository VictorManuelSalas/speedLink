import { Injectable, inject } from '@angular/core';
import { CUSTOMERS } from '../data-access/mock-crm-data';
import { TemplateModule } from '../data-access/templates/template.model';
import { DOCUMENT_KIND_BY_MODULE, DOCUMENT_LINK_LABEL, documentLink } from '../documents/shared-documents';
import { customModule } from '../modules/custom-modules.model';
import { MikrotikStore } from '../network/mikrotik.store';
import { ClientPortalStore } from '../portal/client-portal.store';
import { AccessStore } from '../auth/access-store';
import { OPERATIONAL_MODULES } from '../../features/operations/operational-modules.data';
import { OperationalStore } from '../../features/operations/operational-store';

/** Estado del registro contra el que se evalúa «Mostrar solo cuando…». */
export interface TemplateCondition {
  readonly label: string;
  readonly options: ReadonlyArray<{ value: string; label: string }>;
}

export interface MessageContextResult {
  /** Datos para las variables de la plantilla (registro + calculados). */
  readonly data: Readonly<Record<string, unknown>>;
  readonly phone: unknown;
  readonly customerId?: string;
  /** Enlace de descarga del documento del registro, si el módulo tiene uno. */
  readonly document?: { readonly label: string; readonly url: string };
  /** Valor del estado para las condiciones de las plantillas. */
  readonly state: string;
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelado',
  PENDING_SIGNATURE: 'Pendiente de firma',
  EXPIRED: 'Vencido',
  RETURNED: 'Devuelta',
  AVAILABLE: 'Disponible',
  ASSIGNED: 'Asignado',
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUALIFIED: 'Calificado',
  LOST: 'Perdido',
  WON: 'Ganado',
};

const EVENT_TYPE: Readonly<Record<string, string>> = {
  INSTALLATION: 'Instalación',
  FOLLOW_UP: 'Seguimiento',
  PAYMENT: 'Cobranza',
  MAINTENANCE: 'Mantenimiento',
};

const TICKET_STATUS: Readonly<Record<string, string>> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  waiting: 'En espera',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};
const TICKET_PRIORITY: Readonly<Record<string, string>> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};
const PAYMENT_METHOD: Readonly<Record<string, string>> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CREDIT_CARD: 'Tarjeta',
  DEBIT_CARD: 'Tarjeta de débito',
  OTHER: 'Otro',
};

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').toLocaleLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

/** Opciones de «Mostrar solo cuando…» de un módulo; null si no aplica. */
export function templateCondition(module: TemplateModule): TemplateCondition | null {
  if (!module) return null;
  if (module === 'customers')
    return {
      label: 'Situación del cliente',
      options: [
        { value: 'current', label: 'Al corriente' },
        { value: 'overdue', label: 'Con adeudo vencido' },
        { value: 'blocked', label: 'Internet bloqueado' },
      ],
    };
  if (module === 'tickets')
    return {
      label: 'Estado del ticket',
      options: Object.entries(TICKET_STATUS).map(([value, label]) => ({ value, label })),
    };
  if (module === 'calendar')
    return {
      label: 'Tipo de cita',
      options: Object.entries(EVENT_TYPE).map(([value, label]) => ({ value, label })),
    };
  if (module === 'invoices')
    return {
      label: 'Estado de la factura',
      options: [
        { value: 'PENDING', label: 'Pendiente' },
        { value: 'OVERDUE', label: 'Vencida con saldo' },
        { value: 'PAID', label: 'Pagada' },
      ],
    };
  const definition = OPERATIONAL_MODULES[module as keyof typeof OPERATIONAL_MODULES];
  const status = definition?.fields.find((field) => field.key === 'status');
  if (!status?.options?.length) return null;
  return {
    label: 'Estado',
    options: status.options.map((value) => ({
      value,
      label: status.optionLabels?.[value] ?? STATUS_LABEL[value] ?? titleCase(value),
    })),
  };
}

/**
 * Arma lo que necesita un mensaje de WhatsApp desde cualquier registro: a
 * quién va, el enlace de su documento y los valores calculados (saldo, días
 * de atraso, adeudo…) que las plantillas pueden usar.
 */
@Injectable({ providedIn: 'root' })
export class MessageContext {
  private readonly ops = inject(OperationalStore);
  private readonly network = inject(MikrotikStore);
  private readonly portal = inject(ClientPortalStore);
  private readonly access = inject(AccessStore);

  build(module: TemplateModule, record: Readonly<Record<string, unknown>>): MessageContextResult {
    const id = String(record['id'] ?? '');
    const base: Record<string, unknown> = {
      ...record,
      portalUrl: `${window.location.origin}/portal/${this.portal.config().slug}`,
    };
    const kind = DOCUMENT_KIND_BY_MODULE[module];
    const document = kind && id ? { label: DOCUMENT_LINK_LABEL[kind], url: documentLink(kind, id) } : undefined;
    if (document) base['documentUrl'] = document.url;

    switch (module) {
      case 'customers':
        return this.customer(id, base, document);
      case 'invoices': {
        const balance = this.invoiceBalance(record);
        const daysOverdue = this.daysSince(record['dueDate']);
        const paid = record['status'] === 'PAID' || balance <= 0;
        const overdue = !paid && (record['status'] === 'OVERDUE' || daysOverdue > 0);
        return this.forClient(record, {
          ...base,
          balance,
          paidAmount: (Number(record['total']) || 0) - balance,
          daysOverdue: overdue ? daysOverdue : 0,
        }, document, paid ? 'PAID' : overdue ? 'OVERDUE' : 'PENDING');
      }
      case 'payments': {
        const invoiceKey = String(record['invoiceId'] ?? record['invoice'] ?? '');
        const invoice =
          this.ops.find('invoices', invoiceKey) ??
          this.ops.recordsFor('invoices').find((item) => item['folio'] === invoiceKey);
        return this.forClient(record, {
          ...base,
          invoice: String(invoice?.['folio'] ?? record['invoice'] ?? '—'),
          balance: invoice ? this.invoiceBalance(invoice) : 0,
          methodLabel: PAYMENT_METHOD[String(record['method'] ?? '')] ?? titleCase(String(record['method'] ?? '')),
        }, document, String(record['status'] ?? ''));
      }
      case 'contracts':
        return this.forClient(
          record,
          { ...base, servicesSummary: this.contractServices(record), daysToEnd: Math.max(0, -this.daysSince(record['endDate'])) },
          document,
          String(record['status'] ?? ''),
        );
      case 'calendar':
        return this.calendarEvent(record, base);
      case 'tickets':
        return {
          data: {
            ...base,
            statusLabel: TICKET_STATUS[String(record['status'])] ?? String(record['status'] ?? ''),
            priorityLabel: TICKET_PRIORITY[String(record['priority'])] ?? '',
            assigneeName: record['assignedTo'] || 'nuestro técnico',
          },
          phone: record['clientPhone'] ?? this.customerPhone(String(record['clientId'] ?? '')),
          customerId: String(record['clientId'] ?? '') || undefined,
          state: String(record['status'] ?? ''),
        };
      case 'leads':
        return { data: base, phone: record['cellphone'] || record['phone'], state: String(record['status'] ?? '') };
      case 'equipment':
        return this.forClient({ ...record, clientId: record['assignedToId'] }, base, document, String(record['status'] ?? ''));
      default:
        return this.generic(module, record, base, document);
    }
  }

  /** Teléfono del cliente, con los cambios hechos en el CRM. */
  customerPhone(customerId: string): unknown {
    return this.ops.find('customers', customerId)?.['phone'] ?? CUSTOMERS.find((item) => item.id === customerId)?.phone;
  }

  /** Fecha de corte: vencimiento más antiguo + días de gracia + 1, nunca antes de mañana. */
  cutoffDate(customerId: string): string {
    const overdue = this.network.overdueFor(customerId);
    const grace = this.network.rules().graceDays;
    const today = new Date();
    const cutoff = overdue.count ? new Date(today.getTime() + Math.max(1, grace + 1 - overdue.days) * 86400_000) : today;
    // Fecha local (no UTC): de noche en México, toISOString ya sería mañana.
    return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  }

  private customer(
    customerId: string,
    base: Record<string, unknown>,
    document: MessageContextResult['document'],
  ): MessageContextResult {
    const seed = CUSTOMERS.find((item) => item.id === customerId);
    const live = this.ops.find('customers', customerId);
    const overdue = this.network.overdueFor(customerId);
    const plan = this.network.planFor(customerId);
    const blocked = !!this.network.subscriber(customerId)?.blocked;
    return {
      data: {
        ...seed,
        ...live,
        ...base,
        speed: plan.speed ? `${plan.speed.download} Mbps` : (seed?.speed ?? ''),
        overdueTotal: overdue.amount,
        overdueCount: overdue.count,
        cutoffDate: this.cutoffDate(customerId),
      },
      phone: live?.['phone'] ?? base['phone'] ?? seed?.phone,
      customerId,
      document,
      state: blocked ? 'blocked' : overdue.count ? 'overdue' : 'current',
    };
  }

  /** Cita del calendario: va al cliente; la ubicación para el técnico sale del mismo contexto. */
  private calendarEvent(record: Readonly<Record<string, unknown>>, base: Record<string, unknown>): MessageContextResult {
    const customerId = String(record['clientId'] ?? record['client'] ?? '');
    const customer = this.ops.find('customers', customerId);
    const seed = CUSTOMERS.find((item) => item.id === customerId);
    const starts = new Date(String(record['startsAt'] ?? ''));
    const lat = seed?.latitude;
    const lng = seed?.longitude;
    const assignee = this.assignee(String(record['assignedTo'] ?? ''));
    return {
      data: {
        ...base,
        typeLabel: EVENT_TYPE[String(record['type'])] ?? String(record['type'] ?? ''),
        timeLabel: Number.isNaN(starts.getTime())
          ? ''
          : new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(starts),
        clientName: String(customer?.['name'] ?? seed?.name ?? customerId),
        clientPhone: String(customer?.['phone'] ?? seed?.phone ?? ''),
        assigneeName: assignee?.fullName ?? String(record['assignedTo'] ?? 'nuestro técnico'),
        address: String(customer?.['address'] ?? seed?.address ?? ''),
        mapsUrl: lat !== undefined && lng !== undefined ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : '',
      },
      phone: customer?.['phone'] ?? seed?.phone,
      customerId: customerId || undefined,
      state: String(record['type'] ?? ''),
    };
  }

  /** Teléfono del responsable de una cita (para mandarle la ubicación). */
  assigneePhone(assignedTo: string): string {
    return this.assignee(assignedTo)?.phone ?? '';
  }

  private assignee(value: string) {
    const legacy: Readonly<Record<string, string>> = { 'USR-001': 'Andrea Torres', 'USR-002': 'Carlos Mendoza', 'USR-003': 'María García' };
    const name = legacy[value] ?? value;
    return this.access.users().find((user) => user.id === value || user.fullName === name);
  }

  /** Registros que cuelgan de un cliente (factura, pago, contrato, equipo). */
  private forClient(
    record: Readonly<Record<string, unknown>>,
    data: Record<string, unknown>,
    document: MessageContextResult['document'],
    state: string,
  ): MessageContextResult {
    const customerId = String(record['clientId'] ?? '');
    return { data, phone: this.customerPhone(customerId), customerId: customerId || undefined, document, state };
  }

  /** Módulos personalizados: su campo de teléfono o el del cliente ligado. */
  private generic(
    module: TemplateModule,
    record: Readonly<Record<string, unknown>>,
    base: Record<string, unknown>,
    document: MessageContextResult['document'],
  ): MessageContextResult {
    const fields = customModule(module)?.fields ?? [];
    const phoneField = fields.find((field) => field.type === 'phone');
    const customerField = fields.find((field) => field.type === 'lookup' && field.lookupModule === 'customers');
    const customerId = customerField ? String(record[customerField.key] ?? '') : String(record['clientId'] ?? '');
    const phone =
      (phoneField && record[phoneField.key]) || record['phone'] || (customerId ? this.customerPhone(customerId) : undefined);
    return { data: base, phone, customerId: customerId || undefined, document, state: String(record['status'] ?? '') };
  }

  private invoiceBalance(invoice: Readonly<Record<string, unknown>>): number {
    const paid = this.ops
      .recordsFor('payments')
      .filter(
        (payment) =>
          payment['invoiceId'] === invoice['id'] ||
          payment['invoice'] === invoice['id'] ||
          (!!invoice['folio'] && payment['invoice'] === invoice['folio']),
      )
      .reduce((sum, payment) => sum + (Number(payment['amount']) || 0), 0);
    return Math.max(0, (Number(invoice['total']) || 0) - paid);
  }

  private daysSince(date: unknown): number {
    if (!date) return 0;
    const time = new Date(`${String(date).slice(0, 10)}T12:00:00`).getTime();
    return Number.isNaN(time) ? 0 : Math.max(0, Math.floor((Date.now() - time) / 86400_000));
  }

  private contractServices(contract: Readonly<Record<string, unknown>>): string {
    try {
      const items: ReadonlyArray<{ serviceId: string }> = JSON.parse(String(contract['items'] ?? '[]'));
      return items.map((item) => String(this.ops.find('services', item.serviceId)?.['name'] ?? item.serviceId)).join(', ');
    } catch {
      return '';
    }
  }
}
