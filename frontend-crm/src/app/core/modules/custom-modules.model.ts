import { signal } from '@angular/core';

/*
 * Personalización de módulos, al estilo de Zoho CRM:
 *  - Módulos nativos: se les agregan campos personalizados y se puede ocultar
 *    su entrada del menú.
 *  - Módulos personalizados: se crean desde cero con sus propios campos y
 *    aparecen en el menú del CRM.
 *
 * Este archivo no importa nada del resto de la app a propósito: lo leen tanto
 * el modelo de permisos como las definiciones de módulos, y así no se forman
 * dependencias circulares.
 */

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'picklist'
  | 'checkbox'
  | 'email'
  | 'phone'
  | 'url'
  | 'user'
  | 'lookup';

export interface CustomField {
  /** Nombre de API: `cf_…`, único en el módulo e inmutable una vez creado. */
  readonly key: string;
  readonly label: string;
  readonly type: CustomFieldType;
  readonly required: boolean;
  readonly helpText: string;
  /** Opciones de una lista de selección. */
  readonly options: ReadonlyArray<string>;
  /** Módulo al que apunta un campo de búsqueda (lookup). */
  readonly lookupModule?: string;
  /** Se muestra como columna en la lista del módulo. */
  readonly showInList: boolean;
  readonly createdAt: string;
}

export type CustomModuleKey = `cm_${string}`;

export interface CustomModule {
  readonly key: CustomModuleKey;
  readonly singular: string;
  readonly plural: string;
  /** Género gramatical: "Nuevo cliente" / "Nueva orden". */
  readonly gender: 'm' | 'f';
  readonly description: string;
  readonly icon: string;
  readonly accent: string;
  /** Etiqueta del campo principal (el "nombre" de cada registro). */
  readonly primaryLabel: string;
  readonly idPrefix: string;
  readonly showInMenu: boolean;
  readonly fields: ReadonlyArray<CustomField>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
}

export interface NativeCustomization {
  readonly fields: ReadonlyArray<CustomField>;
  readonly hiddenInMenu: boolean;
}

export interface ModulesState {
  readonly custom: ReadonlyArray<CustomModule>;
  readonly native: Readonly<Record<string, NativeCustomization>>;
}

export const FIELD_TYPES: ReadonlyArray<{ value: CustomFieldType; label: string; hint: string }> = [
  { value: 'text', label: 'Texto', hint: 'Una línea, hasta 255 caracteres.' },
  { value: 'textarea', label: 'Texto largo', hint: 'Varias líneas, para notas o descripciones.' },
  { value: 'number', label: 'Número', hint: 'Entero o decimal.' },
  { value: 'currency', label: 'Moneda', hint: 'Importe en pesos.' },
  { value: 'date', label: 'Fecha', hint: 'Día, mes y año.' },
  { value: 'picklist', label: 'Lista de selección', hint: 'Una opción de una lista que defines.' },
  { value: 'checkbox', label: 'Casilla (Sí/No)', hint: 'Verdadero o falso.' },
  { value: 'email', label: 'Correo', hint: 'Valida el formato de correo.' },
  { value: 'phone', label: 'Teléfono', hint: 'Valida el formato de teléfono.' },
  { value: 'url', label: 'URL', hint: 'Dirección web.' },
  { value: 'user', label: 'Usuario', hint: 'Una persona del equipo.' },
  { value: 'lookup', label: 'Búsqueda (lookup)', hint: 'Relaciona con un registro de otro módulo.' },
];

/** Íconos disponibles para módulos personalizados (los mismos del menú). */
export const MODULE_ICONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '/icons/menu/fi-sr-apps.svg', label: 'Aplicaciones' },
  { value: '/icons/menu/fi-rr-document.svg', label: 'Documento' },
  { value: '/icons/menu/fi-rr-diploma.svg', label: 'Certificado' },
  { value: '/icons/menu/fi-rr-database.svg', label: 'Base de datos' },
  { value: '/icons/menu/fi-rr-portrait.svg', label: 'Persona' },
  { value: '/icons/menu/fi-rr-calendar.svg', label: 'Calendario' },
  { value: '/icons/menu/fi-rr-subtitles.svg', label: 'Tarjeta' },
  { value: '/icons/menu/fi-rr-reflect.svg', label: 'Relación' },
  { value: '/icons/menu/fi-rr-interactive.svg', label: 'Interactivo' },
  { value: '/icons/settings/fi-rr-building.svg', label: 'Edificio' },
  { value: '/icons/settings/fi-rr-layers.svg', label: 'Capas' },
  { value: '/icons/settings/fi-rr-comments.svg', label: 'Conversación' },
];

// -------------------------------------------------------------- Vista viva

const liveState = signal<ModulesState>({ custom: [], native: {} });

export function setLiveModules(state: ModulesState): void {
  liveState.set(state);
}

export function customModules(): ReadonlyArray<CustomModule> {
  return liveState().custom;
}

export function customModule(key: string): CustomModule | undefined {
  return liveState().custom.find((module) => module.key === key);
}

export function nativeCustomFields(key: string): ReadonlyArray<CustomField> {
  return liveState().native[key]?.fields ?? [];
}

export function isHiddenInMenu(key: string): boolean {
  return !!liveState().native[key]?.hiddenInMenu;
}

export function isCustomModuleKey(key: string): key is CustomModuleKey {
  return key.startsWith('cm_');
}

/** "Órdenes de trabajo" → "ordenes_de_trabajo" (para nombres de API). */
export function toApiName(label: string): string {
  return label
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}
