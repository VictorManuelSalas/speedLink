import { CurrencyPipe } from '@angular/common';
import { AccessModuleKey, accessModules } from '../../../core/auth/access.model';
import { moduleDefinition, moduleRoute } from '../module-registry';
import { OrganizationStore } from '../../../core/organization/organization-store';
import { computeTax } from '../../../core/organization/organization.model';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CRM_DATA } from '../../../core/data-access/crm-data';
import { assignmentFolio } from '../../../core/data-access/models/operational-records';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldValidatorService } from '../../../core/services/field-validator.service';
import { Customer } from '../../../core/models/customer';
import {
  RecordList,
  RecordListAction,
  RecordListField,
  RecordListRow,
  RecordListWidget,
} from '../../../shared/record-list';
import { ImportValidationResult } from '../../../shared/import-validation-modal';
import { InlineEditableDateField } from '../../../shared/inline-editable-date-field';
import { PicklistOption, StyledPicklist } from '../../../shared/styled-picklist';
import {
  ModuleField,
  OPERATIONAL_MODULES,
  OperationalModuleKey,
  OperationalRecord,
} from '../operational-modules.data';
import { OperationalStore } from '../operational-store';
import { lookupDisplayLabel, lookupPicklistOptions } from '../lookup-options';
import { whatsappLink } from '../../../core/connections/connections.model';
import { mbpsIn } from '../../../core/network/mikrotik.model';

interface ContractItemDraft {
  id: string;
  serviceId: string;
  quantity: number;
  unitPrice: number;
  locked?: boolean;
}

const INTERNET_PERMANENCE_MONTHS = 6;

@Component({
  selector: 'app-operational-module-page',
  imports: [
    CurrencyPipe,
    InlineEditableDateField,
    RecordList,
    StyledPicklist,
  ],
  templateUrl: './operational-module-page.html',
  styleUrl: './operational-module-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationalModulePage {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(OperationalStore);
  private readonly organization = inject(OrganizationStore);
  private readonly crmData = inject(CRM_DATA);
  private readonly validator = inject(FieldValidatorService);
  readonly i18n = inject(LanguageService);
  /** Nativos lo traen en `data`; los personalizados, en el parámetro `/m/:moduleKey`. */
  readonly moduleKey = (this.route.snapshot.data['moduleKey'] ??
    this.route.snapshot.paramMap.get('moduleKey')) as OperationalModuleKey;
  /** Módulo de permisos equivalente; null si el módulo no tiene control de acceso propio. */
  readonly accessModule: AccessModuleKey | null = accessModules().some((m) => m.key === this.moduleKey)
    ? (this.moduleKey as AccessModuleKey)
    : null;
  readonly definition = moduleDefinition(this.moduleKey)!;
  /** `/leads` o `/m/cm_…`: los personalizados viven bajo `/m`. */
  readonly listRoute = moduleRoute(this.moduleKey);
  /** "Nuevo lead", "Nueva factura": el artículo concuerda con el género del sustantivo. */
  readonly newLabel = `${
    (this.definition.gender ?? (/(ción|ura)$/.test(this.definition.singular) ? 'f' : 'm')) === 'f'
      ? 'Nueva'
      : 'Nuevo'
  } ${this.definition.singular}`;
  readonly query = signal('');
  readonly statusFilter = signal('all');
  readonly dense = signal(false);
  readonly page = signal(1);
  readonly pageSize = 7;
  readonly createOpen = signal(false);
  readonly rowMenuId = signal<string | null>(null);
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly bulkEditOpen = signal(false);
  readonly bulkField = signal('status');
  readonly bulkValue = signal('');
  readonly draft = signal<Record<string, string>>({});
  readonly assignmentValidationError = signal<string>('');
  readonly contractItems = signal<ReadonlyArray<ContractItemDraft>>([]);
  readonly editingContractId = signal<string | null>(null);
  readonly editingContract = signal<{ contractNumber: string; clientName: string } | null>(null);
  readonly validationErrors = signal<Set<string>>(new Set());
  readonly contractTotal = computed(() =>
    this.contractItems().reduce((total, item) => total + item.quantity * item.unitPrice, 0),
  );
  readonly records = computed(() => this.store.recordsFor(this.moduleKey));
  readonly statusOptions = computed(() =>
    this.definition.fields.find((field) => field.key === 'status')?.options?.length
      ? [...(this.definition.fields.find((field) => field.key === 'status')?.options ?? [])]
      : Array.from(
          new Set(
            this.records()
              .map((record) => String(record['status'] ?? ''))
              .filter(Boolean),
          ),
        ),
  );
  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase(this.i18n.locale());
    return this.records().filter(
      (record) =>
        (this.statusFilter() === 'all'
          ? this.moduleKey !== 'leads' || record['status'] !== 'CONVERTED'
          : record['status'] === this.statusFilter()) &&
        (!query ||
          Object.values(record).some((value) =>
            String(value).toLocaleLowerCase(this.i18n.locale()).includes(query),
          )),
    );
  });
  readonly paginated = computed(() =>
    this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize),
  );
  readonly pageStart = computed(() =>
    this.filtered().length ? (this.page() - 1) * this.pageSize + 1 : 0,
  );
  readonly pageEnd = computed(() => Math.min(this.page() * this.pageSize, this.filtered().length));
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly allPageSelected = computed(
    () => this.paginated().length > 0 && this.paginated().every((item) => this.isSelected(item.id)),
  );
  readonly bulkOptions = computed(() => {
    const field = this.definition.fields.find((item) => item.key === this.bulkField());
    return field?.options ?? [];
  });
  readonly canCreate = computed(() => {
    const itemsReady =
      this.contractItems().length > 0 &&
      this.contractItems().every((item) => item.serviceId && item.quantity > 0);
    if (this.moduleKey === 'contracts' && this.editingContractId()) return itemsReady;
    const fieldsReady = this.definition.fields
      .filter((field) => field.required)
      .every((field) => this.draft()[field.key]?.trim());
    const hasErrors = this.validationErrors().size > 0;
    const hasAssignmentError = this.moduleKey === 'assignments' && this.assignmentValidationError();
    return (
      fieldsReady &&
      !hasErrors &&
      !hasAssignmentError &&
      !this.serviceSpeedMissing() &&
      (this.moduleKey !== 'contracts' || itemsReady)
    );
  });

  /**
   * Un servicio de Internet necesita su velocidad (en los campos o en el
   * nombre, p. ej. «Hogar 20 Mbps»): con ella se crea su perfil en MikroTik.
   */
  readonly serviceSpeedMissing = computed(() => {
    if (this.moduleKey !== 'services') return false;
    const draft = this.draft();
    return draft['type'] === 'Internet' && !(Number(draft['downloadMbps']) > 0) && !mbpsIn(draft['name']);
  });

  /** Campos condicionados (`showWhen`) se ocultan si no aplican al borrador. */
  isFieldVisible(field: ModuleField): boolean {
    return !field.showWhen || this.draft()[field.showWhen.field] === field.showWhen.equals;
  }

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const searchParam = params.get('search');
      if (searchParam) {
        this.query.set(searchParam);
      }
      const equipmentId = params.get('equipment');
      if (equipmentId && this.moduleKey === 'assignments') {
        this.openCreate({
          equipment: equipmentId,
          assignedAt: new Date().toISOString().slice(0, 10),
          status: 'ACTIVE',
        });
        return;
      }
      if (params.get('create') !== 'true') return;
      const clientId = params.get('clientId') ?? '';
      const invoiceId = params.get('invoice') ?? '';
      const serviceId = params.get('serviceId') ?? '';
      if (this.moduleKey === 'contracts') {
        this.openCreate({
          client: clientId,
          startDate: new Date().toISOString().slice(0, 10),
          status: 'PENDING_SIGNATURE',
          notes: serviceId
            ? 'Nuevo contrato generado desde el catálogo de servicios.'
            : 'Nuevo contrato generado por solicitud de cambio de plan.',
        });
        // Se viene desde un servicio: entra ya como primera partida del contrato.
        const service = serviceId ? this.store.find('services', serviceId) : undefined;
        if (service) {
          this.contractItems.set([
            {
              id: `contract-item-${service.id}`,
              serviceId: service.id,
              quantity: 1,
              unitPrice: Number(service['price']) || 0,
            },
          ]);
        }
      } else if (this.moduleKey === 'services') {
        const source = this.store.find('services', params.get('duplicate') ?? '');
        this.openCreate(
          source
            ? {
                name: `${String(source['name'])} (copia)`,
                description: String(source['description'] ?? ''),
                price: String(source['price'] ?? ''),
                type: String(source['type'] ?? ''),
                downloadMbps: String(source['downloadMbps'] ?? ''),
                uploadMbps: String(source['uploadMbps'] ?? ''),
                status: 'INACTIVE',
              }
            : params.get('type') === 'Internet'
              ? { type: 'Internet' }
              : {},
        );
      } else if (this.moduleKey === 'assignments') {
        this.openCreate({
          client: clientId,
          assignedAt: new Date().toISOString().slice(0, 10),
          status: 'ACTIVE',
        });
      } else if (this.moduleKey === 'payments') {
        this.openCreate({
          client: clientId,
          invoice: invoiceId,
        });
      } else if (this.moduleKey === 'invoices') {
        // Folio, fechas e impuesto salen de Ajustes > Organización / Impuestos.
        this.openCreate({ client: clientId });
      }
    });
  }
  listFields(): ReadonlyArray<RecordListField> {
    return this.definition.fields.map((field) => ({
      key: field.key,
      label: field.label,
      type:
        field.key === 'status'
          ? 'status'
          : field.type === 'number'
            ? 'number'
            : field.type === 'date'
              ? 'date'
              : field.type === 'select'
                ? 'select'
                : field.key.toLowerCase().includes('email')
                  ? 'email'
                  : field.key.toLowerCase().includes('phone')
                    ? 'phone'
                    : 'text',
      options: field.options,
      required: field.required,
    }));
  }
  listWidgets(): ReadonlyArray<RecordListWidget> {
    return this.definition.metrics.map((metric) => ({
      ...metric,
      icon: this.metricIcon(metric.tone),
    }));
  }
  listRowActions(): ReadonlyArray<RecordListAction> {
    if (this.moduleKey === 'leads') {
      return [
        { id: 'view', label: 'Ver', icon: '↗' },
        { id: 'convert', label: 'Convertir', icon: '✓' },
        { id: 'message', label: 'Enviar mensaje', icon: '✉' },
        { id: 'delete', label: 'Eliminar', icon: '⊘', danger: true },
      ];
    }
    const actions: RecordListAction[] = [{ id: 'view', label: 'Ver', icon: '↗' }];
    if (this.moduleKey === 'contracts')
      actions.push({ id: 'add-service', label: 'Agregar servicio', icon: '＋' });
    actions.push({ id: 'delete', label: 'Eliminar', icon: '⊘', danger: true });
    return actions;
  }
  listBulkActions(): ReadonlyArray<RecordListAction> {
    const common: RecordListAction[] = [
      { id: 'edit', label: 'Editar', icon: '✎' },
      { id: 'export', label: 'Exportar', icon: '⇩' },
    ];
    if (this.moduleKey === 'leads') common.push({ id: 'convert', label: 'Convertir', icon: '✓' });
    common.push({ id: 'delete', label: 'Eliminar', icon: '⊘', danger: true });
    return common;
  }
  handleListRowAction(actionId: string, row: RecordListRow): void {
    const record = this.records().find((item) => item.id === String(row['id']));
    if (!record) return;
    if (actionId === 'convert') this.convertLead(record);
    else if (actionId === 'message' && record['email'])
      window.location.href = `mailto:${String(record['email'])}`;
    else if (actionId === 'add-service') this.openEditContractItems(record);
    else if (actionId === 'delete') this.deleteRecord(record.id);
  }
  handleListBulkAction(
    actionId: string,
    rows: ReadonlyArray<RecordListRow>,
    field?: string,
    value?: string,
  ): void {
    this.selectedIds.set(new Set(rows.map((row) => String(row['id']))));
    if (actionId === 'edit' && field && value !== undefined) {
      const definition = this.definition.fields.find((item) => item.key === field);
      const normalized = definition?.type === 'number' ? Number(value) : value;
      rows.forEach((row) =>
        this.store.update(this.moduleKey, String(row['id']), { [field]: normalized }),
      );
      this.clearSelection();
    } else if (actionId === 'convert') this.convertSelected();
    else if (actionId === 'delete') this.deleteSelected();
  }
  importRecords(result: ImportValidationResult): void {
    const { mode, identifierKey, rows } = result;
    rows.forEach((row, index) => {
      const identifierValue = identifierKey ? String(row[identifierKey] ?? '') : '';
      const existing = identifierValue
        ? this.records().find((record) => String(record[identifierKey]) === identifierValue)
        : undefined;
      if (existing && mode !== 'insert') {
        this.store.update(this.moduleKey, existing.id, row as Partial<OperationalRecord>);
      } else if (!existing && mode !== 'update') {
        const record = {
          ...row,
          id: String(row['id'] || `${this.definition.idPrefix}-${Date.now() + index}`),
          createdAt: String(row['createdAt'] || new Date().toISOString()),
          updatedAt: new Date().toISOString(),
        } as OperationalRecord;
        this.store.add(this.moduleKey, record);
      }
    });
  }
  asString(value: string | number | boolean): string {
    return String(value);
  }
  asNumber(value: string | number | boolean): number {
    return Number(value) || 0;
  }
  initials(value: string | number | boolean): string {
    return String(value)
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
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
  metricIcon(tone: string): string {
    return (
      ({ green: '✓', amber: '!', red: '↑', violet: '◎', blue: '▦' } as Record<string, string>)[
        tone
      ] ?? '▦'
    );
  }
  /**
   * Siguiente número de contrato libre: `CTR-<año>-<consecutivo>`.
   *
   * Se calcula sobre los números ya usados, no sobre el total de registros:
   * contar registros repetiría folios si alguno se archiva.
   */
  private nextContractNumber(): string {
    const prefix = `CTR-${new Date().getFullYear()}-`;
    const used = new Set(
      this.store.recordsFor('contracts').map((record) => String(record['contractNumber'] ?? '')),
    );
    const highest = [...used]
      .filter((number) => number.startsWith(prefix))
      .reduce((max, number) => Math.max(max, Number(number.slice(prefix.length)) || 0), 3000);
    let next = highest + 1;
    while (used.has(`${prefix}${String(next).padStart(4, '0')}`)) next++;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }
  /** Campos que el usuario no captura porque el sistema los genera. */
  /**
   * Siguiente id libre: el mayor número usado + 1. Contar registros repetiría
   * ids en cuanto se elimina alguno.
   */
  private nextRecordId(): string {
    const prefix = `${this.definition.idPrefix}-`;
    const highest = this.records().reduce((max, record) => {
      const number = record.id.startsWith(prefix) ? Number(record.id.slice(prefix.length)) : NaN;
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 1000);
    return `${prefix}${highest + 1}`;
  }
  isGeneratedField(key: string): boolean {
    if (this.moduleKey === 'contracts' && key === 'contractNumber') return true;
    return !!this.definition.fields.find((field) => field.key === key)?.computed;
  }
  /** Valores iniciales de una factura según la organización y el catálogo de impuestos. */
  private invoiceDefaults(): Record<string, string> {
    const profile = this.organization.profile();
    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + profile.paymentTermsDays);
    return {
      folio: this.organization.previewInvoiceFolio(),
      issueDate: today.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      status: 'PENDING',
      taxName: this.organization.defaultTax()?.id ?? '',
    };
  }
  /** Impuestos y total de la factura en captura: siempre derivados, nunca escritos a mano. */
  private withInvoiceTotals(draft: Record<string, string>): Record<string, string> {
    const tax = this.organization.tax(draft['taxName'] ?? '');
    const breakdown = computeTax(Number(draft['subtotal']) || 0, tax);
    return { ...draft, taxAmount: String(breakdown.taxAmount), total: String(breakdown.total) };
  }
  openCreate(seed: Record<string, string> = {}): void {
    this.editingContractId.set(null);
    this.editingContract.set(null);
    const initialDraft =
      this.moduleKey === 'leads'
        ? { status: 'NEW', ...seed }
        : this.moduleKey === 'contracts'
          ? { ...seed, contractNumber: this.nextContractNumber() }
          : this.moduleKey === 'invoices'
            ? this.withInvoiceTotals({ ...this.invoiceDefaults(), ...seed })
            : seed;
    this.draft.set(initialDraft);
    this.validationErrors.set(new Set());
    this.contractItems.set(
      this.moduleKey === 'contracts'
        ? [{ id: `contract-item-${Date.now()}`, serviceId: '', quantity: 1, unitPrice: 0 }]
        : [],
    );
    this.createOpen.set(true);
  }
  openEditContractItems(record: OperationalRecord): void {
    if (this.moduleKey !== 'contracts') return;
    this.editingContractId.set(record.id);
    this.editingContract.set({
      contractNumber: String(record['contractNumber'] ?? record.id),
      clientName: String(record['client'] ?? ''),
    });
    this.draft.set({ client: String(record['clientId'] ?? '') });
    this.contractItems.set(
      this.parseContractItems(record).map((item) => ({
        id: `contract-item-${item.serviceId || 'svc'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        locked: this.store.find('services', item.serviceId)?.['type'] === 'Internet',
      })),
    );
    this.createOpen.set(true);
  }
  closeCreate(): void {
    this.createOpen.set(false);
    this.draft.set({});
    this.contractItems.set([]);
    this.editingContractId.set(null);
    this.editingContract.set(null);
    this.validationErrors.set(new Set());
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
  setDraft(key: string, value: string): void {
    this.draft.update((draft) => {
      const next = { ...draft, [key]: value };
      return this.moduleKey === 'invoices' && (key === 'subtotal' || key === 'taxName')
        ? this.withInvoiceTotals(next)
        : next;
    });
    this.validateField(key);
    if (this.moduleKey === 'assignments' && key === 'equipment' && value) {
      const assignments = this.store.records()['assignments'] || [];
      const activeAssignment = assignments.find(
        (a) => a['equipment'] === value && a['status'] === 'ACTIVE'
      );
      if (activeAssignment) {
        this.assignmentValidationError.set(
          'No se puede asignar este equipo. Ya existe una asignación activa.'
        );
      } else {
        this.assignmentValidationError.set('');
      }
    }
  }

  validateField(fieldKey: string): void {
    const field = this.definition.fields.find((f) => f.key === fieldKey);
    if (!field) return;

    const value = this.draft()[fieldKey] ?? '';
    const config = {
      required: field.required,
      validateAs: field.validateAs,
      min: field.min,
      max: field.max,
      minLength: field.minLength,
      maxLength: field.maxLength,
    };

    const result = this.validator.validateField(value, config);
    let hasError = !result.valid;

    if (this.moduleKey === 'assignments' && fieldKey === 'equipment' && value) {
      const assignments = this.store.records()['assignments'] || [];
      const activeAssignment = assignments.find(
        (a) => a['equipment'] === value && a['status'] === 'ACTIVE'
      );
      if (activeAssignment) {
        hasError = true;
      }
    }

    this.validationErrors.update((errors) => {
      const next = new Set(errors);
      if (hasError) {
        next.add(fieldKey);
      } else {
        next.delete(fieldKey);
      }
      return next;
    });
  }

  getFieldError(fieldKey: string): string | null {
    const field = this.definition.fields.find((f) => f.key === fieldKey);
    if (!field || !this.validationErrors().has(fieldKey)) return null;

    const value = this.draft()[fieldKey] ?? '';
    const config = {
      required: field.required,
      validateAs: field.validateAs,
      min: field.min,
      max: field.max,
      minLength: field.minLength,
      maxLength: field.maxLength,
    };

    const result = this.validator.validateField(value, config);
    return result.error || null;
  }
  fieldPicklistOptions(field: ModuleField): ReadonlyArray<PicklistOption> {
    if (field.type === 'select') {
      return (field.options ?? []).map((option) => ({
        value: option,
        label: field.optionLabels?.[option] || this.statusLabel(option),
      }));
    }
    return lookupPicklistOptions(this.store, field, {
      currentValue: this.draft()[field.key] || '',
    });
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
    const excludeId = this.editingContractId();
    const lastInternetStart = this.store
      .recordsFor('contracts')
      .filter((contract) => contract.id !== excludeId && contract['clientId'] === clientId)
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
    const clientId = this.draft()['client'] ?? '';
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
  }
  removeContractItem(id: string): void {
    const target = this.contractItems().find((item) => item.id === id);
    if (!target || target.locked || this.contractItems().length === 1) return;
    this.contractItems.update((items) => items.filter((item) => item.id !== id));
    this.syncContractTotal();
  }
  updateContractItem(
    id: string,
    field: 'serviceId' | 'quantity' | 'unitPrice',
    value: string,
  ): void {
    this.contractItems.update((items) =>
      items.map((item) => {
        if (item.id !== id || item.locked) return item;
        if (field === 'serviceId') {
          const service = this.store.find('services', value);
          const isInternet = service?.['type'] === 'Internet';
          if (
            isInternet &&
            (this.hasOtherInternetItem(id) ||
              this.internetPermanenceBlocked(this.draft()['client'] ?? ''))
          )
            return item;
          return { ...item, serviceId: value, unitPrice: this.asNumber(service?.['price'] ?? 0) };
        }
        return {
          ...item,
          [field]:
            field === 'quantity'
              ? Math.max(1, Number(value) || 1)
              : Math.max(0, Number(value) || 0),
        };
      }),
    );
    this.syncContractTotal();
  }
  private syncContractTotal(): void {
    this.setDraft('totalMonthly', String(this.contractTotal()));
  }
  inputType(
    key: string,
    type: 'text' | 'number' | 'date' | 'select' | 'status' | 'lookup',
    validateAs?: string,
  ): string {
    if (type !== 'text') return type;
    // Los campos personalizados declaran su formato; los nativos se deducen del nombre.
    if (validateAs === 'email') return 'email';
    if (validateAs === 'phone') return 'tel';
    if (validateAs === 'url') return 'url';
    if (key.toLowerCase().includes('email')) return 'email';
    if (key.toLowerCase().includes('phone') || key === 'cellphone') return 'tel';
    if (key.toLowerCase().includes('url')) return 'url';
    return 'text';
  }
  createRecord(): void {
    if (!this.canCreate()) return;
    if (this.moduleKey === 'contracts' && this.editingContractId()) {
      this.saveContractItemsEdit();
      return;
    }
    if (this.moduleKey === 'assignments') {
      const equipmentId = this.draft()['equipment'];
      if (equipmentId) {
        const assignments = this.store.records()['assignments'] || [];
        const activeAssignment = assignments.find(
          (a) => a['equipment'] === equipmentId && a['status'] === 'ACTIVE'
        );
        if (activeAssignment) {
          this.assignmentValidationError.set(
            'No se puede crear una nueva asignación. Existe una asignación activa para este equipo.'
          );
          return;
        }
      }
    }
    const now = new Date().toISOString();
    const record: OperationalRecord = {
      id: this.nextRecordId(),
      ...this.draft(),
      createdAt: now,
      updatedAt: now,
    };
    // Lo capturado en un campo que dejó de aplicar (p. ej. se cambió el tipo) no se guarda.
    for (const field of this.definition.fields) if (!this.isFieldVisible(field)) delete record[field.key];
    this.definition.fields.forEach((field) => {
      if (!this.isFieldVisible(field)) return;
      const rawValue = record[field.key];
      if (field.schemaKey && rawValue !== undefined && rawValue !== '') {
        record[field.schemaKey] = rawValue;
        // El campo visible guarda la etiqueta (nombre del cliente, del equipo…)
        // y `schemaKey` el id; se resuelve contra el catálogo en vivo.
        if (field.type === 'lookup' || field.optionLabels)
          record[field.key] = lookupDisplayLabel(this.store, field, String(rawValue)) || rawValue;
      }
      if (field.type === 'number') record[field.key] = Number(record[field.key]) || 0;
    });
    const dateDefault = (
      {
        assignments: 'assignedAt',
        invoices: 'issueDate',
        payments: 'paidAt',
      } as Partial<Record<OperationalModuleKey, string>>
    )[this.moduleKey];
    if (dateDefault && !record[dateDefault]) record[dateDefault] = now;
    if (this.moduleKey === 'invoices') {
      // La factura guarda la tasa con la que se emitió: si después se edita la
      // tasa en Ajustes, las facturas ya emitidas no cambian de importe.
      const tax = this.organization.tax(String(record['taxRateId'] ?? ''));
      const breakdown = computeTax(Number(record['subtotal']) || 0, tax);
      record['subtotal'] = breakdown.subtotal;
      record['taxAmount'] = breakdown.taxAmount;
      record['total'] = breakdown.total;
      record['taxRate'] = tax && tax.factor === 'rate' ? tax.rate : 0;
      record['taxName'] = tax?.name ?? 'Sin impuesto';
      // Reserva el folio sugerido para que la serie no se repita.
      if (record['folio'] === this.organization.previewInvoiceFolio())
        record['folio'] = this.organization.consumeInvoiceFolio();
    }
    if (this.moduleKey === 'payments' && !record['method']) record['method'] = 'CASH';
    if (this.moduleKey === 'contracts') {
      record['totalMonthly'] = this.contractTotal();
      record['items'] = JSON.stringify(
        this.contractItems().map(({ serviceId, quantity, unitPrice }) => ({
          serviceId,
          quantity,
          unitPrice,
        })),
      );
    }
    if (this.moduleKey === 'services')
      record['status'] = record['isActive'] === 'false' ? 'INACTIVE' : 'ACTIVE';
    if (this.moduleKey === 'assignments') {
      record['status'] = record['returnedAt'] ? 'RETURNED' : 'ACTIVE';
      // Folio automático, fijo desde su creación.
      record['name'] = assignmentFolio(this.records().length + 1, new Date().getFullYear());
      const unit = this.store.find('equipment', String(record['equipmentId'] ?? ''));
      if (unit) record['serial'] = String(unit['serialNumber'] ?? '');
    }
    if (!record['status'] && this.statusOptions().length)
      record['status'] = this.statusOptions()[0];
    this.store.add(this.moduleKey, record);

    // Si es un equipo con cliente asignado, crear registro de asignación
    if (this.moduleKey === 'equipment' && record['assignedToId']) {
      const assignmentRecord: OperationalRecord = {
        id: `ASG-${this.store.records()['assignments']?.length ?? 0 + 1001}`,
        clientId: record['assignedToId'],
        client: record['assignedTo'],
        equipmentId: record.id,
        equipment: record['name'],
        assignedAt: now,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };
      this.store.add('assignments', assignmentRecord);
    }

    this.closeCreate();
  }
  private saveContractItemsEdit(): void {
    const id = this.editingContractId();
    if (!id) return;
    this.store.update('contracts', id, {
      totalMonthly: this.contractTotal(),
      items: JSON.stringify(
        this.contractItems().map(({ serviceId, quantity, unitPrice }) => ({
          serviceId,
          quantity,
          unitPrice,
        })),
      ),
    });
    this.closeCreate();
  }
  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }
  toggleSelection(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  togglePageSelection(): void {
    const shouldSelect = !this.allPageSelected();
    this.selectedIds.update((current) => {
      const next = new Set(current);
      this.paginated().forEach((record) =>
        shouldSelect ? next.add(record.id) : next.delete(record.id),
      );
      return next;
    });
  }
  clearSelection(): void {
    this.selectedIds.set(new Set());
  }
  toggleRowMenu(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.rowMenuId.set(this.rowMenuId() === id ? null : id);
  }
  @HostListener('document:click')
  closeRowMenu(): void {
    this.rowMenuId.set(null);
  }
  whatsappUrl(value: string | number | boolean): string {
    return whatsappLink(value);
  }
  deleteRecord(id: string): void {
    this.store.archive(this.moduleKey, id);
    this.selectedIds.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    this.rowMenuId.set(null);
  }
  deleteSelected(): void {
    [...this.selectedIds()].forEach((id) => this.store.archive(this.moduleKey, id));
    this.clearSelection();
  }
  openBulkEdit(): void {
    this.bulkField.set('status');
    this.bulkValue.set('');
    this.bulkEditOpen.set(true);
  }
  setBulkField(field: string): void {
    this.bulkField.set(field);
    this.bulkValue.set('');
  }
  applyBulkEdit(): void {
    const value = this.bulkValue();
    if (!value) return;
    const records = this.records().filter((item) => this.selectedIds().has(item.id));
    records.forEach((record) => {
      if (this.bulkField() === 'status' && value === 'CONVERTED') this.convertLead(record);
      else this.store.update(this.moduleKey, record.id, { [this.bulkField()]: value });
    });
    this.bulkEditOpen.set(false);
    this.clearSelection();
  }
  convertSelected(): void {
    this.records()
      .filter((item) => this.selectedIds().has(item.id))
      .forEach((record) => this.convertLead(record));
    this.clearSelection();
  }
  convertLead(lead: OperationalRecord): void {
    if (this.moduleKey !== 'leads' || lead['status'] === 'CONVERTED') return;
    const convertedAt = new Date().toISOString();
    const customerId = `SL-${1100 + this.records().filter((item) => item['status'] === 'CONVERTED').length}`;
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
      phone: String(lead['phone'] ?? ''),
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
      gpsLocation: `${lead['latitude'] ?? '19.4326'}, ${lead['longitude'] ?? '-99.1332'}`,
      ipAddress: 'Pendiente',
      equipment: [],
      invoices: [],
      payments: [],
      tickets: [],
      notes: [],
      timeline: [
        {
          id: `conversion-${Date.now()}`,
          title: 'Cliente convertido desde lead',
          detail: `Origen: ${lead['source'] ?? 'No especificado'} · Lead ${lead.id}`,
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
    this.rowMenuId.set(null);
  }
  exportSelected(): void {
    this.downloadCsv(
      this.records().filter((item) => this.selectedIds().has(item.id)),
      `${this.moduleKey}-seleccionados.csv`,
    );
  }
  exportCsv(): void {
    this.downloadCsv(this.filtered(), `${this.moduleKey}.csv`);
  }
  private downloadCsv(records: ReadonlyArray<OperationalRecord>, fileName: string): void {
    const columns = this.definition.columns;
    const lines = [
      columns.map((column) => column.label).join(','),
      ...records.map((record) =>
        columns
          .map((column) => `"${String(record[column.key] ?? '').replaceAll('"', '""')}"`)
          .join(','),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
}
