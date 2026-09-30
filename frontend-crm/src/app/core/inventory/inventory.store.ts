import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuditLog } from '../audit/audit-log';
import { modelKeyOf, modelLabelOf } from '../equipment/device-access.model';
import { OperationalStore } from '../../features/operations/operational-store';

/*
 * Existencias de equipo por modelo, calculadas del módulo Equipamiento, con
 * un stock mínimo por modelo para saber cuándo reponer antes de quedarse sin
 * routers o antenas para instalar.
 */

export interface StockRow {
  readonly key: string;
  readonly label: string;
  readonly name: string;
  readonly total: number;
  readonly available: number;
  readonly assigned: number;
  readonly repair: number;
  readonly retired: number;
  /** Costo de lo disponible en bodega. */
  readonly stockValue: number;
  readonly averageCost: number;
  readonly minimum: number;
  readonly low: boolean;
}

const MIN_KEY = 'speedlink-inventory-minimums';
/** Sin mínimo configurado, avisa sólo cuando no queda ninguna unidad en bodega. */
export const DEFAULT_MINIMUM = 1;

@Injectable({ providedIn: 'root' })
export class InventoryStore {
  private readonly ops = inject(OperationalStore);
  private readonly audit = inject(AuditLog);

  readonly minimums = signal<Readonly<Record<string, number>>>(this.read());

  readonly rows = computed<ReadonlyArray<StockRow>>(() => {
    const groups = new Map<string, { label: string; name: string; items: Readonly<Record<string, unknown>>[] }>();
    for (const item of this.ops.recordsFor('equipment')) {
      const key = modelKeyOf(item);
      if (!key) continue;
      const group = groups.get(key) ?? { label: modelLabelOf(item), name: String(item['name'] ?? ''), items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return [...groups.entries()]
      .map(([key, group]) => {
        const count = (...statuses: string[]) => group.items.filter((item) => statuses.includes(String(item['status']))).length;
        const available = group.items.filter((item) => item['status'] === 'AVAILABLE');
        const minimum = this.minimums()[key] ?? DEFAULT_MINIMUM;
        const costs = group.items.map((item) => Number(item['purchaseCost']) || 0).filter((cost) => cost > 0);
        return {
          key,
          label: group.label,
          name: group.name,
          total: group.items.length,
          available: available.length,
          assigned: count('ASSIGNED'),
          repair: count('IN_REPAIR', 'DAMAGED'),
          retired: count('RETIRED', 'LOST'),
          stockValue: available.reduce((sum, item) => sum + (Number(item['purchaseCost']) || 0), 0),
          averageCost: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length : 0,
          minimum,
          low: available.length < minimum,
        };
      })
      .sort((a, b) => Number(b.low) - Number(a.low) || a.label.localeCompare(b.label));
  });

  readonly lowStock = computed(() => this.rows().filter((row) => row.low));
  readonly totals = computed(() => ({
    models: this.rows().length,
    available: this.rows().reduce((sum, row) => sum + row.available, 0),
    repair: this.rows().reduce((sum, row) => sum + row.repair, 0),
    value: this.rows().reduce((sum, row) => sum + row.stockValue, 0),
  }));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(MIN_KEY, JSON.stringify(this.minimums()));
      } catch {
        // Sin almacenamiento los mínimos duran sólo esta sesión.
      }
    });
  }

  setMinimum(key: string, value: number, label: string): void {
    const clean = Math.max(0, Math.min(999, Math.round(Number(value) || 0)));
    this.minimums.update((minimums) => ({ ...minimums, [key]: clean }));
    this.audit.record('Configuración', 'Stock mínimo', label, `${clean} unidad(es)`);
  }

  private read(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem(MIN_KEY) ?? '{}') ?? {};
    } catch {
      return {};
    }
  }
}
