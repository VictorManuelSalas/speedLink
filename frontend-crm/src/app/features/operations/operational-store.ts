import { Injectable, effect, inject, signal } from '@angular/core';
import { DeviceAccessStore } from '../../core/equipment/device-access.store';
import { CUSTOMERS } from '../../core/data-access/mock-crm-data';
import { CrmAttachment } from '../../core/models/customer';
import { systemUserName } from '../../core/data-access/system-users';
import {
  OPERATIONAL_MODULES,
  OperationalModuleKey,
  OperationalRecord,
} from './operational-modules.data';
import { moduleDefinition } from './module-registry';
import { isCustomModuleKey } from '../../core/modules/custom-modules.model';
import { SessionContext } from '../../core/auth/session-context';
import { AuditLog } from '../../core/audit/audit-log';
import { WebhookEvent, emitWebhookEvent } from '../../core/integrations/webhook-events';

/** Módulo → evento de creación que se notifica por webhook. */
const CREATED_EVENT: Partial<Record<string, WebhookEvent>> = {
  customers: 'customer.created',
  contracts: 'contract.created',
  invoices: 'invoice.created',
  payments: 'payment.created',
};

/** Los datos de demo de los nativos viven en memoria; lo creado por el usuario, no. */
const CUSTOM_RECORDS_KEY = 'speedlink-custom-module-records';
const ACTIVITY_KEY = 'speedlink-activity';
/** Eventos que se conservan por registro (los más recientes). */
const MAX_ACTIVITY_PER_RECORD = 150;

function readCustomRecords(): Record<string, ReadonlyArray<OperationalRecord>> {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_RECORDS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const CUSTOMER_EQUIPMENT_RECORDS: ReadonlyArray<OperationalRecord> = CUSTOMERS.flatMap(
  (customer) =>
    customer.equipment.map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.model,
      serialNumber: item.serial,
      macAddress: item.mac,
      status: 'ASSIGNED',
      purchaseCost: 0,
      assignedTo: customer.name,
    })),
);

export interface OperationalNote {
  id: string;
  message: string;
  author: string;
  initials: string;
  createdAt: string;
  pinned: boolean;
  attachments: ReadonlyArray<CrmAttachment>;
}

export interface OperationalActivity {
  id: string;
  title: string;
  detail: string;
  actor: string;
  createdAt: string;
  tone: 'blue' | 'green' | 'amber' | 'violet';
  module: string;
  actionType: 'CREATE' | 'EDIT' | 'DELETE';
  /** Envíos por WhatsApp: el texto que se mandó y a qué número. */
  channel?: 'whatsapp';
  message?: string;
  phone?: string;
}

/** Evento con el registro al que pertenece (para vistas globales como Auditoría). */
export interface ActivityEntry extends OperationalActivity {
  recordId: string;
}

export interface OperationalEmail {
  id: string;
  to: string;
  cc: string;
  from: string;
  subject: string;
  body: string;
  attachments: ReadonlyArray<CrmAttachment>;
  sentBy: string;
  sentAt: string;
  status: 'SENT' | 'DRAFT';
}

@Injectable({ providedIn: 'root' })
export class OperationalStore {
  readonly records = signal<Readonly<Record<string, ReadonlyArray<OperationalRecord>>>>({
    ...Object.fromEntries(
      Object.entries(OPERATIONAL_MODULES).map(([key, definition]) => [
        key,
        key === 'equipment'
          ? [...definition.records, ...CUSTOMER_EQUIPMENT_RECORDS]
          : [...definition.records],
      ]),
    ),
    ...readCustomRecords(),
  });

  /** Ya se cargaron los datos operativos (demo o API): antes, los catálogos son provisionales. */
  readonly dataReady = signal(false);

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(this.activity()));
      } catch {
        // Sin almacenamiento el historial dura sólo esta sesión.
      }
    });
    effect(() => {
      const custom = Object.fromEntries(
        Object.entries(this.records()).filter(([key]) => isCustomModuleKey(key)),
      );
      try {
        localStorage.setItem(CUSTOM_RECORDS_KEY, JSON.stringify(custom));
      } catch {
        // Sin almacenamiento los registros duran sólo esta sesión.
      }
    });
  }
  private readonly deviceAccess = inject(DeviceAccessStore);
  private readonly session = inject(SessionContext);
  private readonly audit = inject(AuditLog);
  readonly notes = signal<Readonly<Record<string, ReadonlyArray<OperationalNote>>>>({});
  /** Historial por registro; se guarda para que envíos y cambios no se pierdan al recargar. */
  readonly activity = signal<Readonly<Record<string, ReadonlyArray<OperationalActivity>>>>(readActivity());
  readonly recordAttachments = signal<Readonly<Record<string, ReadonlyArray<CrmAttachment>>>>({});
  readonly emails = signal<Readonly<Record<string, ReadonlyArray<OperationalEmail>>>>({});

  recordsFor(module: OperationalModuleKey): ReadonlyArray<OperationalRecord> {
    return this.records()[module] ?? [];
  }

  find(module: OperationalModuleKey, id: string): OperationalRecord | undefined {
    return this.recordsFor(module).find((record) => record.id === id);
  }

  add(module: OperationalModuleKey, record: OperationalRecord): void {
    this.records.update((state) => ({ ...state, [module]: [record, ...(state[module] ?? [])] }));
    const created = CREATED_EVENT[module];
    if (created) emitWebhookEvent(created, record);
    if (module === 'payments') this.notifyInvoicePaid(record);
    this.addActivity(
      record.id,
      'Registro creado',
      `Se creó ${record.id}.`,
      'green',
      this.moduleLabel(module),
      'CREATE',
    );
  }

  update(module: OperationalModuleKey, id: string, changes: Partial<OperationalRecord>): void {
    const previous = this.find(module, id);
    if (module === 'invoices' && changes['status'] === 'PAID' && previous && previous['status'] !== 'PAID')
      emitWebhookEvent('invoice.paid', { ...previous, ...changes });
    this.records.update((state) => ({
      ...state,
      [module]: (state[module] ?? []).map((record) =>
        record.id === id ? { ...record, ...changes, updatedAt: new Date().toISOString() } : record,
      ),
    }));
    // Un equipo devuelto conoció a otro cliente/técnico: sus credenciales y su
    // WiFi deben cambiarse antes de volver a instalarlo.
    if (
      module === 'assignments' &&
      changes['status'] === 'RETURNED' &&
      previous?.['status'] !== 'RETURNED' &&
      previous?.['equipmentId']
    )
      this.deviceAccess.markReturned(String(previous['equipmentId']), 'Sistema (devolución)');
    const definition = moduleDefinition(module);
    if (!definition) return;
    // Los ids sombra de los lookups (`schemaKey`) no se muestran en la ficha,
    // así que tampoco tienen por qué aparecer en la bitácora.
    const shadowIdKeys = new Set(
      definition.fields.map((field) => field.schemaKey).filter(Boolean) as string[],
    );
    const changed = Object.entries(changes)
      .filter(([key]) => !shadowIdKeys.has(key))
      .map(([key, value]) => {
        const label =
          definition.columns.find((field) => field.key === key)?.label ??
          definition.fields.find((field) => field.key === key)?.label ??
          key;
        const readable = (raw: unknown): string => {
          const text = String(raw ?? '');
          if (!text) return '—';
          return systemUserName(text) ?? text;
        };
        return `${label}: ${readable(previous?.[key])} → ${readable(value)}`;
      })
      .join(' · ');
    this.addActivity(id, 'Registro actualizado', changed, 'blue', this.moduleLabel(module), 'EDIT');
  }

  archive(module: OperationalModuleKey, id: string): void {
    const record = this.find(module, id);
    if (record) emitWebhookEvent('record.deleted', { module, id });
    if (record)
      this.audit.record('Datos', 'Registro eliminado', `${this.moduleLabel(module)} ${String(record['folio'] ?? record['name'] ?? id)}`, id, 'critical');
    this.records.update((state) => ({
      ...state,
      [module]: (state[module] ?? []).filter((record) => record.id !== id),
    }));
  }

  notesFor(id: string): ReadonlyArray<OperationalNote> {
    return this.notes()[id] ?? [];
  }

  hydrateNotes(id: string, notes: ReadonlyArray<OperationalNote>): void {
    if (!notes.length || (this.notes()[id]?.length ?? 0) > 0) return;
    this.notes.update((current) => ({ ...current, [id]: [...notes] }));
  }

  /** Agrega el historial de ejemplo sin duplicar ni borrar lo que ya se registró. */
  hydrateActivity(id: string, events: ReadonlyArray<OperationalActivity>): void {
    if (!events.length) return;
    const current = this.activity()[id] ?? [];
    const known = new Set(current.map((event) => event.id));
    const missing = events.filter((event) => !known.has(event.id));
    if (!missing.length) return;
    this.activity.update((activity) => ({
      ...activity,
      [id]: [...current, ...missing].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
  }

  /** Todo el historial del CRM, del más reciente al más antiguo. */
  allActivity(): ActivityEntry[] {
    return Object.entries(this.activity())
      .flatMap(([recordId, events]) => events.map((event) => ({ ...event, recordId })))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  addNote(
    id: string,
    message: string,
    attachments: ReadonlyArray<CrmAttachment>,
    pinned = false,
  ): void {
    const note: OperationalNote = {
      id: `note-${Date.now()}`,
      message,
      author: 'Andrea Torres',
      initials: 'AT',
      createdAt: new Date().toISOString(),
      pinned,
      attachments,
    };
    this.notes.update((notes) => ({ ...notes, [id]: [note, ...(notes[id] ?? [])] }));
    this.addActivity(id, 'Nota agregada', message, 'violet', 'Notas', 'CREATE');
  }

  deleteNote(recordId: string, noteId: string): void {
    this.notes.update((notes) => ({
      ...notes,
      [recordId]: (notes[recordId] ?? []).filter((note) => note.id !== noteId),
    }));
    this.addActivity(
      recordId,
      'Nota eliminada',
      `Se eliminó la nota ${noteId}.`,
      'amber',
      'Notas',
      'DELETE',
    );
  }

  /**
   * `attachments` es la lista final de la nota, no un agregado: el editor abre
   * con los archivos que ya tenía, así que lo que llega aquí ya refleja lo que
   * el usuario quitó o añadió. Concatenar haría imposible eliminar un archivo.
   */
  updateNote(
    recordId: string,
    noteId: string,
    message: string,
    pinned: boolean,
    attachments: ReadonlyArray<CrmAttachment>,
  ): void {
    this.notes.update((notes) => ({
      ...notes,
      [recordId]: (notes[recordId] ?? []).map((note) =>
        note.id === noteId ? { ...note, message, pinned, attachments: [...attachments] } : note,
      ),
    }));
    this.addActivity(recordId, 'Nota actualizada', message, 'blue', 'Notas', 'EDIT');
  }

  togglePinnedNote(recordId: string, noteId: string): void {
    this.notes.update((notes) => ({
      ...notes,
      [recordId]: (notes[recordId] ?? []).map((note) =>
        note.id === noteId ? { ...note, pinned: !note.pinned } : note,
      ),
    }));
    this.addActivity(
      recordId,
      'Nota fijada actualizada',
      'Cambió su visibilidad en el resumen.',
      'violet',
      'Notas',
      'EDIT',
    );
  }

  attachmentsFor(recordId: string): ReadonlyArray<CrmAttachment> {
    return this.recordAttachments()[recordId] ?? [];
  }

  addAttachments(recordId: string, attachments: ReadonlyArray<CrmAttachment>): void {
    if (!attachments.length) return;
    this.recordAttachments.update((current) => ({
      ...current,
      [recordId]: [...attachments, ...(current[recordId] ?? [])],
    }));
    this.addActivity(
      recordId,
      'Archivos agregados',
      `${attachments.length} archivo(s) se adjuntaron al registro.`,
      'blue',
      'Archivos',
      'CREATE',
    );
  }

  deleteAttachment(recordId: string, attachmentId: string): void {
    const attachment = this.attachmentsFor(recordId).find((file) => file.id === attachmentId);
    if (attachment?.url.startsWith('blob:')) URL.revokeObjectURL(attachment.url);
    this.recordAttachments.update((current) => ({
      ...current,
      [recordId]: (current[recordId] ?? []).filter((file) => file.id !== attachmentId),
    }));
    this.addActivity(
      recordId,
      'Archivo eliminado',
      'Se eliminó un archivo adjunto.',
      'amber',
      'Archivos',
      'DELETE',
    );
  }

  activityFor(id: string): ReadonlyArray<OperationalActivity> {
    const stored = this.activity()[id] ?? [];
    return [
      ...stored,
      {
        id: `created-${id}`,
        title: 'Registro creado',
        detail: 'El registro fue incorporado al CRM y quedó disponible para el equipo.',
        actor: 'Andrea Torres',
        createdAt: '2026-07-12T09:30:00-06:00',
        tone: 'green',
        module: 'Registro',
        actionType: 'CREATE',
      },
    ];
  }

  emailsFor(id: string): ReadonlyArray<OperationalEmail> {
    return this.emails()[id] ?? [];
  }

  saveEmail(
    id: string,
    value: {
      to: string;
      cc: string;
      from: string;
      subject: string;
      body: string;
      attachments: ReadonlyArray<CrmAttachment>;
    },
    draft: boolean,
    existingId?: string,
  ): void {
    const email: OperationalEmail = {
      id: existingId ?? `email-${Date.now()}`,
      ...value,
      sentBy: 'Andrea Torres',
      sentAt: new Date().toISOString(),
      status: draft ? 'DRAFT' : 'SENT',
    };
    this.emails.update((emails) => ({
      ...emails,
      [id]: existingId
        ? (emails[id] ?? []).map((item) => (item.id === existingId ? email : item))
        : [email, ...(emails[id] ?? [])],
    }));
    this.addActivity(
      id,
      draft ? 'Borrador de correo guardado' : 'Correo enviado',
      `${value.subject} · Para ${value.to || 'sin destinatario'}`,
      'blue',
      'Correos',
      draft && existingId ? 'EDIT' : 'CREATE',
    );
  }

  deleteEmail(id: string, emailId: string): void {
    const email = (this.emails()[id] ?? []).find((item) => item.id === emailId);
    if (!email) return;
    this.emails.update((emails) => ({
      ...emails,
      [id]: (emails[id] ?? []).filter((item) => item.id !== emailId),
    }));
    this.addActivity(
      id,
      'Borrador de correo eliminado',
      email.subject || 'Sin asunto',
      'amber',
      'Correos',
      'DELETE',
    );
  }

  logActivity(
    id: string,
    title: string,
    detail: string,
    tone: OperationalActivity['tone'],
    module: string,
    actionType: OperationalActivity['actionType'],
    extra: Pick<OperationalActivity, 'channel' | 'message' | 'phone'> = {},
  ): void {
    const item: OperationalActivity = {
      id: `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      detail,
      // Quien hizo el cambio: el usuario con sesión, no un nombre fijo.
      actor: this.session.user()?.name ?? 'Sistema',
      createdAt: new Date().toISOString(),
      tone,
      module,
      actionType,
      ...extra,
    };
    this.activity.update((activity) => ({
      ...activity,
      [id]: [item, ...(activity[id] ?? [])].slice(0, MAX_ACTIVITY_PER_RECORD),
    }));
  }

  private addActivity(
    id: string,
    title: string,
    detail: string,
    tone: OperationalActivity['tone'],
    module: string,
    actionType: OperationalActivity['actionType'],
  ): void {
    this.logActivity(id, title, detail, tone, module, actionType);
  }

  /** Un pago que deja la factura sin saldo la notifica como pagada. */
  private notifyInvoicePaid(payment: OperationalRecord): void {
    const key = String(payment['invoiceId'] ?? payment['invoice'] ?? '');
    const invoice = this.find('invoices', key) ?? this.recordsFor('invoices').find((item) => item['folio'] === key);
    if (!invoice || invoice['status'] === 'PAID') return;
    const paid = this.recordsFor('payments')
      .filter((item) => item['invoiceId'] === invoice.id || item['invoice'] === invoice.id || (!!invoice['folio'] && item['invoice'] === invoice['folio']))
      .reduce((sum, item) => sum + (Number(item['amount']) || 0), 0);
    if (paid >= (Number(invoice['total']) || 0)) emitWebhookEvent('invoice.paid', { ...invoice, paidAmount: paid });
  }

  /** Borra todos los registros de un módulo personalizado que se elimina. */
  clearModule(module: OperationalModuleKey): void {
    this.records.update((state) => {
      const { [module]: _removed, ...rest } = state;
      return rest;
    });
  }

  private moduleLabel(module: OperationalModuleKey): string {
    return moduleDefinition(module)?.title ?? module;
  }
}

function readActivity(): Record<string, ReadonlyArray<OperationalActivity>> {
  try {
    const stored = JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? 'null');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}
