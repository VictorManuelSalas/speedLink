/**
 * Opciones de los campos lookup.
 *
 * Se leen en vivo del módulo relacionado (`lookupModule`) en vez de las listas
 * estáticas de `operational-modules.data.ts`, para que el picklist siempre
 * refleje el catálogo real del CRM. Las listas estáticas quedan como respaldo
 * para los campos que todavía no apuntan a un módulo.
 */

import { PicklistOption } from '../../shared/styled-picklist';
import { systemUserOptions } from '../../core/data-access/system-users';
import { ModuleField, OperationalModuleKey, OperationalRecord } from './operational-modules.data';
import { moduleDefinition } from './module-registry';
import { OperationalStore } from './operational-store';

interface LookupContext {
  /** Valor ya guardado en el registro, para no perderlo al editar. */
  readonly currentValue?: string;
}

function detailOf(parts: ReadonlyArray<unknown>): string {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' · ');
}

function toOption(record: OperationalRecord, module: OperationalModuleKey): PicklistOption {
  const labelKey = moduleDefinition(module)?.columns[0]?.key ?? 'name';
  const label = String(record[labelKey] ?? record.id);
  switch (module) {
    case 'customers':
      return { value: record.id, label, detail: detailOf([record.id, record['email']]) };
    case 'equipment':
      return {
        value: record.id,
        label,
        detail: detailOf([record['brand'], record['serialNumber'] ?? record.id]),
      };
    case 'invoices':
      return {
        value: record.id,
        label: String(record['folio'] ?? label),
        detail: detailOf([record.id, record['status']]),
      };
    default:
      return { value: record.id, label, detail: record.id };
  }
}

export function lookupPicklistOptions(
  store: OperationalStore,
  field: ModuleField,
  context: LookupContext = {},
): ReadonlyArray<PicklistOption> {
  if (field.type === 'user') return systemUserOptions();

  const module = field.lookupModule as OperationalModuleKey | undefined;
  if (module && moduleDefinition(module)) {
    const options = store
      .recordsFor(module)
      // Un equipo ya instalado no puede reasignarse, salvo que sea el del registro actual.
      .filter(
        (record) =>
          module !== 'equipment' ||
          record['status'] === 'AVAILABLE' ||
          record.id === context.currentValue,
      )
      .map((record) => toOption(record, module));

    // Registros antiguos guardan la etiqueta en vez del id: se conserva como
    // opción para que el picklist no aparezca vacío al editarlos.
    const current = context.currentValue;
    if (current && !options.some((option) => option.value === current)) {
      return [{ value: current, label: current, detail: 'Valor actual' }, ...options];
    }
    return options;
  }

  return (field.options ?? []).map((option) => ({
    value: option,
    label: field.optionLabels?.[option] || option,
  }));
}

/** Etiqueta visible de un valor de lookup, resuelta contra las opciones en vivo. */
export function lookupDisplayLabel(
  store: OperationalStore,
  field: ModuleField,
  value: string,
): string {
  if (!value) return '';
  const match = lookupPicklistOptions(store, field, { currentValue: value }).find(
    (option) => option.value === value,
  );
  return match?.label ?? field.optionLabels?.[value] ?? value;
}
