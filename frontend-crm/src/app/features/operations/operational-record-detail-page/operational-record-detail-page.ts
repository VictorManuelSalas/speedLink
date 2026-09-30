import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';
import { CRM_DATA } from '../../../core/data-access/crm-data';
import { findSystemUser } from '../../../core/data-access/system-users';
import { CrmAttachment, Customer } from '../../../core/models/customer';
import { AttachmentPicker } from '../../../shared/attachment-picker';
import { FileUploadModal } from '../../../shared/file-upload-modal';
import { InlineEditableDateField } from '../../../shared/inline-editable-date-field';
import { RecordField, RecordFieldConfig } from '../../../shared/record-field';
import { PicklistOption, StyledPicklist } from '../../../shared/styled-picklist';
import {
  RecordDetailLayout,
  RecordHeader,
  RecordInformationCard,
  RecordQuickActions,
  RecordRecentActivity,
  RecordSummary,
  RecordTabItem,
  RecordTabs,
} from '../../../shared/record-detail-shell';
import {
  ColumnType,
  OPERATIONAL_MODULES,
  OperationalModuleKey,
  OperationalRecord,
  ModuleField,
} from '../operational-modules.data';
import { LeadEmailFormValue, LeadEmailModal, LeadEmailSeed } from '../lead-email-modal/lead-email-modal';
import { RecordEventsSection } from '../lead-events-section/lead-events-section';
import { OperationalEmail, OperationalStore } from '../operational-store';
import { lookupDisplayLabel, lookupPicklistOptions } from '../lookup-options';
import {
  DOCUMENT_ACTION_LABEL,
  ORGANIZATION,
  buildPrintableDocument,
} from '../printable-document/printable-document.data';
import { DocumentPdfService } from '../printable-document/document-pdf.service';
import { PendingEmailService } from '../pending-email.service';
import { TemplateStore } from '../../../core/data-access/templates/template-store';
import { RenderContext } from '../../../core/data-access/templates/template.model';
import {
  RecordActivitySection,
  RecordAttachmentsSection,
  RecordEmailsSection,
  RecordNotesSection,
} from '../record-sections/record-sections';
import { InterestedServicesSectionComponent } from '../record-sections/interested-services-section';
import { FileItem } from '../../../shared/file-item';
import { EquipmentAccessSection } from '../record-sections/equipment-access-section';
import { DeviceAccessStore } from '../../../core/equipment/device-access.store';
import { WIFI_BANDS } from '../../../core/equipment/device-access.model';
import { moduleDefinition, moduleRoute } from '../module-registry';
import { OrganizationStore } from '../../../core/organization/organization-store';
import { computeTax } from '../../../core/organization/organization.model';
import { whatsappLink } from '../../../core/connections/connections.model';
import { FileViewer, downloadAttachment } from '../../../shared/file-viewer.service';

type DetailTab = 'Resumen' | 'Acceso' | 'Correos' | 'Eventos' | 'Notas' | 'Actividad' | 'Archivos' | 'Contratos' | 'Asignaciones' | 'Relaciones' | 'Detalles' | 'Conciliación' | 'Comprobante' | 'Pagos';

interface RelatedItem {
  icon: string;
  title: string;
  detail: string;
  meta: string;
  tone: string;
  route?: ReadonlyArray<string>;
}

interface LookupPreview {
  type: string;
  title: string;
  detail: string;
  initials: string;
}

interface ContractItemDraft {
  id: string;
  serviceId: string;
  quantity: number;
  unitPrice: number;
  locked?: boolean;
}

const INTERNET_PERMANENCE_MONTHS = 6;

/**
 * Campos calculados en la capa de datos: no están en `columns` ni en `fields`,
 * así que sin esto la ficha los rotularía a partir de la clave ("Monthlyrevenue").
 */
const DERIVED_FIELDS: Readonly<Record<string, { label: string; type: ColumnType }>> = {
  monthlyRevenue: { label: 'Ingreso mensual', type: 'money' },
  taxRate: { label: 'Tasa aplicada (%)', type: 'text' },
};

@Component({
  selector: 'app-operational-record-detail-page',
  imports: [
    AttachmentPicker,
    FileItem,
    EquipmentAccessSection,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    FileUploadModal,
    InlineEditableDateField,
    LeadEmailModal,
    RecordDetailLayout,
    RecordField,
    RecordHeader,
    RecordInformationCard,
    RecordQuickActions,
    RecordRecentActivity,
    RecordSummary,
    RecordTabs,
    RecordActivitySection,
    RecordAttachmentsSection,
    RecordEmailsSection,
    RecordEventsSection,
    RecordNotesSection,
    InterestedServicesSectionComponent,
    RouterLink,
    StyledPicklist,
  ],
  templateUrl: './operational-record-detail-page.html',
  styleUrl: './operational-record-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationalRecordDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly crmData = inject(CRM_DATA);
  readonly store = inject(OperationalStore);
  private readonly pdf = inject(DocumentPdfService);
  private readonly organization = inject(OrganizationStore);
  private readonly fileViewer = inject(FileViewer);
  private readonly deviceAccess = inject(DeviceAccessStore);
  private readonly pendingEmail = inject(PendingEmailService);
  private readonly templates = inject(TemplateStore);
  readonly i18n = inject(LanguageService);
  readonly moduleKey = (this.route.snapshot.data['moduleKey'] ??
    this.route.snapshot.paramMap.get('moduleKey')) as OperationalModuleKey;
  readonly definition = moduleDefinition(this.moduleKey)!;
  /** `/leads` o `/m/cm_…`: los personalizados viven bajo `/m`. */
  readonly listRoute = moduleRoute(this.moduleKey);
  readonly leadGpsField: RecordFieldConfig = {
    key: 'coordinates',
    label: 'Ubicación GPS',
    kind: 'gps',
    editable: true,
  };
  readonly recordId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly record = computed(() => this.store.find(this.moduleKey, this.recordId));
  readonly tabs: ReadonlyArray<DetailTab> =
    this.moduleKey === 'leads'
      ? ['Resumen', 'Correos', 'Eventos', 'Notas', 'Archivos', 'Actividad']
      : this.moduleKey === 'services'
        ? ['Resumen', 'Contratos', 'Notas', 'Archivos', 'Actividad']
        : this.moduleKey === 'equipment'
          ? ['Resumen', 'Acceso', 'Asignaciones', 'Notas', 'Archivos', 'Actividad']
          : this.moduleKey === 'assignments'
            ? ['Resumen', 'Notas', 'Archivos', 'Actividad']
            : this.moduleKey === 'invoices'
              ? ['Resumen', 'Pagos', 'Notas', 'Archivos', 'Actividad']
              : this.moduleKey === 'payments'
                ? ['Resumen', 'Notas', 'Archivos', 'Actividad']
                : this.moduleKey === 'expenses'
                  ? ['Resumen', 'Notas', 'Archivos', 'Actividad']
                  : ['Resumen', 'Notas', 'Archivos', 'Actividad'];
  readonly activeTab = signal<DetailTab>('Resumen');
  readonly contractItems = signal<ReadonlyArray<ContractItemDraft>>([]);
  readonly contractTotal = computed(() =>
    this.contractItems().reduce((total, item) => total + item.quantity * item.unitPrice, 0),
  );
  readonly contractItemsValid = computed(
    () =>
      this.contractItems().length > 0 &&
      this.contractItems().every((item) => item.serviceId && item.quantity > 0),
  );
  readonly contractItemsDirty = signal(false);
  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab && this.tabs.includes(tab as DetailTab)) this.activeTab.set(tab as DetailTab);
    });
    if (this.moduleKey === 'contracts') {
      const record = this.record();
      if (record) {
        this.contractItems.set(
          this.parseContractItems(record).map((item) => ({
            id: `contract-item-${item.serviceId || 'svc'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            locked: this.store.find('services', item.serviceId)?.['type'] === 'Internet',
          })),
        );
      }
    }
  }
  recordTabs(id: string): ReadonlyArray<RecordTabItem> {
    const record = this.record();
    return this.tabs.map((label) => ({
      label,
      count:
        label === 'Notas'
          ? this.notes(id).length
          : label === 'Actividad'
            ? this.activity(id).length
            : label === 'Archivos'
              ? this.recordFiles(id).length
              : label === 'Correos'
                ? this.emails(id).length
                : label === 'Pagos'
                  ? this.invoicePayments().length
                  : (label === 'Contratos' || label === 'Asignaciones') && record
                    ? this.relatedItems(record).length
                    : undefined,
    }));
  }
  setActiveTab(value: string): void {
    if (this.tabs.includes(value as DetailTab)) this.activeTab.set(value as DetailTab);
  }
  readonly shareMenuOpen = signal(false);
  readonly shareCopied = signal(false);
  readonly emailComposerOpen = signal(false);
  readonly emailPreview = signal<OperationalEmail | null>(null);
  readonly emailComposeSeed = signal<LeadEmailSeed>({});
  readonly emailComposeKey = signal(0);
  readonly emailMenuId = signal<string | null>(null);
  readonly editingEmailId = signal<string | null>(null);
  readonly noteComposerOpen = signal(false);
  readonly noteDraft = signal('');
  readonly noteMenuId = signal<string | null>(null);
  readonly editingNoteId = signal<string | null>(null);
  readonly pinNewNote = signal(false);
  readonly selectedNoteId = signal<string | null>(null);
  readonly attachments = signal<ReadonlyArray<CrmAttachment>>([]);
  /** Archivos con los que se precarga el selector al editar una nota. */
  readonly editingNoteAttachments = signal<ReadonlyArray<CrmAttachment>>([]);
  readonly attachmentReset = signal(0);
  readonly uploadModalOpen = signal(false);
  readonly fileMenuId = signal<string | null>(null);
  /** Archivo con el Eliminar del menú pendiente de confirmar. */
  readonly fileDeleteConfirmId = signal<string | null>(null);
  readonly paymentMenuId = signal<string | null>(null);
  readonly paymentToDelete = signal<OperationalRecord | null>(null);
  readonly paymentMenuPosition = signal<{ top: number; left: number } | null>(null);
  readonly activityModule = signal('');
  readonly activityType = signal<'' | 'CREATE' | 'EDIT' | 'DELETE'>('');
  readonly activityDate = signal('');
  readonly activityModuleOptions = [
    'Registro',
    'Leads',
    'Clientes',
    'Tickets',
    'Servicios',
    'Equipamiento',
    'Asignaciones',
    'Contratos',
    'Facturas',
    'Pagos',
    'Gastos',
    'Notas',
    'Archivos',
    'Correos',
    'Calendario',
    'Configuración de organización',
    'Usuarios',
    'Roles y permisos',
    'SMTP',
    'SMS',
    'Portal',
    'Plantillas',
    'Módulos',
    'Automatizaciones',
    'Flujos de trabajo',
    'Programaciones',
    'Registro de actividad',
    'Auditoría',
    'Restricciones IP',
    'Inicio de sesión 2FA',
    'Webhooks',
    'APIs',
    'Integraciones',
  ];
  readonly summaryColumns = computed(() =>
    this.moduleKey === 'leads'
      ? [
          { key: 'type', label: 'Tipo de prospecto', type: 'text' as const },
          { key: 'source', label: 'Origen', type: 'text' as const },
          { key: 'status', label: 'Estado', type: 'status' as const },
          { key: 'phone', label: 'WhatsApp', type: 'text' as const },
        ]
      : this.moduleKey === 'assignments'
        ? [
            { key: 'client', label: 'Cliente', type: 'text' as const },
            { key: 'equipment', label: 'Equipo', type: 'text' as const },
            { key: 'status', label: 'Estado', type: 'status' as const },
            { key: 'assignedAt', label: 'Fecha de asignación', type: 'date' as const },
          ]
        : this.moduleKey === 'contracts'
          ? [
              // El número de contrato ya es el título y el estado está en la
              // pastilla: aquí van con quién, cuánto y hasta cuándo.
              { key: 'client', label: 'Cliente', type: 'text' as const },
              { key: 'totalMonthly', label: 'Mensualidad', type: 'money' as const },
              { key: 'startDate', label: 'Inicio', type: 'date' as const },
              { key: 'endDate', label: 'Vencimiento', type: 'date' as const },
            ]
        : this.moduleKey === 'equipment'
          ? [
              // El título sólo dice la categoría ("Antena CPE") y el estado ya
              // está en la pastilla del encabezado: aquí va qué unidad es,
              // dónde está y cómo identificarla.
              { key: 'model', label: 'Modelo', type: 'text' as const },
              { key: 'assignedTo', label: 'Asignado a', type: 'text' as const },
              { key: 'serialNumber', label: 'Serie', type: 'text' as const },
              { key: 'macAddress', label: 'MAC', type: 'text' as const },
            ]
        : this.moduleKey === 'services'
          ? [
              // El nombre del servicio ya es el título de la ficha; ese espacio
              // rinde más mostrando cuánto factura el plan.
              { key: 'type', label: 'Tipo', type: 'text' as const },
              { key: 'price', label: 'Precio de lista', type: 'money' as const },
              { key: 'contracts', label: 'Contratos', type: 'text' as const },
              { key: 'monthlyRevenue', label: 'Ingreso mensual', type: 'money' as const },
            ]
          : this.definition.columns.slice(0, 4),
  );
  readonly statusOptions = computed(() =>
    this.definition.fields.find((field) => field.key === 'status')?.options?.length
      ? [...(this.definition.fields.find((field) => field.key === 'status')?.options ?? [])]
      : Array.from(
          new Set(
            this.store
              .recordsFor(this.moduleKey)
              .map((item) => String(item['status'] ?? ''))
              .filter(Boolean),
          ),
        ),
  );
  primaryValue(record: OperationalRecord): string {
    return String(record[this.definition.columns[0].key] ?? record.id);
  }
  initials(value: string): string {
    return value
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  asString(value: string | number | boolean): string {
    return String(value);
  }
  asNumber(value: string | number | boolean): number {
    return Number(value) || 0;
  }
  editableInputType(key: string): 'text' | 'email' | 'tel' | 'date' {
    if (key === 'email') return 'email';
    if (key === 'phone' || key === 'cellphone') return 'tel';
    return 'text';
  }
  fieldDisplayValue(
    field: { type: string; inputType?: string; optionLabels?: Record<string, string> },
    value: string | number | boolean,
  ): string {
    if (field.type === 'money') {
      return new Intl.NumberFormat(this.i18n.locale(), {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 2,
      }).format(this.asNumber(value));
    }
    if ((field.inputType === 'select' || field.type === 'lookup') && field.optionLabels) {
      return field.optionLabels[String(value)] || '';
    }
    return '';
  }
  fieldActionHref(key: string, value: string | number | boolean): string {
    if (!value) return '';
    if (key === 'email') return 'mailto:' + String(value);
    if (key === 'phone' || key === 'cellphone')
      return 'tel:' + String(value).replace(/[^\d+]/g, '');
    return '';
  }
  whatsappUrl(value: string | number | boolean): string {
    return whatsappLink(value);
  }
  relatedRoute(key: string, value: string | number | boolean): ReadonlyArray<string> | null {
    const text = String(value ?? '');
    if (!text) return null;
    if (key === 'owner') return findSystemUser(text) ? ['/settings/users', text] : null;

    // Los lookups guardan la etiqueta visible y el id en su `schemaKey`:
    // resolver por ahí es exacto, sin depender del formato del texto.
    const configured = this.definition.fields.find((item) => item.key === key);
    if (configured?.lookupModule && configured.schemaKey) {
      const id = String(this.record()?.[configured.schemaKey] ?? '');
      if (id) return [`/${configured.lookupModule}`, id];
    }
    if (key === 'convertedToClientId') return ['/customers', text];
    if (key === 'invoice') {
      // If value is an ID (like INV-4520), use it directly
      // If it's a folio (like FAC-SL-1040-0), find the invoice by folio
      if (text.startsWith('INV-')) {
        return ['/invoices', text];
      } else {
        const invoice = this.store.recordsFor('invoices').find((r) => r['folio'] === text);
        return invoice ? ['/invoices', invoice.id] : null;
      }
    }
    if (key === 'client') {
      // If value is a customer ID (like SL-1040), use it directly
      // If it's a customer name (like "José Luis..."), find the customer by name
      if (text.startsWith('SL-')) {
        return ['/customers', text];
      } else {
        const customer = this.store.recordsFor('customers').find((r) => r['name'] === text);
        return customer ? ['/customers', customer.id] : null;
      }
    }
    if (key === 'equipment') {
      return text.startsWith('EQ-') ? ['/equipment', text] : null;
    }
    if (key === 'service') {
      const service = this.store
        .recordsFor('services')
        .find((record) => text.includes(String(record['name'])));
      return service ? ['/services', service.id] : null;
    }

    const field = this.definition.fields.find((f) => f.key === key);
    if (field?.options && field?.lookupModule) {
      return [`/${field.lookupModule}`, text];
    }
    return null;
  }
  lookupPreview(key: string, value: string | number | boolean): LookupPreview | null {
    if (key === 'owner') {
      const user = findSystemUser(String(value ?? ''));
      return user
        ? {
            type: 'Responsable del registro',
            title: user.fullName,
            detail: `${user.role} · ${user.email}`,
            initials: user.initials,
          }
        : null;
    }
    const route = this.relatedRoute(key, value);
    if (!route) return null;
    const text = String(value);
    const relatedModule = route[0].replace('/', '') as OperationalModuleKey;
    const related = moduleDefinition(relatedModule)
      ? this.store.find(relatedModule, route[1])
      : undefined;
    const title = related ? this.primaryValueForModule(relatedModule, related) : text;
    const typeLabels: Readonly<Record<string, string>> = {
      customers: 'Cliente relacionado',
      invoices: 'Factura relacionada',
      equipment: 'Equipo relacionado',
      services: 'Servicio relacionado',
    };
    return {
      type: typeLabels[relatedModule] ?? 'Registro relacionado',
      title,
      detail: related ? `${related.id} · Clic para abrir` : `${route[1]} · Clic para abrir`,
      initials: this.initials(title),
    };
  }
  private primaryValueForModule(module: OperationalModuleKey, record: OperationalRecord): string {
    return String(record[moduleDefinition(module)?.columns[0]?.key ?? 'name'] ?? record.id);
  }
  createdAt(record: OperationalRecord): string {
    return String(record['createdAt'] ?? '2026-07-12T09:30:00-06:00');
  }
  updatedAt(record: OperationalRecord): string {
    return String(
      record['updatedAt'] ?? record['date'] ?? record['assignedAt'] ?? '2026-07-18T12:00:00-06:00',
    );
  }
  formattedUpdatedAt(record: OperationalRecord): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(this.updatedAt(record)));
  }
  statusLabel(value: string | number | boolean): string {
    return String(value)
      .replaceAll('_', ' ')
      .toLocaleLowerCase()
      .replace(/^./, (letter) => letter.toUpperCase());
  }
  statusTone(value: string | number | boolean): string {
    const status = String(value);
    if (['ACTIVE', 'AVAILABLE', 'PAID', 'QUALIFIED', 'COMPLETED'].includes(status)) return 'green';
    if (['OVERDUE', 'DAMAGED', 'CANCELLED', 'LOST', 'EXPIRED'].includes(status)) return 'red';
    if (['PENDING', 'PENDING_SIGNATURE', 'IN_REPAIR', 'CONTACTED', 'RETURNED'].includes(status))
      return 'amber';
    if (['NEW', 'ASSIGNED', 'DRAFT'].includes(status)) return 'blue';
    return 'violet';
  }
  /**
   * Texto de apoyo del widget. Para el equipo asignado muestra el folio de la
   * asignación vigente, que es el registro al que lleva el enlace.
   */
  summaryHelper(key: string, record: OperationalRecord): string {
    if (this.moduleKey === 'equipment' && key === 'assignedTo') {
      const assignment = this.activeAssignmentFor(record.id);
      return assignment
        ? String(assignment['client'] ?? assignment['clientId'] ?? 'Cliente')
        : 'Sin asignación activa';
    }
    return this.statHelper(key);
  }
  statHelper(key: string): string {
    return (
      (
        {
          status: 'Estado actual',
          price: 'Precio vigente',
          contracts: 'Clientes con el plan',
          monthlyRevenue: 'De contratos activos',
          model: 'Marca y modelo',
          totalMonthly: 'Cargo recurrente',
          startDate: 'Inicio de vigencia',
          endDate: 'Fin de vigencia',
          assignedTo: 'Ubicación del equipo',
          serialNumber: 'Identificador físico',
          macAddress: 'Identificador de red',
          total: 'Importe registrado',
          amount: 'Importe registrado',
          client: 'Cuenta relacionada',
          updatedAt: 'Último movimiento',
          assignedAt: 'Fecha de entrega',
        } as Record<string, string>
      )[key] ?? 'Información principal'
    );
  }
  /**
   * Ids sombra de los lookups (`schemaKey`): el registro guarda `clientId`
   * junto a `client`, pero sólo el campo con etiqueta debe verse.
   */
  private readonly shadowIdKeys = new Set(
    this.definition.fields.map((field) => field.schemaKey).filter(Boolean) as string[],
  );
  displayFields(record: OperationalRecord) {
    // Los campos personalizados se muestran aunque estén vacíos: si no, no
    // habría dónde capturarlos en registros creados antes de agregarlos.
    const customKeys = this.definition.fields.filter((field) => field.custom).map((field) => field.key);
    return [...new Set([...Object.keys(record), ...customKeys])]
      .filter(
        (key) =>
          key !== 'id' &&
          key !== 'updatedAt' &&
          !this.shadowIdKeys.has(key) &&
          // El conteo de contratos ya está en los widgets y tiene su pestaña.
          !(this.moduleKey === 'services' && key === 'contracts') &&
          // Lo mismo con el cliente del equipo: vive en el widget y en su pestaña.
          !(this.moduleKey === 'equipment' && key === 'assignedTo') &&
          !(this.moduleKey === 'leads' && (key === 'latitude' || key === 'longitude')) &&
          !(this.moduleKey === 'contracts' && key === 'items') &&
          !(this.moduleKey === 'services' && key === 'updatedAt'),
      )
      .map((key) => {
        const column = this.definition.columns.find((item) => item.key === key);
        const configured = this.definition.fields.find((item) => item.key === key);
        const derived = DERIVED_FIELDS[key];
        return {
          key,
          label: column?.label ?? configured?.label ?? derived?.label ?? this.statusLabel(key),
          type:
            column?.type ??
            derived?.type ??
            (configured?.type === 'date' ? 'date' : 'text'),
          // Lo calculado (impuestos, total) se deriva de otros campos: no se edita.
          editable: Boolean(configured) && !configured?.computed,
          inputType:
            configured?.type === 'number'
              ? 'number'
              : configured?.type === 'date'
                ? 'date'
                : configured?.type === 'select'
                  ? 'select'
                  : configured?.type === 'lookup'
                    ? 'lookup'
                    : configured?.type === 'user'
                      ? 'user'
                      : 'text',
          options: configured?.options ?? [],
          optionLabels: configured?.optionLabels ?? {},
          configured,
        };
      });
  }
  operationalFieldConfig(
    field: ReturnType<OperationalRecordDetailPage['displayFields']>[number],
    record: OperationalRecord,
  ): RecordFieldConfig {
    const value = record[field.key];
    const isSelectOrLookup = field.inputType === 'select' || field.type === 'lookup';
    const hasOptions = field.options && field.options.length > 0;
    const route = this.relatedRoute(field.key, value) ?? undefined;
    const preview = route ? (this.lookupPreview(field.key, value) ?? undefined) : undefined;

    // Los lookups editables deben seguir siendo lookups si tienen route (para el link), pero también editables
    // Los select puros sin route son campos select normales
    const isUser = field.inputType === 'user';
    const kind: RecordFieldConfig['kind'] =
      isUser
        ? 'lookup'
        : field.type === 'status'
        ? 'status'
        : isSelectOrLookup && hasOptions && route
          ? 'lookup'
          : isSelectOrLookup && hasOptions && !route
            ? 'select'
            : route
              ? 'lookup'
              : field.type === 'date'
                ? 'date'
                : field.type === 'money' && !field.editable
                  ? 'money'
                  : field.inputType === 'number' && field.editable
                    ? 'text'
                    : this.editableInputType(field.key) === 'email'
                      ? 'email'
                      : this.editableInputType(field.key) === 'tel'
                        ? 'phone'
                        : field.type === 'money'
                          ? 'money'
                          : 'text';

    return {
      key: field.key,
      label: field.label,
      kind,
      editable: field.editable || (isSelectOrLookup && hasOptions),
      options: field.type === 'status' ? this.statusOptions() : field.options,
      // Sólo los lookups que apuntan a un módulo (o a usuarios) usan el picklist
      // buscable; los demás conservan su <select> simple.
      picklistOptions:
        field.configured && (isUser || field.configured.lookupModule)
          ? lookupPicklistOptions(this.store, field.configured, {
              currentValue: String(value ?? ''),
            })
          : undefined,
      placeholder: isUser ? 'Sin asignar' : undefined,
      optionLabels: field.optionLabels,
      href: this.fieldActionHref(field.key, value),
      displayValue: isUser
        ? (findSystemUser(String(value ?? ''))?.fullName ?? 'Sin asignar')
        : field.configured?.lookupModule
          ? lookupDisplayLabel(this.store, field.configured, String(value ?? ''))
          : this.fieldDisplayValue(field, value),
      route: kind === 'lookup' ? route : undefined,
      preview: kind === 'lookup' ? preview : undefined,
      statusLabel: this.statusLabel(value),
      statusTone: this.statusTone(value),
    };
  }
  operationalAuditField(key: string, label: string): RecordFieldConfig {
    return {
      key,
      label,
      kind: 'audit',
      auditUser: {
        id: 'usr-andrea-torres',
        fullName: 'Andrea Torres',
        email: 'andrea.torres@speedlink.mx',
        initials: 'AT',
      },
    };
  }
  saveOperationalField(record: OperationalRecord, key: string, value: string): void {
    if (this.moduleKey === 'leads' && key === 'status' && value === 'CONVERTED') {
      this.convertLead(record);
      return;
    }
    this.updateField(record.id, key, value);
  }
  updateField(id: string, key: string, value: string): void {
    const record = this.record();
    if (!record) return;

    const field = this.definition.fields.find((f) => f.key === key);
    if (!field) {
      this.store.update(this.moduleKey, id, { [key]: value });
      return;
    }

    let finalValue: any = value;

    // Validate and convert numeric fields
    if (field.type === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        console.warn(`Invalid number for field ${key}: "${value}"`);
        return;
      }
      if (field.min !== undefined && numValue < field.min) {
        console.warn(`Value ${numValue} is below minimum ${field.min} for field ${key}`);
        return;
      }
      if (field.max !== undefined && numValue > field.max) {
        console.warn(`Value ${numValue} is above maximum ${field.max} for field ${key}`);
        return;
      }
      finalValue = numValue;
    }

    const changes: Partial<OperationalRecord> = { [key]: finalValue };

    // Los lookups guardan la etiqueta visible y el id en su `schemaKey`.
    if (field.lookupModule && field.schemaKey) {
      changes[field.schemaKey] = finalValue;
      changes[key] = lookupDisplayLabel(this.store, field, String(finalValue)) || finalValue;
    }

    // Factura: cambiar subtotal o impuesto recalcula impuestos y total. Si sólo
    // cambia el subtotal se respeta la tasa con la que se emitió.
    if (this.moduleKey === 'invoices' && (key === 'subtotal' || key === 'taxName')) {
      const tax =
        key === 'taxName'
          ? this.organization.tax(String(finalValue))
          : { factor: 'rate' as const, rate: Number(record['taxRate'] ?? 0) };
      if (key === 'taxName' && tax && 'name' in tax) {
        changes['taxRateId'] = tax.id;
        changes['taxName'] = tax.name;
        changes['taxRate'] = tax.factor === 'rate' ? tax.rate : 0;
      }
      const subtotal = key === 'subtotal' ? Number(finalValue) : Number(record['subtotal']) || 0;
      const breakdown = computeTax(subtotal, tax);
      changes['subtotal'] = breakdown.subtotal;
      changes['taxAmount'] = breakdown.taxAmount;
      changes['total'] = breakdown.total;
    }

    // La serie pertenece a la unidad instalada: sigue al equipo.
    if (this.moduleKey === 'assignments' && key === 'equipment') {
      const unit = this.store.find('equipment', String(finalValue));
      changes['serial'] = unit ? String(unit['serialNumber'] ?? '') : '';
    }

    this.store.update(this.moduleKey, id, changes);
  }

  getLookupOptions(fieldKey: string): { options: ReadonlyArray<string>; optionLabels: Record<string, string> } {
    const configured = this.definition.fields.find((f) => f.key === fieldKey);
    if (!configured?.options) {
      return { options: [], optionLabels: {} };
    }
    return {
      options: configured.options,
      optionLabels: configured.optionLabels ?? {},
    };
  }
  leadCoordinates(record: OperationalRecord): string {
    return `${record['latitude'] ?? 19.432608}, ${record['longitude'] ?? -99.133209}`;
  }
  updateLeadCoordinates(id: string, coordinates: string): void {
    const [latitude, longitude] = coordinates.split(',').map((value) => Number(value.trim()));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    this.store.update('leads', id, { latitude, longitude });
  }
  /** Abre el alta de contrato con este servicio ya cargado como partida. */
  sellService(record: OperationalRecord): void {
    void this.router.navigate(['/contracts'], {
      queryParams: { create: 'true', serviceId: record.id },
    });
  }
  /** Abre el alta de servicio copiando los datos de éste. */
  duplicateService(record: OperationalRecord): void {
    void this.router.navigate(['/services'], {
      queryParams: { create: 'true', duplicate: record.id },
    });
  }
  serviceIsActive(record: OperationalRecord): boolean {
    return String(record['status'] ?? '') === 'ACTIVE';
  }
  /** Retira el plan del catálogo comercial, o lo vuelve a poner a la venta. */
  toggleServiceStatus(record: OperationalRecord): void {
    this.store.update('services', record.id, {
      status: this.serviceIsActive(record) ? 'INACTIVE' : 'ACTIVE',
    });
  }
  /** Cliente del contrato, para saber a dónde mandarlo. */
  private contractCustomer(record: OperationalRecord) {
    const id = String(record['clientId'] ?? '');
    return this.store.recordsFor('customers').find((customer) => customer.id === id);
  }
  contractHasCustomer(record: OperationalRecord): boolean {
    return !!this.contractCustomer(record);
  }
  /**
   * Prepara el correo con el contrato adjunto y abre el redactor en la ficha
   * del cliente, que es donde vive su historial de correos.
   */
  sendContractByEmail(record: OperationalRecord): void {
    const customer = this.contractCustomer(record);
    const document = this.buildDocument(record);
    const template = this.templates.forFeature('tpl-contract-send', 'contracts', 'email');
    if (!customer || !document || !template) return;
    const folio = String(record['contractNumber'] ?? record.id);
    const rendered = this.templates.render(template, this.renderContext(record));
    this.pendingEmail.queue(customer.id, {
      title: 'Enviar contrato',
      to: String(customer['email'] ?? ''),
      from: 'andrea.torres@speedlink.mx',
      subject: rendered.subject,
      body: rendered.body,
      attachments: [this.pdf.toAttachment(document, `contrato-${folio}.pdf`)],
    });
    void this.router.navigate(['/customers', customer.id], { queryParams: { tab: 'Correos' } });
  }
  /** Datos con los que se resuelven las variables de una plantilla. */
  private renderContext(record: OperationalRecord): RenderContext {
    return {
      record,
      organization: ORGANIZATION,
      userName: 'Andrea Torres',
      formatMoney: (value) => this.formatMoney(value),
      formatDate: (value) => this.formatDocumentDate(value),
    };
  }
  /** Mensaje de WhatsApp con el enlace al contrato. */
  contractWhatsappUrl(record: OperationalRecord): string {
    const customer = this.contractCustomer(record);
    const phone = customer?.['phone'];
    const template = this.templates.forFeature('tpl-contract-whatsapp', 'contracts', 'sms');
    const rendered = template
      ? this.templates.render(template, this.renderContext(record)).body
      : `Contrato ${String(record['contractNumber'] ?? record.id)}`;
    // El enlace apunta al CRM: el PDF no está alojado en ningún lado todavía.
    const message = `${rendered}

Consúltalo aquí: ${this.recordLink()}`;
    return whatsappLink(phone, message);
  }
  /** Etiqueta de la acción de documento, o null si el módulo no tiene uno. */
  documentActionLabel(): string | null {
    return DOCUMENT_ACTION_LABEL[this.moduleKey] ?? null;
  }
  private formatMoney(value: unknown): string {
    return new Intl.NumberFormat(this.i18n.locale(), {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }
  private formatDocumentDate(value: unknown): string {
    const date = new Date(String(value ?? ''));
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(this.i18n.locale(), {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }).format(date);
  }
  /** Documento del registro; null si el módulo no tiene uno definido. */
  private buildDocument(record: OperationalRecord) {
    return buildPrintableDocument(this.moduleKey, {
      record,
      wifiNetworks:
        this.moduleKey === 'assignments'
          ? this.deviceAccess
              .access(String(record['equipmentId'] ?? ''))
              .wifi.filter((network) => network.enabled)
              .map((network) => ({
                ssid: network.ssid,
                band: WIFI_BANDS.find((band) => band.value === network.band)?.label ?? network.band,
              }))
          : undefined,
      formatMoney: (value) => this.formatMoney(value),
      formatDate: (value) => this.formatDocumentDate(value),
      statusLabel: (value) => this.statusLabel(value as string),
      contractItems:
        this.moduleKey === 'contracts'
          ? this.parseContractItems(record).map((item) => ({
              name: String(this.store.find('services', item.serviceId)?.['name'] ?? item.serviceId),
              quantity: Number(item.quantity) || 1,
              unitPrice: Number(item.unitPrice) || 0,
            }))
          : undefined,
      // `invoiceId` es el enlace estable: `invoice` guarda a veces el folio
      // y a veces el id, según cómo se haya generado el pago.
      payments:
        this.moduleKey === 'invoices'
          ? this.store
              .recordsFor('payments')
              .filter(
                (payment) =>
                  payment['invoiceId'] === record.id ||
                  payment['invoice'] === record.id ||
                  (!!record['folio'] && payment['invoice'] === record['folio']),
              )
          : undefined,
    });
  }
  /** Genera el PDF del registro y lo descarga. */
  openDocument(record: OperationalRecord): void {
    const document = this.buildDocument(record);
    if (document) this.pdf.download(document);
  }
  toggleShareMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.shareCopied.set(false);
    this.shareMenuOpen.update((open) => !open);
  }
  /** URL absoluta del registro, para copiar o pegar en cualquier conversación. */
  recordLink(): string {
    return `${window.location.origin}/${this.moduleKey}/${this.recordId}`;
  }
  async copyRecordLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.recordLink());
    } catch {
      // Navegadores sin permiso de portapapeles: selección manual como respaldo.
      const helper = document.createElement('textarea');
      helper.value = this.recordLink();
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    this.shareCopied.set(true);
    window.setTimeout(() => {
      this.shareCopied.set(false);
      this.shareMenuOpen.set(false);
    }, 1400);
  }
  /** Ficha en texto plano lista para mandar al equipo por WhatsApp. */
  shareMessage(record: OperationalRecord): string {
    const lines: string[] = [];
    if (this.moduleKey === 'leads') {
      lines.push(`*Lead ${record.id}* · ${this.primaryValue(record)}`);
      if (record['type']) lines.push(`Tipo: ${record['type']}`);
      if (record['phone']) lines.push(`Teléfono: ${record['phone']}`);
      if (record['email']) lines.push(`Correo: ${record['email']}`);
      if (record['address']) lines.push(`Dirección: ${record['address']}`);
      if (record['latitude'] != null && record['longitude'] != null) {
        lines.push(
          `Ubicación: https://www.google.com/maps/search/?api=1&query=${record['latitude']},${record['longitude']}`,
        );
      }
      const services = this.interestedServicesSummary(record);
      if (services) lines.push(`Servicios de interés: ${services}`);
      lines.push(`Estado: ${this.statusLabel(record['status'])}`);
      const owner = findSystemUser(String(record['owner'] ?? ''));
      lines.push(`Responsable: ${owner ? `${owner.fullName} (${owner.role})` : 'Sin asignar'}`);
    } else {
      lines.push(`*${this.definition.singular.toUpperCase()} ${record.id}*`);
      lines.push(this.primaryValue(record));
      if (record['status']) lines.push(`Estado: ${this.statusLabel(record['status'])}`);
    }
    lines.push('', `Ver en el CRM: ${this.recordLink()}`);
    return lines.join('\n');
  }
  whatsappShareUrl(record: OperationalRecord): string {
    return `https://wa.me/?text=${encodeURIComponent(this.shareMessage(record))}`;
  }
  private interestedServicesSummary(record: OperationalRecord): string {
    const plan = String(record['plan'] ?? '');
    const streaming = record['streamingServices'];
    const streamingNames = Array.isArray(streaming) ? streaming.join(', ') : '';
    return [plan, streamingNames].filter(Boolean).join(', ');
  }
  openNoteComposerQuickAction(): void {
    this.activeTab.set('Notas');
    this.noteComposerOpen.set(true);
    setTimeout(() => this.noteComposerOpen.set(false));
  }
  openEmailComposer(): void {
    this.activeTab.set('Correos');
    const lead = this.record();
    this.emailComposeSeed.set({
      to: String(lead?.['email'] ?? ''),
      from: 'andrea.torres@speedlink.mx',
      title: 'Redactar mensaje',
    });
    this.emailComposeKey.update((value) => value + 1);
    this.editingEmailId.set(null);
    this.emailPreview.set(null);
    this.emailComposerOpen.set(true);
  }
  emails(id: string) {
    return this.store.emailsFor(id);
  }
  saveLeadEmail(id: string, value: LeadEmailFormValue, draft: boolean): void {
    this.store.saveEmail(id, value, draft, this.editingEmailId() ?? undefined);
    this.closeEmailComposer();
  }
  closeEmailComposer(): void {
    this.emailComposerOpen.set(false);
    this.editingEmailId.set(null);
  }
  openEmail(email: OperationalEmail): void {
    if (email.status === 'DRAFT') this.editDraft(email);
    else this.openEmailPreview(email);
  }
  openEmailPreview(email: OperationalEmail): void {
    this.emailMenuId.set(null);
    this.emailPreview.set(email);
  }
  toggleEmailMenu(event: MouseEvent, emailId: string): void {
    event.stopPropagation();
    this.emailMenuId.set(this.emailMenuId() === emailId ? null : emailId);
  }
  composeFromEmail(email: OperationalEmail, action: 'resend' | 'forward'): void {
    const forwarded = action === 'forward';
    this.emailComposeSeed.set({
      title: forwarded ? 'Reenviar correo' : 'Reenviar mensaje',
      to: forwarded ? '' : email.to,
      cc: forwarded ? '' : email.cc,
      from: email.from,
      subject: forwarded
        ? email.subject.startsWith('Fwd:')
          ? email.subject
          : `Fwd: ${email.subject}`
        : email.subject,
      body: forwarded
        ? `\n\n---------- Mensaje reenviado ----------\nDe: ${email.from}\nPara: ${email.to}\nAsunto: ${email.subject}\n\n${email.body}`
        : email.body,
      attachments: email.attachments,
    });
    this.emailComposeKey.update((value) => value + 1);
    this.editingEmailId.set(null);
    this.emailMenuId.set(null);
    this.emailPreview.set(null);
    this.emailComposerOpen.set(true);
  }
  editDraft(email: OperationalEmail): void {
    this.emailComposeSeed.set({
      title: 'Editar borrador',
      to: email.to,
      cc: email.cc,
      from: email.from,
      subject: email.subject,
      body: email.body,
      attachments: email.attachments,
    });
    this.editingEmailId.set(email.id);
    this.emailComposeKey.update((value) => value + 1);
    this.emailMenuId.set(null);
    this.emailPreview.set(null);
    this.emailComposerOpen.set(true);
  }
  openNoteComposer(): void {
    this.activeTab.set('Notas');
    this.noteComposerOpen.set(true);
  }
  isConvertedLead(record: OperationalRecord): boolean {
    return this.moduleKey === 'leads' && record['status'] === 'CONVERTED';
  }
  convertLead(lead: OperationalRecord): void {
    if (this.moduleKey !== 'leads' || this.isConvertedLead(lead)) return;
    const convertedAt = new Date().toISOString();
    const customerId =
      'SL-' +
      (1100 +
        this.store.recordsFor('leads').filter((item) => item['status'] === 'CONVERTED').length);
    const name = String(lead['name'] ?? 'Cliente convertido');
    const customer: Customer = {
      id: customerId,
      organizationId: 'speedlink-mx-01',
      createdAt: convertedAt,
      createdBy: { fullName: 'Andrea Torres', email: 'andrea.torres@speedlink.mx', initials: 'AT' },
      updatedAt: convertedAt,
      updatedBy: { fullName: 'Andrea Torres', email: 'andrea.torres@speedlink.mx', initials: 'AT' },
      name,
      initials: this.initials(name),
      email: String(lead['email'] ?? ''),
      phone: String(lead['phone'] ?? lead['cellphone'] ?? ''),
      address: String(lead['address'] ?? 'Dirección pendiente'),
      community: 'Comunidad pendiente',
      status: 'pending',
      plan: 'Por asignar',
      speed: 'Pendiente',
      monthlyFee: 0,
      billingDay: 1,
      currentBalance: 0,
      technician: 'Sin asignar',
      lastActivity: 'Convertido ahora',
      installDate: convertedAt,
      gpsLocation:
        String(lead['latitude'] ?? '19.4326') + ', ' + String(lead['longitude'] ?? '-99.1332'),
      ipAddress: 'Pendiente',
      equipment: [],
      invoices: [],
      payments: [],
      tickets: [],
      notes: [],
      timeline: [
        {
          id: 'conversion-' + Date.now(),
          title: 'Cliente convertido desde lead',
          detail: 'Origen: ' + String(lead['source'] ?? 'No especificado') + ' · Lead ' + lead.id,
          date: convertedAt,
          type: 'service',
          author: 'Andrea Torres',
        },
      ],
    };
    this.crmData.createCustomer(customer);
    this.store.update('leads', lead.id, {
      status: 'CONVERTED',
      convertedAt,
      convertedToClientId: customerId,
    });
  }
  notes(id: string) {
    return this.store.notesFor(id);
  }
  activity(id: string) {
    return this.store.activityFor(id);
  }
  filteredActivity(id: string) {
    const module = this.activityModule();
    const type = this.activityType();
    const date = this.activityDate();
    return this.activity(id).filter((event) => {
      const eventDate = this.localDateKey(event.createdAt);
      return (
        (!module || event.module === module) &&
        (!type || event.actionType === type) &&
        (!date || eventDate === date)
      );
    });
  }
  setActivityModule(event: Event): void {
    this.activityModule.set((event.target as HTMLSelectElement).value);
  }
  setActivityType(event: Event): void {
    this.activityType.set(
      (event.target as HTMLSelectElement).value as '' | 'CREATE' | 'EDIT' | 'DELETE',
    );
  }
  clearActivityFilters(): void {
    this.activityModule.set('');
    this.activityType.set('');
    this.activityDate.set('');
  }
  actionTypeLabel(type: 'CREATE' | 'EDIT' | 'DELETE'): string {
    return { CREATE: 'Creación', EDIT: 'Edición', DELETE: 'Eliminación' }[type];
  }
  private localDateKey(value: string): string {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  saveNote(id: string): void {
    const message = this.noteDraft().trim();
    if (!message) return;
    const editingId = this.editingNoteId();
    const pinned = this.pinNewNote() && this.canPinNote(id);
    if (editingId) this.store.updateNote(id, editingId, message, pinned, this.attachments());
    else this.store.addNote(id, message, this.attachments(), pinned);
    this.cancelNoteEdit();
  }
  deleteNote(id: string, noteId: string): void {
    this.store.deleteNote(id, noteId);
    if (this.editingNoteId() === noteId) this.cancelNoteEdit();
    this.noteMenuId.set(null);
  }
  toggleNoteMenu(event: MouseEvent, noteId: string): void {
    event.stopPropagation();
    this.noteMenuId.set(this.noteMenuId() === noteId ? null : noteId);
  }
  @HostListener('document:click') closeNoteMenu(): void {
    this.noteMenuId.set(null);
    this.fileMenuId.set(null);
    this.emailMenuId.set(null);
    this.shareMenuOpen.set(false);
  }
  recordFiles(recordId: string): ReadonlyArray<CrmAttachment> {
    return this.store.attachmentsFor(recordId);
  }
  handleRecordFilesUploaded(recordId: string, files: ReadonlyArray<CrmAttachment>): void {
    this.store.addAttachments(recordId, files);
    this.uploadModalOpen.set(false);
  }
  toggleFileMenu(event: MouseEvent, fileId: string): void {
    event.stopPropagation();
    this.fileDeleteConfirmId.set(null);
    this.fileMenuId.set(this.fileMenuId() === fileId ? null : fileId);
  }
  togglePaymentMenu(event: MouseEvent, paymentId: string): void {
    event.stopPropagation();
    const opening = this.paymentMenuId() !== paymentId;
    this.paymentMenuId.set(opening ? paymentId : null);
    if (opening) this.positionPaymentMenu(event.currentTarget as HTMLElement);
  }
  /**
   * El menú se posiciona en coordenadas de viewport porque la tabla vive en un
   * contenedor con `overflow`, que recortaría un menú posicionado dentro.
   * Si no cabe hacia abajo, se abre hacia arriba.
   */
  private positionPaymentMenu(trigger: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    const menuHeight = 132;
    const menuWidth = 168;
    const openUpward = rect.bottom + menuHeight + 8 > window.innerHeight;
    this.paymentMenuPosition.set({
      top: Math.max(8, openUpward ? rect.top - menuHeight - 6 : rect.bottom + 6),
      // El `max` evita que se salga por la izquierda en ventanas angostas.
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
    });
  }
  deleteRecordFile(recordId: string, fileId: string): void {
    this.store.deleteAttachment(recordId, fileId);
    this.fileMenuId.set(null);
    this.fileDeleteConfirmId.set(null);
  }
  viewRecordFile(recordId: string, file: CrmAttachment): void {
    this.fileMenuId.set(null);
    this.fileViewer.open(file, () => this.deleteRecordFile(recordId, file.id));
  }
  downloadRecordFile(file: CrmAttachment): void {
    this.fileMenuId.set(null);
    void downloadAttachment(file);
  }
  removeNoteAttachment(recordId: string, noteId: string, fileId: string): void {
    const note = this.store.notesFor(recordId).find((item) => item.id === noteId);
    if (!note) return;
    this.store.updateNote(
      recordId,
      noteId,
      note.message,
      note.pinned,
      note.attachments.filter((file) => file.id !== fileId),
    );
  }
  startEditingNote(recordId: string, noteId: string): void {
    const note = this.notes(recordId).find((item) => item.id === noteId);
    if (!note) return;
    this.noteComposerOpen.set(true);
    this.editingNoteId.set(noteId);
    this.noteDraft.set(note.message);
    this.pinNewNote.set(note.pinned);
    // El editor arranca con los archivos actuales de la nota para poder
    // quitarlos o sumarles otros; al guardar se manda la lista completa.
    this.attachments.set(note.attachments);
    this.editingNoteAttachments.set(note.attachments);
    this.attachmentReset.update((value) => value + 1);
    this.noteMenuId.set(null);
  }
  cancelNoteEdit(): void {
    this.noteDraft.set('');
    this.pinNewNote.set(false);
    this.editingNoteId.set(null);
    this.attachments.set([]);
    this.editingNoteAttachments.set([]);
    this.attachmentReset.update((value) => value + 1);
    this.noteComposerOpen.set(false);
  }
  pinnedNotes(recordId: string) {
    return this.notes(recordId)
      .filter((note) => note.pinned)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5);
  }
  sortedNotes(recordId: string) {
    return [...this.notes(recordId)].sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) || right.createdAt.localeCompare(left.createdAt),
    );
  }
  canPinNote(recordId: string): boolean {
    const editingId = this.editingNoteId();
    return (
      this.pinnedNotes(recordId).length < 5 ||
      this.notes(recordId).some((note) => note.id === editingId && note.pinned)
    );
  }
  canTogglePinned(recordId: string, pinned: boolean): boolean {
    return pinned || this.pinnedNotes(recordId).length < 5;
  }
  toggleDraftPin(recordId: string): void {
    if (this.pinNewNote()) this.pinNewNote.set(false);
    else if (this.canPinNote(recordId)) this.pinNewNote.set(true);
  }
  togglePinnedNote(recordId: string, noteId: string): void {
    const note = this.notes(recordId).find((item) => item.id === noteId);
    if (!note || !this.canTogglePinned(recordId, note.pinned)) return;
    this.store.togglePinnedNote(recordId, noteId);
    if (this.editingNoteId() === noteId) this.pinNewNote.set(!note.pinned);
    this.noteMenuId.set(null);
  }
  openPinnedNote(noteId: string): void {
    this.activeTab.set('Notas');
    this.selectedNoteId.set(noteId);
    window.setTimeout(() =>
      document
        .getElementById(`operational-note-${noteId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
    window.setTimeout(() => this.selectedNoteId.set(null), 2200);
  }
  formatSize(size: number): string {
    return size < 1024 * 1024
      ? `${Math.max(1, Math.round(size / 1024))} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  fileExtension(fileName: string): string {
    return fileName.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE';
  }
  relatedTitle(): string {
    return (
      {
        leads: 'Tareas de seguimiento',
        services: 'Contratos con este servicio',
        equipment: 'Asignaciones del equipo',
        assignments: 'Relaciones de la asignación',
        contracts: 'Servicios contratados',
        invoices: 'Conceptos y pagos',
        payments: 'Conciliación del pago',
        expenses: 'Comprobante y clasificación',
      } as Record<OperationalModuleKey, string>
    )[this.moduleKey];
  }
  relatedSubtitle(): string {
    return (
      {
        leads: 'Acciones pendientes y próximos compromisos',
        services: 'Clientes que tienen el plan activo',
        equipment: 'Historial de entrega y ubicación',
        assignments: 'Cliente y dispositivo vinculados',
        contracts: 'Partidas incluidas en el contrato',
        invoices: 'Detalle financiero de la factura',
        payments: 'Factura y referencia relacionadas',
        expenses: 'Evidencia y datos del egreso',
      } as Record<OperationalModuleKey, string>
    )[this.moduleKey];
  }
  /**
   * Contratos que incluyen este servicio, leídos de las partidas (`items`)
   * de cada contrato. Antes era una lista fija de 5 clientes inventados, igual
   * para todos los servicios.
   */
  serviceContracts(serviceId: string): ReadonlyArray<RelatedItem> {
    const statusTone: Readonly<Record<string, string>> = {
      ACTIVE: 'green',
      PENDING_SIGNATURE: 'amber',
      EXPIRED: 'red',
      CANCELLED: 'red',
    };
    return this.store
      .recordsFor('contracts')
      .flatMap((contract) => {
        const item = this.parseContractItems(contract).find(
          (entry) => entry.serviceId === serviceId,
        );
        if (!item) return [];
        const status = String(contract['status'] ?? '');
        return [
          {
            icon: '▤',
            title: `${String(contract['contractNumber'] ?? contract.id)} · ${String(contract['client'] ?? 'Cliente')}`,
            detail: `${item.quantity} × ${new Intl.NumberFormat(this.i18n.locale(), { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(item.unitPrice)}/mes`,
            meta: this.statusLabel(status),
            tone: statusTone[status] ?? 'blue',
            route: ['/contracts', contract.id],
          },
        ];
      });
  }
  /**
   * Historial de asignaciones de la unidad. Se filtra por `equipmentId`: el
   * campo `equipment` guarda el nombre y jamás coincidiría con el id. El
   * nombre del cliente sale de la propia asignación, no de una tabla fija.
   */
  equipmentAssignments(record: OperationalRecord): ReadonlyArray<RelatedItem> {
    const equipmentAssignments = this.store
      .recordsFor('assignments')
      .filter((item) => item['equipmentId'] === record.id);
    return equipmentAssignments.map((assignment) => {
      const clientName = String(assignment['client'] ?? assignment['clientId'] ?? 'Cliente');
      const statusTone = (status: string): string =>
        status === 'ACTIVE' ? 'green' : status === 'RETURNED' ? 'orange' : 'red';
      const statusLabel = (status: string): string =>
        status === 'ACTIVE' ? 'Activo' : status === 'RETURNED' ? 'Devuelto' : 'Inactivo';
      return {
        icon: '⌂',
        title: `${String(assignment['name'] ?? assignment.id)} · ${clientName}`,
        detail: String(assignment['assignedAt'] ?? 'Sin fecha'),
        meta: statusLabel(String(assignment['status'] ?? 'INACTIVE')),
        tone: statusTone(String(assignment['status'] ?? 'INACTIVE')),
        route: ['/assignments', assignment.id],
      };
    });
  }
  relatedItems(record: OperationalRecord): ReadonlyArray<RelatedItem> {
    const clientId = String(
      record['clientId'] ??
        (
          {
            'José Luis Hernández': 'SL-1040',
            'Morgan Díaz': 'SL-1041',
            'Consultorio Dental Sonríe': 'SL-1042',
            'Distribuidora Nova': 'SL-1043',
          } as Record<string, string>
        )[String(record['client'] ?? '')] ??
        '',
    );
    const equipmentId = String(
      record['equipmentId'] ??
        (
          {
            'Antena CPE': 'EQ-4092',
            'Router Wi-Fi': 'EQ-4091',
            'Access Point': 'EQ-4088',
          } as Record<string, string>
        )[String(record['equipment'] ?? '').split(' · ')[0]] ??
        '',
    );
    const map: Record<OperationalModuleKey, ReadonlyArray<RelatedItem>> = {
      leads: [
        {
          icon: '✓',
          title: 'Enviar propuesta comercial',
          detail: 'Asignada a Andrea Torres · Prioridad alta',
          meta: 'Hoy, 16:00',
          tone: 'violet',
        },
        {
          icon: '→',
          title: 'Validar cobertura en la dirección',
          detail: 'Pendiente · Requiere confirmación técnica',
          meta: '22 jul',
          tone: 'blue',
        },
      ],
      services: this.serviceContracts(record.id),
      equipment: this.equipmentAssignments(record),
      assignments: [
        {
          icon: '♙',
          title: String(record['client'] ?? 'Cliente'),
          detail: 'Cuenta relacionada con la instalación',
          meta: 'Ver cliente',
          tone: 'blue',
          route: clientId ? ['/customers', clientId] : undefined,
        },
        {
          icon: '▣',
          title: String(record['equipment'] ?? 'Equipo'),
          detail: String(record['serial'] ?? 'Inventario asociado'),
          meta: 'Asignado',
          tone: 'violet',
          route: equipmentId ? ['/equipment', equipmentId] : undefined,
        },
      ],
      contracts: this.contractRelatedItems(record),
      invoices: [
        {
          icon: '♙',
          title: String(record['client'] ?? 'Cliente relacionado'),
          detail: 'Titular de la factura',
          meta: 'Ver cliente',
          tone: 'violet',
          route: clientId ? ['/customers', clientId] : undefined,
        },
        {
          icon: '▤',
          title: 'Servicio mensual',
          detail: 'Plan de internet correspondiente al periodo',
          meta: String(record['total'] ?? '$0'),
          tone: 'blue',
        },
        {
          icon: '✓',
          title: 'Historial de pago',
          detail: 'Conciliación y referencia bancaria',
          meta: String(record['status'] ?? 'Pendiente'),
          tone: 'green',
          route: ['/payments', record.id === 'INV-4484' ? 'PAY-74020' : 'PAY-74021'],
        },
      ],
      payments: [
        {
          icon: '♙',
          title: String(record['client'] ?? 'Cliente relacionado'),
          detail: 'Cliente que realizó el pago',
          meta: 'Ver cliente',
          tone: 'violet',
          route: clientId ? ['/customers', clientId] : undefined,
        },
        {
          icon: '▤',
          title: String(record['invoice'] ?? 'Sin factura'),
          detail: 'Factura relacionada con el movimiento',
          meta: 'Ver factura',
          tone: 'blue',
          route: record['invoice'] ? ['/invoices', String(record['invoice'])] : undefined,
        },
        {
          icon: '✓',
          title: String(record['reference'] ?? 'Sin referencia'),
          detail: String(record['method'] ?? 'Método no indicado'),
          meta: 'Conciliado',
          tone: 'green',
        },
      ],
      expenses: [
        {
          icon: '▤',
          title: String(record['receiptUrl'] ?? 'Sin comprobante'),
          detail: 'Documento asociado al gasto',
          meta: 'Descargar',
          tone: 'blue',
        },
        {
          icon: '◎',
          title: String(record['category'] ?? 'OTHER'),
          detail: String(record['vendor'] ?? 'Proveedor no indicado'),
          meta: 'Clasificación',
          tone: 'amber',
        },
      ],
      customers: [
        {
          icon: '▤',
          title: String(record['name'] ?? 'Cliente'),
          detail: String(record['type'] ?? 'Tipo no indicado'),
          meta: String(record['status'] ?? 'ACTIVE'),
          tone: 'green',
        },
        {
          icon: '✉',
          title: String(record['email'] ?? 'Sin correo'),
          detail: 'Contacto principal',
          meta: 'Enviar',
          tone: 'blue',
        },
        {
          icon: '☎',
          title: String(record['phone'] ?? 'Sin teléfono'),
          detail: 'Teléfono de contacto',
          meta: 'Llamar',
          tone: 'violet',
        },
      ],
    };
    return map[this.moduleKey];
  }
  activityIcon(tone: string): string {
    return tone === 'green' ? '✓' : tone === 'amber' ? '!' : tone === 'violet' ? '▤' : '✎';
  }
  private contractRelatedItems(record: OperationalRecord): ReadonlyArray<RelatedItem> {
    let items: ReadonlyArray<{ serviceId: string; quantity: number; unitPrice: number }> = [];
    try {
      items = JSON.parse(String(record['items'] ?? '[]')) as typeof items;
    } catch {
      return [];
    }
    return items.map((item) => {
      const service = this.store.find('services', item.serviceId);
      const subtotal = (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
      return {
        icon: '⌁',
        title: String(service?.['name'] ?? item.serviceId),
        detail: `${String(service?.['type'] ?? 'Servicio')} · Cantidad ${item.quantity}`,
        meta: `${new Intl.NumberFormat(this.i18n.locale(), { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(subtotal)}/mes`,
        tone: String(service?.['type'] ?? '') === 'Internet' ? 'blue' : 'violet',
        route: ['/services', item.serviceId],
      };
    });
  }
  archive(id: string): void {
    this.store.archive(this.moduleKey, id);
    void this.router.navigateByUrl(this.listRoute);
  }
  private parseContractItems(
    record: OperationalRecord,
  ): ReadonlyArray<{ serviceId: string; quantity: number; unitPrice: number }> {
    try {
      const parsed = JSON.parse(String(record['items'] ?? '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  private hasOtherInternetItem(currentItemId: string): boolean {
    return this.contractItems().some((item) => {
      if (item.id === currentItemId || !item.serviceId) return false;
      return this.store.find('services', item.serviceId)?.['type'] === 'Internet';
    });
  }
  private monthsSince(dateValue: string): number {
    const start = new Date(dateValue);
    if (Number.isNaN(start.getTime())) return Infinity;
    const now = new Date();
    return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  }
  /** True while the client hasn't completed the mandatory 6-month permanence on
   * their current internet plan, so picking a *new* Internet service should be blocked
   * (they should get a new contract instead, via the plan-change flow). */
  internetPermanenceBlocked(clientId: string): boolean {
    if (!clientId) return false;
    const lastInternetStart = this.store
      .recordsFor('contracts')
      .filter((contract) => contract.id !== this.recordId && contract['clientId'] === clientId)
      .filter((contract) =>
        this.parseContractItems(contract).some(
          (item) => this.store.find('services', item.serviceId)?.['type'] === 'Internet',
        ),
      )
      .map((contract) => String(contract['startDate'] ?? ''))
      .sort()
      .at(-1);
    return !!lastInternetStart && this.monthsSince(lastInternetStart) < INTERNET_PERMANENCE_MONTHS;
  }
  contractServiceOptions(currentItemId: string): ReadonlyArray<PicklistOption> {
    const clientId = String(this.record()?.['clientId'] ?? '');
    const blockInternet =
      this.hasOtherInternetItem(currentItemId) || this.internetPermanenceBlocked(clientId);
    return this.store
      .recordsFor('services')
      .filter((service) => !(blockInternet && service['type'] === 'Internet'))
      .map((service) => ({
        value: service.id,
        label: String(service['name']),
        detail: `${String(service['type'])} · ${this.asNumber(service['price']) ? '$' + this.asNumber(service['price']) : 'Sin costo'}`,
      }));
  }
  addContractItem(): void {
    this.contractItems.update((items) => [
      ...items,
      { id: `contract-item-${Date.now()}`, serviceId: '', quantity: 1, unitPrice: 0 },
    ]);
    this.contractItemsDirty.set(true);
  }
  removeContractItem(id: string): void {
    const target = this.contractItems().find((item) => item.id === id);
    if (!target || target.locked || this.contractItems().length === 1) return;
    this.contractItems.update((items) => items.filter((item) => item.id !== id));
    this.contractItemsDirty.set(true);
  }
  updateContractItem(
    id: string,
    field: 'serviceId' | 'quantity' | 'unitPrice',
    value: string,
  ): void {
    let changed = false;
    this.contractItems.update((items) =>
      items.map((item) => {
        if (item.id !== id || item.locked) return item;
        if (field === 'serviceId') {
          const service = this.store.find('services', value);
          const isInternet = service?.['type'] === 'Internet';
          if (
            isInternet &&
            (this.hasOtherInternetItem(id) ||
              this.internetPermanenceBlocked(String(this.record()?.['clientId'] ?? '')))
          )
            return item;
          changed = true;
          return { ...item, serviceId: value, unitPrice: this.asNumber(service?.['price'] ?? 0) };
        }
        changed = true;
        return {
          ...item,
          [field]:
            field === 'quantity'
              ? Math.max(1, Number(value) || 1)
              : Math.max(0, Number(value) || 0),
        };
      }),
    );
    if (changed) this.contractItemsDirty.set(true);
  }
  saveContractItems(): void {
    if (!this.contractItemsValid() || !this.contractItemsDirty()) return;
    this.store.update('contracts', this.recordId, {
      totalMonthly: this.contractTotal(),
      items: JSON.stringify(
        this.contractItems().map(({ serviceId, quantity, unitPrice }) => ({
          serviceId,
          quantity,
          unitPrice,
        })),
      ),
    });
    this.contractItemsDirty.set(false);
  }
  /**
   * Asignación activa de este equipo. Se busca por `equipmentId`, no por
   * `equipment`, que guarda el nombre y nunca coincidiría con el id.
   */
  activeAssignmentFor(equipmentId: string): OperationalRecord | undefined {
    return this.store
      .recordsFor('assignments')
      .find((item) => item['equipmentId'] === equipmentId && item['status'] === 'ACTIVE');
  }
  canCreateNewAssignment(equipmentId: string): boolean {
    if (this.moduleKey !== 'equipment') return true;
    return !this.activeAssignmentFor(equipmentId);
  }
  /** Sólo se puede instalar una unidad libre y en buen estado. */
  canAssignEquipment(record: OperationalRecord): boolean {
    return String(record['status'] ?? '') === 'AVAILABLE' && this.canCreateNewAssignment(record.id);
  }
  /** Cierra la asignación activa y regresa la unidad al inventario. */
  returnEquipment(record: OperationalRecord): void {
    const assignment = this.activeAssignmentFor(record.id);
    if (assignment) {
      this.store.update('assignments', assignment.id, {
        status: 'RETURNED',
        returnedAt: new Date().toISOString().slice(0, 10),
      });
    }
    this.store.update('equipment', record.id, {
      status: 'AVAILABLE',
      assignedTo: '',
      assignedToId: '',
    });
  }
  equipmentNeedsRepair(record: OperationalRecord): boolean {
    return ['DAMAGED', 'IN_REPAIR'].includes(String(record['status'] ?? ''));
  }
  /** Reporta una falla o devuelve la unidad reparada al inventario. */
  toggleEquipmentFault(record: OperationalRecord): void {
    this.store.update('equipment', record.id, {
      status: this.equipmentNeedsRepair(record) ? 'AVAILABLE' : 'DAMAGED',
    });
  }
  openNewAssignmentForm(equipmentId: string): void {
    this.router.navigate(['/assignments'], {
      queryParams: { equipment: equipmentId }
    });
  }

  // Métodos para el módulo de facturas - Tab de Pagos
  readonly allInvoices = computed(() => {
    if (this.moduleKey !== 'invoices') return [];
    return this.store.records()['invoices'] ?? [];
  });

  readonly allPayments = computed(() => {
    if (this.moduleKey !== 'invoices') return [];
    return this.store.records()['payments'] ?? [];
  });

  readonly totalPaidAllTime = computed(() => {
    return this.allPayments().reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  });

  readonly totalPendingAmount = computed(() => {
    return this.allInvoices().reduce((sum: number, inv: any) => {
      const status = (inv.status?.toUpperCase?.() || inv.status).toUpperCase();
      if (status === 'PAID') return sum;
      const invPayments = this.allPayments().filter((p: any) => p.invoice === inv.id);
      const invPaid = invPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
      return sum + Math.max(0, (inv.total || 0) - invPaid);
    }, 0);
  });

  readonly pendingInvoicesCount = computed(() => {
    return this.allInvoices().filter((inv: any) => {
      const status = (inv.status?.toUpperCase?.() || inv.status).toUpperCase();
      if (status === 'PAID') return false;
      const invPayments = this.allPayments().filter((p: any) => p.invoice === inv.id);
      const invPaid = invPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
      return invPaid < (inv.total || 0);
    }).length;
  });

  /**
   * Pagos aplicados a ESTA factura. `invoiceId` es el enlace estable; `invoice`
   * guarda a veces el folio y a veces el id, según cómo se generó el pago.
   */
  readonly invoicePayments = computed(() => {
    if (this.moduleKey !== 'invoices') return [];
    const record = this.record();
    if (!record) return [];
    const folio = String(record['folio'] ?? '');
    return this.allPayments().filter(
      (payment: any) =>
        payment.invoiceId === record.id ||
        payment.invoice === record.id ||
        (!!folio && payment.invoice === folio),
    ) as any[];
  });

  /** Descarga el comprobante del pago, igual que desde el módulo de Pagos. */
  downloadPaymentReceipt(payment: OperationalRecord): void {
    const document = buildPrintableDocument('payments', {
      record: payment,
      formatMoney: (value) => this.formatMoney(value),
      formatDate: (value) => this.formatDocumentDate(value),
      statusLabel: (value) => this.statusLabel(value as string),
    });
    this.paymentMenuId.set(null);
    if (document) this.pdf.download(document);
  }
  /** Pide confirmación antes de borrar: un pago es un registro financiero. */
  confirmDeletePayment(payment: OperationalRecord): void {
    this.paymentToDelete.set(payment);
    this.paymentMenuId.set(null);
  }
  /** Elimina el pago del módulo de Pagos; la factura recalcula su saldo sola. */
  deletePayment(): void {
    const payment = this.paymentToDelete();
    if (!payment) return;
    this.store.archive('payments', payment.id);
    this.paymentToDelete.set(null);
  }
  /** Suma de lo aplicado a esta factura. */
  readonly invoicePaymentsTotal = computed(() =>
    this.invoicePayments().reduce(
      (sum: number, payment: any) => sum + (Number(payment.amount) || 0),
      0,
    ),
  );
  paymentMethodIcon(method: string): string {
    switch (method) {
      case 'Transferencia':
        return '🏦';
      case 'Efectivo':
        return '💵';
      case 'Tarjeta':
        return '💳';
      default:
        return '💰';
    }
  }

  getInvoiceIssueDate(invoice: any): string | null {
    return invoice?.issueDate ?? invoice?.issuedAt ?? null;
  }

  getInvoiceDueDate(invoice: any): string | null {
    return invoice?.dueDate ?? invoice?.dueAt ?? null;
  }

  getInvoiceTotal(invoice: any): number {
    return invoice?.total ?? 0;
  }

  getInvoiceStatus(invoice: any): string {
    return invoice?.status ?? '';
  }

  getPaymentDate(payment: any): string | null {
    return payment?.paidAt ?? payment?.date ?? null;
  }

  getPaymentAmount(payment: any): number {
    return payment?.amount ?? 0;
  }

  getInvoicePendingAmount(invoice: any): number {
    if (!invoice) return 0;
    const invoiceTotal = invoice.total || 0;
    const payments = this.allPayments().filter((p: any) => p.invoice === invoice.id);
    const paidAmount = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    return Math.max(0, invoiceTotal - paidAmount);
  }

  createNewPayment(): void {
    const currentRecord = this.record();
    if (!currentRecord) return;

    const invoiceId = currentRecord.id;
    const clientId = currentRecord['customer'] || currentRecord['client'] || '';

    this.router.navigate(['/payments'], {
      queryParams: {
        invoice: invoiceId,
        clientId: clientId,
        create: 'true'
      }
    });
  }
}
