import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../core/auth/session-context';
import { MetricsService } from '../../core/reports/metrics.service';
import { OperationalStore } from '../operations/operational-store';
import { BarChart, BarSeries } from '../../shared/charts/bar-chart';

type Section = 'billing' | 'aging' | 'customers' | 'network';

/** Rampa ordinal de un solo tono (azul 250→650): más oscuro = más antiguo. */
const AGING_RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];

@Component({
  selector: 'app-reports-page',
  imports: [CurrencyPipe, DecimalPipe, RouterLink, BarChart],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  readonly metrics = inject(MetricsService);
  private readonly ops = inject(OperationalStore);
  private readonly session = inject(SessionContext);

  readonly canExport = computed(() => this.session.hasPermission('reports.export'));
  readonly ready = computed(() => this.ops.dataReady());
  readonly section = signal<Section>('billing');
  readonly months = signal(6);

  // ─────────────────────────────────────────────────────────── Cobranza
  readonly billing = computed(() => this.metrics.billing(this.months()));
  readonly billingSeries = computed<ReadonlyArray<BarSeries>>(() => [
    { name: 'Facturado', slot: 1, values: this.billing().map((point) => point.billed) },
    { name: 'Cobrado', slot: 2, values: this.billing().map((point) => point.collected) },
  ]);
  readonly billingTotals = computed(() => {
    const billed = this.billing().reduce((sum, point) => sum + point.billed, 0);
    const collected = this.billing().reduce((sum, point) => sum + point.collected, 0);
    return { billed, collected, rate: billed ? (collected / billed) * 100 : 0 };
  });
  readonly current = computed(() => this.billing()[this.billing().length - 1]);

  // ─────────────────────────────────────────────── Antigüedad de saldos
  readonly aging = computed(() => {
    const buckets = this.metrics.aging();
    const max = Math.max(1, ...buckets.map((bucket) => bucket.amount));
    const total = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
    return buckets.map((bucket, index) => ({
      ...bucket,
      color: AGING_RAMP[index],
      width: (bucket.amount / max) * 100,
      share: total ? (bucket.amount / total) * 100 : 0,
    }));
  });
  readonly agingTotal = computed(() => this.metrics.aging().reduce((sum, bucket) => sum + bucket.amount, 0));
  readonly debtors = computed(() => this.metrics.debtors().slice(0, 10));

  // ──────────────────────────────────────────────────────────── Clientes
  readonly flow = computed(() => this.metrics.contractFlow(this.months()));
  readonly flowSeries = computed<ReadonlyArray<BarSeries>>(() => [
    { name: 'Contratos nuevos', slot: 1, values: this.flow().map((point) => point.started) },
    { name: 'Terminados', slot: 2, values: this.flow().map((point) => point.ended) },
  ]);
  readonly flowTotals = computed(() => ({
    started: this.flow().reduce((sum, point) => sum + point.started, 0),
    ended: this.flow().reduce((sum, point) => sum + point.ended, 0),
  }));
  readonly plans = computed(() => {
    const plans = this.metrics.planDistribution();
    const total = plans.reduce((sum, plan) => sum + plan.customers, 0) || 1;
    return plans.map((plan) => ({ ...plan, share: (plan.customers / total) * 100 }));
  });

  // ──────────────────────────────────────────────────────────────── Red
  readonly usage = computed(() => {
    const rows = this.metrics.usageByPlan();
    const max = Math.max(1, ...rows.map((row) => row.average));
    return rows.map((row) => ({ ...row, width: (row.average / max) * 100 }));
  });

  labels(points: ReadonlyArray<{ label: string }>): string[] {
    return points.map((point) => point.label);
  }

  /** CSV de la sección visible, con BOM para que Excel respete los acentos. */
  export(): void {
    const section = this.section();
    const rows: (string | number)[][] =
      section === 'billing'
        ? [['Mes', 'Facturado', 'Cobrado', '% cobrado'], ...this.billing().map((p) => [p.key, p.billed.toFixed(2), p.collected.toFixed(2), p.billed ? ((p.collected / p.billed) * 100).toFixed(1) : ''])]
        : section === 'aging'
          ? [
              ['Antigüedad', 'Facturas', 'Saldo'],
              ...this.aging().map((b) => [b.label, b.count, b.amount.toFixed(2)]),
              [],
              ['Cliente', 'Clave', 'Facturas vencidas', 'Adeudo', 'Días del más antiguo'],
              ...this.metrics.debtors().map((d) => [d.name, d.customerId, d.invoices, d.amount.toFixed(2), d.oldestDays]),
            ]
          : section === 'customers'
            ? [
                ['Mes', 'Contratos nuevos', 'Terminados'],
                ...this.flow().map((p) => [p.key, p.started, p.ended]),
                [],
                ['Plan', 'Clientes activos'],
                ...this.plans().map((p) => [p.name, p.customers]),
              ]
            : [['Velocidad', 'Clientes', 'Consumo del mes (GB)', 'Promedio por cliente (GB)'], ...this.usage().map((u) => [u.label, u.clients, u.gb.toFixed(1), u.average.toFixed(1)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `reporte-${section}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
