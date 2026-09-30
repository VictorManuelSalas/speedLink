import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ImportValidationModal, ImportValidationResult } from './import-validation-modal';
import { InlineEditableDateField } from './inline-editable-date-field';
import { LanguageService } from '../core/i18n/language.service';
import { SessionContext } from '../core/auth/session-context';
import { AccessAction, AccessModuleKey } from '../core/auth/access.model';

/** Permiso que exige cada acción de la lista; las de consulta sólo piden "ver". */
function actionPermission(id: string): AccessAction {
  if (id === 'delete' || id === 'export') return id;
  if (id === 'view' || id === 'message') return 'read';
  return 'update';
}

export type RecordListValue = string | number | boolean | null | undefined;
export type RecordListRow = Readonly<Record<string, RecordListValue>>;
export type RecordListFieldType =
  | 'text'
  | 'number'
  | 'money'
  | 'date'
  | 'select'
  | 'status'
  | 'email'
  | 'phone'
  | 'boolean'
  | 'lookup';
export interface RecordListColumn {
  readonly key: string;
  readonly label: string;
  readonly type: RecordListFieldType | 'identity';
  readonly secondaryKey?: string;
}
export interface RecordListField {
  readonly key: string;
  readonly label: string;
  readonly type: RecordListFieldType;
  readonly options?: ReadonlyArray<string>;
  readonly required?: boolean;
}
export interface RecordListWidget {
  readonly label: string;
  readonly value: string | number;
  readonly detail: string;
  readonly tone?: string;
  readonly icon?: string;
}
export interface RecordListAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly danger?: boolean;
}
interface ActiveFilter {
  readonly id: string;
  field: string;
  operator: string;
  value: string;
  secondValue: string;
}

@Component({
  selector: 'app-record-list',
  imports: [CurrencyPipe, DatePipe, InlineEditableDateField, ImportValidationModal, RouterLink],
  templateUrl: './record-list.html',
  styleUrl: './record-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordList {
  readonly i18n = inject(LanguageService);
  private readonly session = inject(SessionContext);
  /** Módulo de permisos: oculta las acciones que el rol del usuario no permite. */
  readonly accessModule = input<AccessModuleKey | null>(null);
  readonly title = input.required<string>();
  readonly description = input('');
  readonly newLabel = input('Nuevo registro');
  readonly baseRoute = input.required<string>();
  readonly accent = input('#2563eb');
  readonly records = input.required<ReadonlyArray<RecordListRow>>();
  readonly columns = input.required<ReadonlyArray<RecordListColumn>>();
  readonly fields = input.required<ReadonlyArray<RecordListField>>();
  readonly widgets = input<ReadonlyArray<RecordListWidget>>([]);
  readonly rowActions = input<ReadonlyArray<RecordListAction>>([
    { id: 'view', label: 'Ver', icon: '↗' },
    { id: 'delete', label: 'Eliminar', icon: '⊘', danger: true },
  ]);
  readonly bulkActions = input<ReadonlyArray<RecordListAction>>([
    { id: 'edit', label: 'Editar', icon: '✎' },
    { id: 'export', label: 'Exportar', icon: '⇩' },
    { id: 'delete', label: 'Eliminar', icon: '⊘', danger: true },
  ]);
  readonly initialQuery = input('');
  can(action: AccessAction): boolean {
    const module = this.accessModule();
    return !module || this.session.hasPermission(`${module}.${action}`);
  }
  readonly visibleRowActions = computed(() =>
    this.rowActions().filter((action) => this.can(actionPermission(action.id))),
  );
  readonly visibleBulkActions = computed(() =>
    this.bulkActions().filter((action) => this.can(actionPermission(action.id))),
  );
  readonly newRequested = output<void>();
  readonly rowAction = output<{ actionId: string; record: RecordListRow }>();
  readonly bulkAction = output<{
    actionId: string;
    records: ReadonlyArray<RecordListRow>;
    field?: string;
    value?: string;
  }>();
  readonly recordsImported = output<ImportValidationResult>();
  readonly importModalOpen = signal(false);
  readonly query = signal('');
  readonly dense = signal(false);

  constructor() {
    effect(() => {
      const initialQuery = this.initialQuery();
      if (initialQuery) {
        this.query.set(initialQuery);
      }
    });
  }
  readonly filterPanel = signal(false);
  readonly filters = signal<ReadonlyArray<ActiveFilter>>([]);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  /** Registros a eliminar, esperando confirmación. */
  readonly pendingDelete = signal<{ rows: ReadonlyArray<RecordListRow>; bulk: boolean } | null>(
    null,
  );
  readonly menuId = signal<string | null>(null);
  readonly bulkEditor = signal(false);
  readonly bulkField = signal('');
  readonly bulkValue = signal('');
  readonly page = signal(1);
  readonly pageSize = 8;
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.records().filter(
      (row) =>
        (!q ||
          Object.values(row).some((v) =>
            String(v ?? '')
              .toLowerCase()
              .includes(q),
          )) &&
        this.filters().every((f) => this.matches(row, f)),
    );
  });
  readonly paginated = computed(() =>
    this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize),
  );
  readonly pageStart = computed(() =>
    this.filtered().length ? (this.page() - 1) * this.pageSize + 1 : 0,
  );
  readonly pageEnd = computed(() => Math.min(this.page() * this.pageSize, this.filtered().length));
  readonly selectedCount = computed(() => this.selected().size);
  readonly allPageSelected = computed(
    () =>
      this.paginated().length > 0 && this.paginated().every((r) => this.isSelected(this.rowId(r))),
  );
  rowId(row: RecordListRow) {
    return String(row['id'] ?? '');
  }
  display(v: RecordListValue) {
    return String(v ?? '');
  }
  number(v: RecordListValue) {
    return Number(v) || 0;
  }
  dateValue(v: RecordListValue) {
    return String(v ?? '');
  }
  initials(v: RecordListValue) {
    return this.display(v)
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join('')
      .toUpperCase();
  }
  statusLabel(v: RecordListValue) {
    return this.display(v)
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^./, (x) => x.toUpperCase());
  }
  statusTone(v: RecordListValue) {
    const s = this.display(v).toUpperCase();
    if (/ACTIVE|PAID|RESOLVED|COMPLETED|QUALIFIED/.test(s)) return 'green';
    if (/OVERDUE|CANCEL|DAMAGED|SUSPEND|URGENT/.test(s)) return 'red';
    if (/PENDING|WAITING|MEDIUM|CONTACTED/.test(s)) return 'amber';
    return 'blue';
  }
  widgetIcon(t: string) {
    return (
      ({ green: '✓', amber: '!', red: '↑', violet: '◎', blue: '▦' } as Record<string, string>)[t] ||
      '▦'
    );
  }
  actionIcon(id: string) {
    return (
      (
        { edit: '✎', export: '⇩', delete: '⊘', convert: '✓', message: '✉', view: '↗' } as Record<
          string,
          string
        >
      )[id] || '•'
    );
  }
  fieldFor(key: string) {
    return this.fields().find((f) => f.key === key);
  }
  operatorsFor(key: string) {
    const type = this.fieldFor(key)?.type ?? 'text';
    if (type === 'number' || type === 'money')
      return [
        { id: 'eq', label: 'Igual a' },
        { id: 'gt', label: 'Mayor que' },
        { id: 'lt', label: 'Menor que' },
        { id: 'between', label: 'Entre' },
      ];
    if (type === 'date')
      return [
        { id: 'eq', label: 'En la fecha' },
        { id: 'before', label: 'Antes de' },
        { id: 'after', label: 'Después de' },
        { id: 'between', label: 'Entre' },
      ];
    if (type === 'select' || type === 'status' || type === 'boolean')
      return [
        { id: 'eq', label: 'Es' },
        { id: 'neq', label: 'No es' },
      ];
    return [
      { id: 'contains', label: 'Contiene' },
      { id: 'eq', label: 'Es igual a' },
      { id: 'starts', label: 'Comienza con' },
      { id: 'empty', label: 'Está vacío' },
    ];
  }
  filterOptions(field: RecordListField) {
    return field.type === 'boolean'
      ? [
          { value: 'true', label: 'Sí' },
          { value: 'false', label: 'No' },
        ]
      : (field.options ?? []).map((v) => ({ value: v, label: this.statusLabel(v) }));
  }
  addFilter() {
    const first = this.fields()[0];
    this.filters.update((v) => [
      ...v,
      {
        id: `filter-${Date.now()}-${v.length}`,
        field: first?.key ?? '',
        operator: this.operatorsFor(first?.key ?? '')[0].id,
        value: '',
        secondValue: '',
      },
    ]);
  }
  removeFilter(id: string) {
    this.filters.update((v) => v.filter((f) => f.id !== id));
    this.page.set(1);
  }
  clearFilters() {
    this.filters.set([]);
    this.query.set('');
    this.page.set(1);
  }
  changeFilterField(id: string, field: string) {
    this.filters.update((v) =>
      v.map((f) =>
        f.id === id
          ? { ...f, field, operator: this.operatorsFor(field)[0].id, value: '', secondValue: '' }
          : f,
      ),
    );
  }
  updateFilter(id: string, key: 'operator' | 'value' | 'secondValue', value: string) {
    this.filters.update((v) => v.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
    this.page.set(1);
  }
  private matches(row: RecordListRow, f: ActiveFilter) {
    const field = this.fieldFor(f.field);
    if (!field) return true;
    const raw = row[f.field];
    const actual = String(raw ?? '').toLowerCase();
    const expected = f.value.toLowerCase();
    if (f.operator === 'empty') return !actual;
    if (!expected) return true;
    if (field.type === 'number' || field.type === 'money') {
      const a = Number(raw),
        b = Number(f.value),
        c = Number(f.secondValue);
      return f.operator === 'gt'
        ? a > b
        : f.operator === 'lt'
          ? a < b
          : f.operator === 'between'
            ? a >= b && a <= c
            : a === b;
    }
    if (field.type === 'date') {
      const a = new Date(String(raw)).getTime(),
        b = new Date(f.value).getTime(),
        c = new Date(f.secondValue).getTime();
      return f.operator === 'before'
        ? a < b
        : f.operator === 'after'
          ? a > b
          : f.operator === 'between'
            ? a >= b && a <= c
            : a === b;
    }
    return f.operator === 'neq'
      ? actual !== expected
      : f.operator === 'eq'
        ? actual === expected
        : f.operator === 'starts'
          ? actual.startsWith(expected)
          : actual.includes(expected);
  }
  isSelected(id: string) {
    return this.selected().has(id);
  }
  toggleSelection(id: string) {
    this.selected.update((v) => {
      const n = new Set(v);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  togglePageSelection() {
    const add = !this.allPageSelected();
    this.selected.update((v) => {
      const n = new Set(v);
      this.paginated().forEach((r) => (add ? n.add(this.rowId(r)) : n.delete(this.rowId(r))));
      return n;
    });
  }
  clearSelection() {
    this.selected.set(new Set());
  }
  selectedRows() {
    return this.records().filter((r) => this.selected().has(this.rowId(r)));
  }
  editableFields() {
    return this.fields().filter((field) => field.type !== 'lookup');
  }
  runBulkAction(id: string) {
    const rows = this.selectedRows();
    if (id === 'export') this.exportRows(rows, 'seleccionados');
    else if (id === 'edit') {
      this.bulkField.set(this.editableFields()[0]?.key ?? '');
      this.bulkValue.set('');
      this.bulkEditor.set(true);
      return;
    } else if (id === 'delete') {
      // Borrar varios de golpe no se deshace: se confirma antes de emitir.
      this.pendingDelete.set({ rows, bulk: true });
      return;
    } else this.bulkAction.emit({ actionId: id, records: rows });
    if (id !== 'edit') this.clearSelection();
  }
  confirmDelete() {
    const pending = this.pendingDelete();
    if (!pending) return;
    if (pending.bulk) {
      this.bulkAction.emit({ actionId: 'delete', records: pending.rows });
      this.clearSelection();
    } else {
      this.rowAction.emit({ actionId: 'delete', record: pending.rows[0] });
    }
    this.pendingDelete.set(null);
  }
  applyBulkEdit() {
    const field = this.bulkField();
    const value = this.bulkValue();
    if (!field || !value) return;
    this.bulkAction.emit({ actionId: 'edit', records: this.selectedRows(), field, value });
    this.bulkEditor.set(false);
    this.clearSelection();
  }
  toggleMenu(e: MouseEvent, id: string) {
    e.stopPropagation();
    this.menuId.set(this.menuId() === id ? null : id);
  }
  runRowAction(id: string, record: RecordListRow) {
    this.menuId.set(null);
    if (id === 'delete') {
      this.pendingDelete.set({ rows: [record], bulk: false });
      return;
    }
    this.rowAction.emit({ actionId: id, record });
  }
  @HostListener('document:click') closeMenu() {
    this.menuId.set(null);
  }
  exportRows(rows: ReadonlyArray<RecordListRow>, suffix: string) {
    const cols = this.columns();
    const csv = [
      cols.map((c) => this.csv(c.label)).join(','),
      ...rows.map((r) => cols.map((c) => this.csv(String(r[c.key] ?? ''))).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.title().toLowerCase().replaceAll(' ', '-')}${suffix ? '-' + suffix : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  private csv(v: string) {
    return `"${v.replaceAll('"', '""')}"`;
  }
  handleValidatedImport(result: ImportValidationResult): void {
    this.recordsImported.emit(result);
    this.importModalOpen.set(false);
  }
}
