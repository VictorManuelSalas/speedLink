import { Injectable, computed, inject } from '@angular/core';
import { CUSTOMERS } from '../data-access/mock-crm-data';
import { TicketStore } from '../data-access/ticket-store';
import { MikrotikStore } from '../network/mikrotik.store';
import { monthUsage, speedLabel } from '../network/mikrotik.model';
import { OperationalStore } from '../../features/operations/operational-store';
import type { OperationalRecord } from '../../features/operations/operational-modules.data';
import { CalendarStore } from '../../features/calendar/calendar-store';

/*
 * Indicadores de negocio calculados con los registros del CRM (facturas,
 * pagos, contratos, clientes, tickets, red). Los usan el Dashboard y
 * Reportes: ninguna cifra es fija.
 */

export interface MonthPoint {
  readonly key: string;
  readonly label: string;
}
export interface AgingBucket {
  readonly key: 'current' | 'd30' | 'd60' | 'd90' | 'd90plus';
  readonly label: string;
  readonly count: number;
  readonly amount: number;
}
export interface Debtor {
  readonly customerId: string;
  readonly name: string;
  readonly amount: number;
  readonly invoices: number;
  readonly oldestDays: number;
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function monthKey(value: unknown): string {
  const raw = String(value ?? '');
  return /^\d{4}-\d{2}/.test(raw) ? raw.slice(0, 7) : '';
}

/** Los últimos `count` meses, terminando en el actual. */
export function lastMonths(count: number, now = new Date()): MonthPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTHS[date.getMonth()]}${date.getMonth() === 0 ? ` ${String(date.getFullYear()).slice(2)}` : ''}`,
    };
  });
}

function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysSince(value: unknown, now = Date.now()): number {
  const time = new Date(`${String(value ?? '').slice(0, 10)}T12:00:00`).getTime();
  return Number.isNaN(time) ? 0 : Math.floor((now - time) / 86400_000);
}

@Injectable({ providedIn: 'root' })
export class MetricsService {
  private readonly ops = inject(OperationalStore);
  private readonly tickets = inject(TicketStore);
  private readonly calendar = inject(CalendarStore);
  private readonly network = inject(MikrotikStore);

  readonly invoices = computed(() => this.ops.recordsFor('invoices'));
  readonly payments = computed(() => this.ops.recordsFor('payments'));

  /** Pagado por factura (id y folio), para saber cuánto falta de cada una. */
  private readonly paidByInvoice = computed(() => {
    const paid = new Map<string, number>();
    for (const payment of this.payments()) {
      const key = String(payment['invoiceId'] ?? payment['invoice'] ?? '');
      if (key) paid.set(key, (paid.get(key) ?? 0) + (Number(payment['amount']) || 0));
    }
    return paid;
  });

  balance(invoice: OperationalRecord): number {
    if (invoice['status'] === 'PAID') return 0;
    const paid = (this.paidByInvoice().get(invoice.id) ?? 0) + (invoice['folio'] ? (this.paidByInvoice().get(String(invoice['folio'])) ?? 0) : 0);
    return Math.max(0, (Number(invoice['total']) || 0) - paid);
  }

  /** Facturas con saldo: la base de la cobranza. */
  readonly unpaid = computed(() =>
    this.invoices()
      .map((invoice) => ({ invoice, balance: this.balance(invoice), days: daysSince(invoice['dueDate']) }))
      .filter((item) => item.balance > 0),
  );

  /** Antigüedad de saldos: cuánto se debe según los días desde el vencimiento. */
  readonly aging = computed<ReadonlyArray<AgingBucket>>(() => {
    const buckets: AgingBucket[] = [
      { key: 'current', label: 'Por vencer', count: 0, amount: 0 },
      { key: 'd30', label: '1–30 días', count: 0, amount: 0 },
      { key: 'd60', label: '31–60 días', count: 0, amount: 0 },
      { key: 'd90', label: '61–90 días', count: 0, amount: 0 },
      { key: 'd90plus', label: 'Más de 90 días', count: 0, amount: 0 },
    ];
    for (const item of this.unpaid()) {
      const index = item.days <= 0 ? 0 : item.days <= 30 ? 1 : item.days <= 60 ? 2 : item.days <= 90 ? 3 : 4;
      const bucket = buckets[index];
      buckets[index] = { ...bucket, count: bucket.count + 1, amount: bucket.amount + item.balance };
    }
    return buckets;
  });

  readonly overdueTotal = computed(() =>
    this.unpaid()
      .filter((item) => item.days > 0)
      .reduce((sum, item) => sum + item.balance, 0),
  );

  readonly debtors = computed<ReadonlyArray<Debtor>>(() => {
    const byCustomer = new Map<string, Debtor>();
    for (const item of this.unpaid().filter((entry) => entry.days > 0)) {
      const id = String(item.invoice['clientId'] ?? '');
      const current = byCustomer.get(id);
      byCustomer.set(id, {
        customerId: id,
        name: String(item.invoice['client'] ?? id),
        amount: (current?.amount ?? 0) + item.balance,
        invoices: (current?.invoices ?? 0) + 1,
        oldestDays: Math.max(current?.oldestDays ?? 0, item.days),
      });
    }
    return [...byCustomer.values()].sort((a, b) => b.amount - a.amount);
  });

  /** Facturado (por fecha de emisión) contra cobrado (por fecha de pago), por mes. */
  billing(months: number) {
    return lastMonths(months).map((month) => {
      const billed = this.invoices()
        .filter((invoice) => monthKey(invoice['issueDate'] ?? invoice['issuedAt']) === month.key)
        .reduce((sum, invoice) => sum + (Number(invoice['total']) || 0), 0);
      const collected = this.payments()
        .filter((payment) => monthKey(payment['paidAt']) === month.key)
        .reduce((sum, payment) => sum + (Number(payment['amount']) || 0), 0);
      return { ...month, billed, collected };
    });
  }

  /** Contratos que empiezan contra los que terminan (vencidos o cancelados), por mes. */
  contractFlow(months: number) {
    const contracts = this.ops.recordsFor('contracts');
    return lastMonths(months).map((month) => ({
      ...month,
      started: contracts.filter((contract) => monthKey(contract['startDate']) === month.key).length,
      ended: contracts.filter(
        (contract) =>
          ['CANCELLED', 'EXPIRED'].includes(String(contract['status'])) && monthKey(contract['endDate']) === month.key,
      ).length,
    }));
  }

  readonly activeCustomers = computed(
    () => this.ops.recordsFor('customers').filter((customer) => customer['status'] === 'ACTIVE').length,
  );

  /** Ingreso mensual recurrente: la mensualidad de los contratos activos. */
  readonly mrr = computed(() => {
    const active = this.ops.recordsFor('contracts').filter((contract) => contract['status'] === 'ACTIVE');
    return active.reduce((sum, contract) => sum + (Number(contract['totalMonthly']) || 0), 0);
  });
  readonly activeContracts = computed(
    () => this.ops.recordsFor('contracts').filter((contract) => contract['status'] === 'ACTIVE').length,
  );
  /** Ingreso promedio por contrato activo. */
  readonly arpu = computed(() => (this.activeContracts() ? this.mrr() / this.activeContracts() : 0));

  /** Clientes activos por plan de la ficha. */
  readonly planDistribution = computed(() => {
    const active = new Set(
      this.ops
        .recordsFor('customers')
        .filter((customer) => customer['status'] === 'ACTIVE')
        .map((customer) => customer.id),
    );
    const counts = new Map<string, number>();
    for (const customer of CUSTOMERS.filter((item) => active.has(item.id))) {
      const key = `${customer.plan} · ${customer.speed}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, customers]) => ({ name, customers })).sort((a, b) => b.customers - a.customers);
  });

  readonly paymentsToday = computed(() => {
    const today = localDay();
    const list = this.payments().filter((payment) => String(payment['paidAt'] ?? '').slice(0, 10) === today);
    return { amount: list.reduce((sum, payment) => sum + (Number(payment['amount']) || 0), 0), count: list.length };
  });

  readonly openTickets = computed(() => this.tickets.openCount());
  readonly availableEquipment = computed(
    () => this.ops.recordsFor('equipment').filter((equipment) => equipment['status'] === 'AVAILABLE').length,
  );
  /** Instalaciones agendadas de hoy en adelante (próximos 7 días). */
  readonly upcomingInstallations = computed(() => {
    const from = localDay();
    const to = localDay(new Date(Date.now() + 7 * 86400_000));
    return this.calendar
      .events()
      .filter(
        (event) =>
          event.type === 'INSTALLATION' &&
          event.status === 'SCHEDULED' &&
          event.startsAt.slice(0, 10) >= from &&
          event.startsAt.slice(0, 10) <= to,
      ).length;
  });

  /** Consumo del mes por velocidad (MikroTik); vacío si no hay routers. */
  readonly usageByPlan = computed(() => {
    if (!this.network.connected()) return [];
    const groups = new Map<string, { clients: number; gb: number; download: number }>();
    for (const sub of this.network.subscriberList()) {
      const speed = this.network.appliedSpeed(sub);
      if (!speed || sub.blocked) continue;
      const usage = monthUsage(sub.customerId, speed, { blockedAt: sub.blockedAt, since: sub.countersResetAt });
      const key = speedLabel(speed);
      const current = groups.get(key) ?? { clients: 0, gb: 0, download: speed.download };
      groups.set(key, { ...current, clients: current.clients + 1, gb: current.gb + usage.download + usage.upload });
    }
    return [...groups.entries()]
      .map(([label, value]) => ({ label, ...value, average: value.gb / value.clients }))
      .sort((a, b) => a.download - b.download);
  });

  /** Variación contra el mes anterior, en %; null si no hay base. */
  change(current: number, previous: number): number | null {
    return previous > 0 ? ((current - previous) / previous) * 100 : null;
  }
}
