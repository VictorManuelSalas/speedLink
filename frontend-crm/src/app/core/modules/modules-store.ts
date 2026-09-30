import { Injectable, computed, effect, signal } from '@angular/core';
import { OPERATIONAL_MODULES } from '../../features/operations/operational-modules.data';
import {
  CustomField,
  CustomFieldType,
  CustomModule,
  CustomModuleKey,
  ModulesState,
  NativeCustomization,
  setLiveModules,
  toApiName,
} from './custom-modules.model';

const STATE_KEY = 'speedlink-modules';
const VALUES_KEY = 'speedlink-custom-field-values';
const MAX_FIELDS = 50;
const MAX_MODULES = 20;

/**
 * Módulos nativos que admiten campos personalizados.
 * `record`: el valor se guarda en el propio registro (formularios genéricos).
 * `card`: la ficha es propia (clientes, tickets) y los valores se guardan
 * aparte y se editan en una tarjeta de "Campos personalizados".
 */
export const NATIVE_MODULES: ReadonlyArray<{
  key: string;
  label: string;
  route: string;
  icon: string;
  storage: 'record' | 'card';
  /** Campos propios del módulo cuando no es un módulo genérico (tickets). */
  builtIn?: ReadonlyArray<string>;
}> = [
  { key: 'customers', label: 'Clientes', route: '/customers', icon: '/icons/menu/fi-rr-portrait.svg', storage: 'card' },
  { key: 'leads', label: 'Leads', route: '/leads', icon: '/icons/menu/fi-rr-interactive.svg', storage: 'record' },
  { key: 'contracts', label: 'Contratos', route: '/contracts', icon: '/icons/menu/fi-rr-document.svg', storage: 'record' },
  { key: 'services', label: 'Servicios', route: '/services', icon: '/icons/menu/fi-rr-database.svg', storage: 'record' },
  { key: 'equipment', label: 'Equipamiento', route: '/equipment', icon: '/icons/menu/fi-rr-subtitles.svg', storage: 'record' },
  { key: 'assignments', label: 'Asignaciones', route: '/assignments', icon: '/icons/menu/fi-rr-reflect.svg', storage: 'record' },
  { key: 'invoices', label: 'Facturas', route: '/invoices', icon: '/icons/menu/fi-rr-document.svg', storage: 'record' },
  { key: 'payments', label: 'Pagos', route: '/payments', icon: '/icons/menu/fi-rr-subtitles.svg', storage: 'record' },
  { key: 'expenses', label: 'Gastos', route: '/expenses', icon: '/icons/menu/fi-rr-diploma.svg', storage: 'record' },
  {
    key: 'tickets',
    label: 'Tickets',
    route: '/tickets',
    icon: '/icons/settings/fi-rr-comments.svg',
    storage: 'card',
    builtIn: ['Asunto', 'Descripción', 'Cliente', 'Categoría', 'Estado', 'Prioridad', 'Responsable', 'Canal'],
  },
];

/** Módulos a los que puede apuntar un campo de búsqueda. */
export const LOOKUP_TARGETS = ['customers', 'leads', 'services', 'equipment', 'contracts', 'invoices'];

/** Rutas del CRM que un módulo personalizado no puede tomar. */
const RESERVED = new Set(['settings', 'login', 'dashboard', 'calendar', 'tickets', 'forbidden', 'portal']);

export type ModuleResult<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): ModuleResult<T> => ({ ok: true, value });
const fail = <T = never>(error: string): ModuleResult<T> => ({ ok: false, error });

export interface FieldInput {
  readonly label: string;
  readonly type: CustomFieldType;
  readonly required: boolean;
  readonly helpText: string;
  readonly options: ReadonlyArray<string>;
  readonly lookupModule?: string;
  readonly showInList: boolean;
}

export interface ModuleInput {
  readonly singular: string;
  readonly plural: string;
  readonly gender: 'm' | 'f';
  readonly description: string;
  readonly icon: string;
  readonly accent: string;
  readonly primaryLabel: string;
  readonly idPrefix: string;
}

@Injectable({ providedIn: 'root' })
export class ModulesStore {
  readonly state = signal<ModulesState>(this.read(STATE_KEY, { custom: [], native: {} }));
  /** Valores de campos personalizados de clientes y tickets: `módulo:id` → campo → valor. */
  readonly values = signal<Readonly<Record<string, Readonly<Record<string, string>>>>>(
    this.read(VALUES_KEY, {}),
  );

  readonly custom = computed(() => this.state().custom);

  constructor() {
    effect(() => {
      const state = this.state();
      setLiveModules(state);
      this.persist(STATE_KEY, state);
    });
    effect(() => this.persist(VALUES_KEY, this.values()));
  }

  // ---------------------------------------------------------------- Lectura

  /** Campos personalizados de un módulo, nativo o personalizado. */
  fieldsOf(moduleKey: string): ReadonlyArray<CustomField> {
    const custom = this.state().custom.find((module) => module.key === moduleKey);
    return custom ? custom.fields : (this.state().native[moduleKey]?.fields ?? []);
  }

  nativeCustomization(key: string): NativeCustomization {
    return this.state().native[key] ?? { fields: [], hiddenInMenu: false };
  }

  customModule(key: string): CustomModule | undefined {
    return this.state().custom.find((module) => module.key === key);
  }

  valuesFor(moduleKey: string, recordId: string): Readonly<Record<string, string>> {
    return this.values()[`${moduleKey}:${recordId}`] ?? {};
  }

  setValue(moduleKey: string, recordId: string, fieldKey: string, value: string): void {
    const id = `${moduleKey}:${recordId}`;
    this.values.update((values) => ({ ...values, [id]: { ...values[id], [fieldKey]: value } }));
  }

  // ----------------------------------------------------------------- Campos

  addField(moduleKey: string, input: FieldInput): ModuleResult<CustomField> {
    const fields = this.fieldsOf(moduleKey);
    if (fields.length >= MAX_FIELDS) return fail(`Un módulo admite hasta ${MAX_FIELDS} campos personalizados.`);
    const invalid = this.validateField(moduleKey, input);
    if (invalid) return fail(invalid);
    const field: CustomField = {
      ...this.cleanField(input),
      key: this.uniqueFieldKey(moduleKey, input.label),
      createdAt: new Date().toISOString(),
    };
    this.writeFields(moduleKey, [...fields, field]);
    return ok(field);
  }

  /** El tipo y el nombre de API no cambian: los registros ya guardan datos con ese formato. */
  updateField(moduleKey: string, key: string, input: FieldInput): ModuleResult<CustomField> {
    const fields = this.fieldsOf(moduleKey);
    const current = fields.find((field) => field.key === key);
    if (!current) return fail('El campo ya no existe.');
    if (input.type !== current.type) return fail('El tipo de un campo no se puede cambiar.');
    const invalid = this.validateField(moduleKey, input, key);
    if (invalid) return fail(invalid);
    const updated: CustomField = { ...current, ...this.cleanField(input) };
    this.writeFields(moduleKey, fields.map((field) => (field.key === key ? updated : field)));
    return ok(updated);
  }

  moveField(moduleKey: string, key: string, direction: -1 | 1): void {
    const fields = [...this.fieldsOf(moduleKey)];
    const index = fields.findIndex((field) => field.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    this.writeFields(moduleKey, fields);
  }

  /** Quita el campo del módulo; los valores guardados dejan de mostrarse. */
  deleteField(moduleKey: string, key: string): void {
    this.writeFields(
      moduleKey,
      this.fieldsOf(moduleKey).filter((field) => field.key !== key),
    );
  }

  // ------------------------------------------------------------- Módulos

  createModule(input: ModuleInput, actor: string): ModuleResult<CustomModule> {
    if (this.state().custom.length >= MAX_MODULES)
      return fail(`Se permiten hasta ${MAX_MODULES} módulos personalizados.`);
    const invalid = this.validateModule(input);
    if (invalid) return fail(invalid);
    const now = new Date().toISOString();
    const module: CustomModule = {
      ...this.cleanModule(input),
      key: `cm_${toApiName(input.plural)}` as CustomModuleKey,
      showInMenu: true,
      fields: [],
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
    };
    this.state.update((state) => ({ ...state, custom: [...state.custom, module] }));
    return ok(module);
  }

  updateModule(key: string, input: ModuleInput): ModuleResult<CustomModule> {
    const current = this.customModule(key);
    if (!current) return fail('El módulo ya no existe.');
    const invalid = this.validateModule(input, key);
    if (invalid) return fail(invalid);
    // La clave y el prefijo se conservan: ya están en rutas e ids de registros.
    const updated: CustomModule = {
      ...current,
      ...this.cleanModule(input),
      idPrefix: current.idPrefix,
      updatedAt: new Date().toISOString(),
    };
    this.replaceModule(updated);
    return ok(updated);
  }

  setMenuVisibility(key: string, visible: boolean): void {
    const custom = this.customModule(key);
    if (custom) {
      this.replaceModule({ ...custom, showInMenu: visible, updatedAt: new Date().toISOString() });
      return;
    }
    const native = this.nativeCustomization(key);
    this.state.update((state) => ({
      ...state,
      native: { ...state.native, [key]: { ...native, hiddenInMenu: !visible } },
    }));
  }

  deleteModule(key: string): void {
    this.state.update((state) => ({
      ...state,
      custom: state.custom.filter((module) => module.key !== key),
    }));
  }

  // ------------------------------------------------------------ Internos

  private validateField(moduleKey: string, input: FieldInput, key?: string): string | null {
    const label = input.label.trim();
    if (label.length < 2 || label.length > 60) return 'La etiqueta debe tener entre 2 y 60 caracteres.';
    const lower = label.toLocaleLowerCase();
    const builtIn = this.builtInLabels(moduleKey);
    if (builtIn.has(lower)) return 'El módulo ya tiene un campo con esa etiqueta.';
    if (
      this.fieldsOf(moduleKey).some(
        (field) => field.key !== key && field.label.toLocaleLowerCase() === lower,
      )
    )
      return 'Ya existe un campo personalizado con esa etiqueta.';
    if (input.type === 'picklist') {
      const options = input.options.map((option) => option.trim()).filter(Boolean);
      if (!options.length) return 'Agrega al menos una opción.';
      if (new Set(options.map((o) => o.toLocaleLowerCase())).size !== options.length)
        return 'Hay opciones repetidas.';
      if (options.length > 100) return 'Una lista admite hasta 100 opciones.';
    }
    if (input.type === 'lookup') {
      const targets = [...LOOKUP_TARGETS, ...this.state().custom.map((module) => module.key)];
      if (!input.lookupModule || !targets.includes(input.lookupModule))
        return 'Elige el módulo al que apunta la búsqueda.';
      if (input.lookupModule === moduleKey) return 'Un módulo no puede buscarse a sí mismo.';
    }
    if (input.helpText.length > 200) return 'El texto de ayuda admite hasta 200 caracteres.';
    return null;
  }

  private validateModule(input: ModuleInput, key?: string): string | null {
    const singular = input.singular.trim();
    const plural = input.plural.trim();
    if (singular.length < 2 || singular.length > 40) return 'El nombre en singular debe tener entre 2 y 40 caracteres.';
    if (plural.length < 2 || plural.length > 40) return 'El nombre en plural debe tener entre 2 y 40 caracteres.';
    if (!toApiName(plural)) return 'El nombre en plural debe incluir letras o números.';
    const lower = plural.toLocaleLowerCase();
    const nativeNames = NATIVE_MODULES.map((module) => module.label.toLocaleLowerCase());
    if (nativeNames.includes(lower) || RESERVED.has(toApiName(plural)))
      return 'Ese nombre ya lo usa un módulo del sistema.';
    if (
      this.state().custom.some(
        (module) =>
          module.key !== key &&
          (module.plural.toLocaleLowerCase() === lower || module.key === `cm_${toApiName(plural)}`),
      )
    )
      return 'Ya existe un módulo con ese nombre.';
    if (input.primaryLabel.trim().length < 2) return 'Escribe la etiqueta del campo principal.';
    if (!/^#[0-9a-f]{6}$/i.test(input.accent)) return 'Color en formato #RRGGBB.';
    if (!key) {
      const prefix = input.idPrefix.trim().toUpperCase();
      if (!/^[A-Z]{2,5}$/.test(prefix)) return 'El prefijo de ids es de 2 a 5 letras.';
      const taken = [
        ...Object.values(OPERATIONAL_MODULES).map((module) => module.idPrefix),
        ...this.state().custom.map((module) => module.idPrefix),
        'TK',
      ];
      if (taken.includes(prefix)) return `El prefijo ${prefix} ya lo usa otro módulo.`;
    }
    return null;
  }

  private builtInLabels(moduleKey: string): Set<string> {
    const native = OPERATIONAL_MODULES[moduleKey as keyof typeof OPERATIONAL_MODULES];
    const custom = this.customModule(moduleKey);
    const catalog = NATIVE_MODULES.find((module) => module.key === moduleKey)?.builtIn;
    const labels = catalog
      ? catalog
      : native
      ? native.fields.map((field) => field.label)
      : custom
        ? [custom.primaryLabel]
        : [];
    return new Set(labels.map((label) => label.toLocaleLowerCase()));
  }

  private uniqueFieldKey(moduleKey: string, label: string): string {
    const base = `cf_${toApiName(label) || 'campo'}`;
    const taken = new Set(this.fieldsOf(moduleKey).map((field) => field.key));
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    return key;
  }

  private cleanField(input: FieldInput): Omit<CustomField, 'key' | 'createdAt'> {
    return {
      label: input.label.trim(),
      type: input.type,
      required: input.required,
      helpText: input.helpText.trim(),
      options:
        input.type === 'picklist' ? input.options.map((option) => option.trim()).filter(Boolean) : [],
      lookupModule: input.type === 'lookup' ? input.lookupModule : undefined,
      showInList: input.showInList,
    };
  }

  private cleanModule(input: ModuleInput): Omit<CustomModule, 'key' | 'showInMenu' | 'fields' | 'createdAt' | 'updatedAt' | 'createdBy'> {
    return {
      singular: input.singular.trim(),
      plural: input.plural.trim(),
      gender: input.gender === 'f' ? 'f' : 'm',
      description: input.description.trim(),
      icon: input.icon,
      accent: input.accent,
      primaryLabel: input.primaryLabel.trim(),
      idPrefix: input.idPrefix.trim().toUpperCase(),
    };
  }

  private writeFields(moduleKey: string, fields: ReadonlyArray<CustomField>): void {
    const custom = this.customModule(moduleKey);
    if (custom) {
      this.replaceModule({ ...custom, fields, updatedAt: new Date().toISOString() });
      return;
    }
    const native = this.nativeCustomization(moduleKey);
    this.state.update((state) => ({
      ...state,
      native: { ...state.native, [moduleKey]: { ...native, fields } },
    }));
  }

  private replaceModule(updated: CustomModule): void {
    this.state.update((state) => ({
      ...state,
      custom: state.custom.map((module) => (module.key === updated.key ? updated : module)),
    }));
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
      return stored ?? fallback;
    } catch {
      return fallback;
    }
  }

  private persist(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Sin almacenamiento los cambios duran sólo esta sesión.
    }
  }
}
