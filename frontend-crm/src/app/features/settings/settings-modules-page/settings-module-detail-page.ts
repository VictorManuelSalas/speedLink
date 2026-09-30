import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { SessionContext } from '../../../core/auth/session-context';
import { TicketStore } from '../../../core/data-access/ticket-store';
import {
  CustomField,
  CustomFieldType,
  FIELD_TYPES,
  isCustomModuleKey,
  isHiddenInMenu,
  toApiName,
} from '../../../core/modules/custom-modules.model';
import {
  FieldInput,
  LOOKUP_TARGETS,
  ModulesStore,
  NATIVE_MODULES,
} from '../../../core/modules/modules-store';
import { moduleDefinition, moduleRoute } from '../../operations/module-registry';
import { OperationalStore } from '../../operations/operational-store';
import { ModuleFormDialog } from './module-form-dialog';

const EMPTY_FIELD: FieldInput = {
  label: '',
  type: 'text',
  required: false,
  helpText: '',
  options: [],
  showInList: false,
};

const SYSTEM_TYPE_LABELS: Readonly<Record<string, string>> = {
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  select: 'Lista de selección',
  status: 'Estado',
  lookup: 'Búsqueda',
  user: 'Usuario',
};

@Component({
  selector: 'app-settings-module-detail-page',
  imports: [FormsModule, ModuleFormDialog, RouterLink],
  templateUrl: './settings-module-detail-page.html',
  styleUrls: ['../settings-pages.scss', './settings-modules.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModuleDetailPage {
  readonly store = inject(ModulesStore);
  private readonly session = inject(SessionContext);
  private readonly operations = inject(OperationalStore);
  private readonly tickets = inject(TicketStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly fieldTypes = FIELD_TYPES;

  readonly key = toSignal(this.route.paramMap.pipe(map((params) => params.get('key') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('key') ?? '',
  });
  readonly justCreated = this.route.snapshot.queryParamMap.has('created');
  readonly isCustom = computed(() => isCustomModuleKey(this.key()));
  readonly native = computed(() => NATIVE_MODULES.find((module) => module.key === this.key()));
  readonly custom = computed(() => this.store.customModule(this.key()));
  readonly exists = computed(() => !!this.native() || !!this.custom());
  readonly title = computed(() => this.custom()?.plural ?? this.native()?.label ?? 'Módulo');
  readonly icon = computed(() => this.custom()?.icon ?? this.native()?.icon ?? '');
  readonly inMenu = computed(() => this.custom()?.showInMenu ?? !isHiddenInMenu(this.key()));
  readonly listRoute = computed(() => this.native()?.route ?? moduleRoute(this.key()));
  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));

  /** Campos propios del módulo: se ven pero no se editan. */
  readonly systemFields = computed(() => {
    const custom = this.custom();
    if (custom) return [{ label: custom.primaryLabel, type: 'Texto', required: true }];
    const builtIn = this.native()?.builtIn;
    if (builtIn) return builtIn.map((label) => ({ label, type: 'Sistema', required: false }));
    return (moduleDefinition(this.key())?.fields ?? [])
      .filter((field) => !field.custom)
      .map((field) => ({
        label: field.label,
        type: field.computed ? 'Calculado' : (SYSTEM_TYPE_LABELS[field.type] ?? field.type),
        required: !!field.required,
      }));
  });
  readonly customFields = computed(() => this.store.fieldsOf(this.key()));

  readonly lookupTargets = computed(() => [
    ...LOOKUP_TARGETS.map((key) => ({
      key,
      label: NATIVE_MODULES.find((module) => module.key === key)?.label ?? key,
    })),
    ...this.store.custom().map((module) => ({ key: module.key, label: module.plural })),
  ].filter((target) => target.key !== this.key()));

  // Editor de campo
  readonly editor = signal<{ key: string | null } | null>(null);
  readonly fieldDraft = signal<FieldInput>({ ...EMPTY_FIELD });
  readonly optionsText = signal('');
  readonly fieldError = signal('');
  readonly apiPreview = computed(() => `cf_${toApiName(this.fieldDraft().label) || 'campo'}`);

  // Confirmaciones
  readonly deletingField = signal<CustomField | null>(null);
  readonly editingModule = signal(false);
  readonly deletingModule = signal(false);
  readonly confirmName = signal('');
  readonly toast = signal('');

  typeHint(): string {
    return FIELD_TYPES.find((item) => item.value === this.fieldDraft().type)?.hint ?? '';
  }

  typeLabel(type: CustomFieldType): string {
    return FIELD_TYPES.find((item) => item.value === type)?.label ?? type;
  }

  lookupLabel(key?: string): string {
    return this.lookupTargets().find((target) => target.key === key)?.label ?? key ?? '';
  }

  /** Registros con algún dato en el campo: se avisa antes de quitarlo. */
  usage(field: CustomField): number {
    const key = this.key();
    if (this.native()?.storage === 'card') {
      const prefix = `${key}:`;
      return Object.entries(this.store.values()).filter(
        ([id, values]) => id.startsWith(prefix) && values[field.key],
      ).length;
    }
    return this.operations
      .recordsFor(key as never)
      .filter((record) => record[field.key] !== undefined && record[field.key] !== '').length;
  }

  recordCount(): number {
    const key = this.key();
    return key === 'tickets' ? this.tickets.tickets().length : this.operations.recordsFor(key as never).length;
  }

  // ------------------------------------------------------------ Campos

  openCreateField(): void {
    this.fieldDraft.set({ ...EMPTY_FIELD });
    this.optionsText.set('');
    this.fieldError.set('');
    this.editor.set({ key: null });
  }

  openEditField(field: CustomField): void {
    this.fieldDraft.set({
      label: field.label,
      type: field.type,
      required: field.required,
      helpText: field.helpText,
      options: field.options,
      lookupModule: field.lookupModule,
      showInList: field.showInList,
    });
    this.optionsText.set(field.options.join('\n'));
    this.fieldError.set('');
    this.editor.set({ key: field.key });
  }

  setField<K extends keyof FieldInput>(key: K, value: FieldInput[K]): void {
    this.fieldDraft.update((draft) => ({ ...draft, [key]: value }));
    this.fieldError.set('');
  }

  saveField(event: Event): void {
    event.preventDefault();
    const editor = this.editor();
    if (!editor) return;
    const input: FieldInput = {
      ...this.fieldDraft(),
      options: this.optionsText().split('\n'),
    };
    const result = editor.key
      ? this.store.updateField(this.key(), editor.key, input)
      : this.store.addField(this.key(), input);
    if (!result.ok) return this.fieldError.set(result.error);
    this.editor.set(null);
    this.notify(editor.key ? 'Campo actualizado' : `Campo «${result.value.label}» agregado`);
  }

  move(field: CustomField, direction: -1 | 1): void {
    this.store.moveField(this.key(), field.key, direction);
  }

  confirmDeleteField(): void {
    const field = this.deletingField();
    if (!field) return;
    this.store.deleteField(this.key(), field.key);
    this.deletingField.set(null);
    this.notify(`Campo «${field.label}» eliminado`);
  }

  // ------------------------------------------------------------ Módulo

  toggleMenu(): void {
    this.store.setMenuVisibility(this.key(), !this.inMenu());
    this.notify(this.inMenu() ? 'El módulo aparece en el menú' : 'El módulo ya no aparece en el menú');
  }

  moduleSaved(): void {
    this.editingModule.set(false);
    this.notify('Módulo actualizado');
  }

  deleteModule(): void {
    const module = this.custom();
    if (!module || this.confirmName().trim() !== module.plural) return;
    this.operations.clearModule(module.key);
    this.store.deleteModule(module.key);
    void this.router.navigateByUrl('/settings/modules');
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
