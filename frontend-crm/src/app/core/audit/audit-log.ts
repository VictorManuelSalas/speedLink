import { Injectable, effect, signal } from '@angular/core';

/*
 * Bitácora de auditoría: quién hizo qué en lo sensible (accesos, usuarios,
 * roles, configuración, red, eliminaciones). No depende de ningún servicio
 * para poder usarse desde cualquiera sin ciclos: el usuario actual lo fija
 * la sesión con `setAuditActor`.
 */

export type AuditCategory = 'Acceso' | 'Usuarios' | 'Roles' | 'Configuración' | 'Red' | 'Datos';
export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEntry {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly category: AuditCategory;
  readonly action: string;
  readonly target: string;
  readonly detail: string;
  readonly severity: AuditSeverity;
}

const KEY = 'speedlink-audit-log';
const MAX = 2000;

let actor = 'Sistema';
/** Lo llama la sesión cada vez que cambia el usuario. */
export function setAuditActor(name: string | null | undefined): void {
  actor = name || 'Sistema';
}

@Injectable({ providedIn: 'root' })
export class AuditLog {
  readonly entries = signal<ReadonlyArray<AuditEntry>>(read());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.entries()));
      } catch {
        // Sin almacenamiento la bitácora dura sólo esta sesión.
      }
    });
  }

  record(
    category: AuditCategory,
    action: string,
    target: string,
    detail = '',
    severity: AuditSeverity = 'info',
    by?: string,
  ): void {
    const entry: AuditEntry = {
      id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      actor: by ?? actor,
      category,
      action,
      target,
      detail,
      severity,
    };
    this.entries.update((entries) => [entry, ...entries].slice(0, MAX));
  }
}

function read(): ReadonlyArray<AuditEntry> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}
