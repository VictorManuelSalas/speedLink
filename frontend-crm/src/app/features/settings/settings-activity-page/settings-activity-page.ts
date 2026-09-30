import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuditLog, AuditSeverity } from '../../../core/audit/audit-log';
import { OperationalStore } from '../../operations/operational-store';

type Mode = 'activity' | 'audit';

interface Row {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly category: string;
  readonly action: string;
  readonly target: string;
  readonly detail: string;
  readonly severity: AuditSeverity;
  readonly route: ReadonlyArray<string> | null;
  readonly message?: string;
}

/** Ruta del registro según el prefijo de su id (SL-…, INV-…, TK-…). */
const PREFIX_ROUTE: ReadonlyArray<[RegExp, string]> = [
  [/^SL-/, '/customers'],
  [/^(INV|FAC)-/, '/invoices'],
  [/^(PAY|PAG)-/, '/payments'],
  [/^CTR-/, '/contracts'],
  [/^ASG-/, '/assignments'],
  [/^EQ-/, '/equipment'],
  [/^TK-/, '/tickets'],
  [/^LD-/, '/leads'],
  [/^SRV-/, '/services'],
];

function routeFor(id: string): ReadonlyArray<string> | null {
  const match = PREFIX_ROUTE.find(([pattern]) => pattern.test(id));
  return match ? [match[1], id] : null;
}

function localDay(value: string | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Ajustes › Registro de actividad (todo lo que pasa en el CRM) y Auditoría
 * (lo sensible: accesos, usuarios, roles, configuración, red, eliminaciones).
 */
@Component({
  selector: 'app-settings-activity-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './settings-activity-page.html',
  styleUrls: ['../settings-pages.scss', './settings-activity-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsActivityPage {
  private readonly ops = inject(OperationalStore);
  private readonly audit = inject(AuditLog);
  readonly mode = toSignal(inject(ActivatedRoute).data.pipe(map((data) => (data['section'] as Mode) ?? 'activity')), {
    initialValue: 'activity' as Mode,
  });

  readonly query = signal('');
  readonly actor = signal('');
  readonly category = signal('');
  readonly severity = signal<'' | AuditSeverity>('');
  readonly from = signal('');
  readonly to = signal('');
  readonly limit = signal(100);

  private readonly auditRows = computed<ReadonlyArray<Row>>(() =>
    this.audit.entries().map((entry) => ({ ...entry, route: routeFor(entry.detail) ?? routeFor(entry.target) })),
  );

  readonly rows = computed<ReadonlyArray<Row>>(() => {
    if (this.mode() === 'audit') return this.auditRows();
    const records = this.ops.allActivity().map(
      (event): Row => ({
        id: `${event.recordId}:${event.id}`,
        at: event.createdAt,
        actor: event.actor,
        category: event.module,
        action: event.title,
        target: event.recordId,
        detail: event.detail,
        severity: event.actionType === 'DELETE' ? 'warning' : 'info',
        route: routeFor(event.recordId),
        message: event.message,
      }),
    );
    return [...records, ...this.auditRows()].sort((a, b) => b.at.localeCompare(a.at));
  });

  readonly actors = computed(() => [...new Set(this.rows().map((row) => row.actor))].sort());
  readonly categories = computed(() => [...new Set(this.rows().map((row) => row.category))].sort());

  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('es');
    return this.rows().filter((row) => {
      const day = localDay(row.at);
      return (
        (!this.actor() || row.actor === this.actor()) &&
        (!this.category() || row.category === this.category()) &&
        (!this.severity() || row.severity === this.severity()) &&
        (!this.from() || day >= this.from()) &&
        (!this.to() || day <= this.to()) &&
        (!query || `${row.action} ${row.target} ${row.detail} ${row.actor}`.toLocaleLowerCase('es').includes(query))
      );
    });
  });
  readonly visible = computed(() => this.filtered().slice(0, this.limit()));

  readonly kpis = computed(() => {
    const today = localDay(new Date());
    const week = Date.now() - 7 * 86400_000;
    const month = Date.now() - 30 * 86400_000;
    const rows = this.rows();
    return {
      today: rows.filter((row) => localDay(row.at) === today).length,
      users: new Set(rows.filter((row) => new Date(row.at).getTime() >= month).map((row) => row.actor)).size,
      alerts: rows.filter((row) => row.severity !== 'info' && new Date(row.at).getTime() >= week).length,
      failed: this.audit.entries().filter((entry) => entry.action === 'Intento de inicio fallido' && new Date(entry.at).getTime() >= week).length,
    };
  });

  severityLabel(severity: AuditSeverity): string {
    return severity === 'critical' ? 'Crítico' : severity === 'warning' ? 'Atención' : 'Info';
  }

  clear(): void {
    this.query.set('');
    this.actor.set('');
    this.category.set('');
    this.severity.set('');
    this.from.set('');
    this.to.set('');
  }

  /** CSV de lo filtrado (todo, no sólo lo visible). */
  export(): void {
    const rows = [
      ['Fecha', 'Usuario', 'Categoría', 'Acción', 'Registro', 'Detalle', 'Nivel'],
      ...this.filtered().map((row) => [row.at, row.actor, row.category, row.action, row.target, row.detail, this.severityLabel(row.severity)]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `${this.mode() === 'audit' ? 'auditoria' : 'actividad'}-${localDay(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
