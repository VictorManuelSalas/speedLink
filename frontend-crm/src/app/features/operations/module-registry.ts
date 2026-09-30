import {
  CustomField,
  CustomModule,
  customModule,
  customModules,
  isCustomModuleKey,
  nativeCustomFields,
} from '../../core/modules/custom-modules.model';
import {
  ColumnType,
  ModuleField,
  NativeModuleKey,
  OPERATIONAL_MODULES,
  OperationalModuleDefinition,
  OperationalModuleKey,
} from './operational-modules.data';

/**
 * Definición vigente de un módulo: la nativa más sus campos personalizados, o
 * la de un módulo creado en Ajustes > Módulos. Todo lo genérico (lista,
 * formulario, ficha) lee de aquí, así un campo o módulo nuevo aparece sin
 * tocar esas pantallas.
 */
export function moduleDefinition(key: string): OperationalModuleDefinition | undefined {
  if (isCustomModuleKey(key)) {
    const module = customModule(key);
    return module ? buildCustomDefinition(module) : undefined;
  }
  const native = OPERATIONAL_MODULES[key as NativeModuleKey];
  if (!native) return undefined;
  const fields = nativeCustomFields(key);
  if (!fields.length) return native;
  return {
    ...native,
    fields: [...native.fields, ...fields.map(toModuleField)],
    columns: [...native.columns, ...fields.filter((f) => f.showInList).map(toColumn)],
  };
}

export function allModuleKeys(): ReadonlyArray<OperationalModuleKey> {
  return [
    ...(Object.keys(OPERATIONAL_MODULES) as NativeModuleKey[]),
    ...customModules().map((module) => module.key),
  ];
}

/** Ruta de la lista del módulo: `/leads` o `/m/cm_…` para los personalizados. */
export function moduleRoute(key: string): string {
  return isCustomModuleKey(key) ? `/m/${key}` : `/${key}`;
}

function buildCustomDefinition(module: CustomModule): OperationalModuleDefinition {
  return {
    key: module.key,
    eyebrow: 'PERSONALIZADO',
    title: module.plural,
    description: module.description || `Registros de ${module.plural.toLocaleLowerCase()}.`,
    singular: module.singular.toLocaleLowerCase(),
    gender: module.gender,
    idPrefix: module.idPrefix,
    accent: module.accent,
    metrics: [],
    columns: [
      { key: 'name', label: module.primaryLabel, type: 'identity' },
      ...module.fields.filter((field) => field.showInList).map(toColumn),
    ],
    fields: [
      { key: 'name', label: module.primaryLabel, type: 'text', required: true, minLength: 2, maxLength: 150 },
      ...module.fields.map(toModuleField),
    ],
    records: [],
  };
}

/** Traduce un campo personalizado a los tipos que ya entienden los formularios. */
export function toModuleField(field: CustomField): ModuleField {
  const base = {
    key: field.key,
    label: field.label,
    required: field.required,
    custom: true,
    helpText: field.helpText || undefined,
  };
  switch (field.type) {
    case 'textarea':
      return { ...base, type: 'text', multiline: true, maxLength: 5000 };
    case 'number':
      return { ...base, type: 'number', min: -999999999, max: 999999999 };
    case 'currency':
      return { ...base, type: 'number', min: 0, max: 999999999 };
    case 'date':
      return { ...base, type: 'date', validateAs: 'date' };
    case 'picklist':
      return { ...base, type: 'select', options: field.options };
    case 'checkbox':
      return {
        ...base,
        type: 'select',
        options: ['true', 'false'],
        optionLabels: { true: 'Sí', false: 'No' },
      };
    case 'email':
      return { ...base, type: 'text', validateAs: 'email', maxLength: 255 };
    case 'phone':
      return { ...base, type: 'text', validateAs: 'phone', maxLength: 30 };
    case 'url':
      return { ...base, type: 'text', validateAs: 'url', maxLength: 500 };
    case 'user':
      return { ...base, type: 'user' };
    case 'lookup':
      return {
        ...base,
        type: 'lookup',
        lookupModule: field.lookupModule,
        schemaKey: `${field.key}_id`,
      };
    default:
      return { ...base, type: 'text', maxLength: 255 };
  }
}

function toColumn(field: CustomField): { key: string; label: string; type: ColumnType } {
  const type: ColumnType =
    field.type === 'currency' ? 'money' : field.type === 'date' ? 'date' : 'text';
  return { key: field.key, label: field.label, type };
}
