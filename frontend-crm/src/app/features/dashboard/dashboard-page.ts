import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../core/auth/session-context';
import { LanguageService } from '../../core/i18n/language.service';
import { MetricsService } from '../../core/reports/metrics.service';
import { InventoryStore } from '../../core/inventory/inventory.store';
import { OperationalStore } from '../operations/operational-store';
import { KpiCard } from '../../shared/kpi-card';
import { CustomerMapCard } from './customer-map-card/customer-map-card';

/** Colores categóricos validados (slots 1–3) y gris neutro para «Otros». */
const PLAN_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];
const OTHER_COLOR = '#a3a29c';

@Component({
  selector: 'app-dashboard-page',
  imports: [CurrencyPipe, DecimalPipe, RouterLink, KpiCard, CustomerMapCard],
  templateUrl: './dashboard-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  readonly i18n = inject(LanguageService);
  readonly metrics = inject(MetricsService);
  readonly inventory = inject(InventoryStore);
  private readonly ops = inject(OperationalStore);
  private readonly session = inject(SessionContext);

  /** Hasta que cargan los datos operativos, se muestran los esqueletos. */
  readonly loading = computed(() => !this.ops.dataReady());
  readonly skeletons = [1, 2, 3, 4];

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const first = (this.session.user()?.name ?? '').split(' ')[0];
    const salute = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    return first ? `${salute}, ${first}` : salute;
  });
  readonly today = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  readonly billing = computed(() => this.metrics.billing(12));
  readonly maxBilled = computed(() => Math.max(1, ...this.billing().map((point) => point.billed)));
  readonly thisMonth = computed(() => this.billing()[this.billing().length - 1]);
  readonly billedChange = computed(() => {
    const points = this.billing();
    return this.metrics.change(points[points.length - 1].billed, points[points.length - 2].billed);
  });
  readonly newContracts = computed(() => {
    const flow = this.metrics.contractFlow(1);
    return flow[0]?.started ?? 0;
  });
  readonly overdueCount = computed(() => this.metrics.unpaid().filter((item) => item.days > 0).length);

  /** Tres planes principales + «Otros», para no pasar de tres colores. */
  readonly plans = computed(() => {
    const all = this.metrics.planDistribution();
    const top = all.slice(0, 3).map((plan, index) => ({ ...plan, color: PLAN_COLORS[index] }));
    const rest = all.slice(3).reduce((sum, plan) => sum + plan.customers, 0);
    return rest ? [...top, { name: 'Otros', customers: rest, color: OTHER_COLOR }] : top;
  });
  readonly planTotal = computed(() => this.plans().reduce((sum, plan) => sum + plan.customers, 0));
  /** Dona con una separación fina entre segmentos. */
  readonly donut = computed(() => {
    const total = this.planTotal() || 1;
    let start = 0;
    const stops = this.plans().map((plan) => {
      const end = start + (plan.customers / total) * 100;
      const stop = `${plan.color} ${start}% ${Math.max(start, end - 0.6)}%, var(--color-surface) ${Math.max(start, end - 0.6)}% ${end}%`;
      start = end;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });
  readonly donutLabel = computed(() =>
    this.plans()
      .map((plan) => `${Math.round((plan.customers / (this.planTotal() || 1)) * 100)} por ciento ${plan.name}`)
      .join(', '),
  );

  readonly recent = computed(() =>
    this.ops
      .allActivity()
      .slice(0, 5)
      .map((event) => ({
        ...event,
        time: this.relative(event.createdAt),
        tone: event.channel === 'whatsapp' ? 'green' : event.tone === 'violet' ? 'blue' : event.tone,
      })),
  );

  barHeight(value: number): number {
    return Math.round((value / this.maxBilled()) * 100);
  }

  percent(value: number | null): string {
    return value === null ? '' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
  }

  /** Resumen del tablero en CSV, para compartirlo o archivarlo. */
  export(): void {
    const rows = [
      ['Indicador', 'Valor'],
      ['Clientes activos', this.metrics.activeCustomers()],
      ['Ingreso mensual recurrente', this.metrics.mrr().toFixed(2)],
      ['Ingreso promedio por contrato', this.metrics.arpu().toFixed(2)],
      ['Facturas con saldo', this.metrics.unpaid().length],
      ['Facturas vencidas', this.overdueCount()],
      ['Adeudo vencido', this.metrics.overdueTotal().toFixed(2)],
      ['Pagos de hoy', this.metrics.paymentsToday().amount.toFixed(2)],
      ['Tickets abiertos', this.metrics.openTickets()],
      ['Equipos disponibles', this.metrics.availableEquipment()],
      [],
      ['Mes', 'Facturado', 'Cobrado'],
      ...this.billing().map((point) => [point.key, point.billed.toFixed(2), point.collected.toFixed(2)]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private relative(date: string): string {
    const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.round(hours / 24);
    return days < 30 ? `Hace ${days} d` : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(date));
  }
}
