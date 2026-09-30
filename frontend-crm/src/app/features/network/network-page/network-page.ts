import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { CUSTOMERS } from '../../../core/data-access/mock-crm-data';
import { MikrotikStore } from '../../../core/network/mikrotik.store';
import {
  BLOCK_REASONS,
  BlockReason,
  LinkStatus,
  Speed,
  Subscriber,
  formatGb,
  formatMbps,
  monthUsage,
  speedLabel,
  trafficNow,
} from '../../../core/network/mikrotik.model';
import { NetworkLog } from '../network-log';
import { CustomerMessages } from '../../../core/whatsapp/customer-messages';

type Filter = 'all' | 'online' | 'blocked' | 'offline' | 'sync' | 'none';

interface Row {
  readonly sub: Subscriber;
  readonly speed: Speed | null;
  readonly status: LinkStatus;
  readonly rx: number;
  readonly monthGb: number;
  readonly outOfSync: boolean;
}

@Component({
  selector: 'app-network-page',
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, NetworkLog],
  templateUrl: './network-page.html',
  styleUrls: ['../network.scss', './network-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkPage {
  readonly store = inject(MikrotikStore);
  private readonly session = inject(SessionContext);
  readonly messages = inject(CustomerMessages);
  readonly mbps = formatMbps;
  readonly gb = formatGb;
  readonly speedText = speedLabel;
  readonly reasons = BLOCK_REASONS;

  readonly now = signal(new Date());
  readonly canUpdate = computed(() => this.session.hasPermission('network.update'));
  readonly canBlock = computed(() => this.session.hasPermission('network.block'));
  readonly canConfigure = computed(() => this.session.hasPermission('settings.read'));

  readonly routerFilter = signal('all');
  readonly filter = signal<Filter>('all');
  readonly query = signal('');
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly emptySet: ReadonlySet<string> = new Set();
  readonly cutoffSelected = signal<ReadonlySet<string>>(new Set());
  readonly bulkDialog = signal<'block' | 'cutoff' | null>(null);
  readonly bulkReason = signal<BlockReason>('Falta de pago');
  readonly toast = signal('');

  /** Estado y tráfico de cada cola (la tasa se recalcula con el reloj de 5 s). */
  readonly rows = computed<ReadonlyArray<Row>>(() => {
    const now = this.now();
    const router = this.routerFilter();
    return this.store
      .subscriberList()
      .filter((sub) => this.store.router(sub.routerId)?.enabled && (router === 'all' || sub.routerId === router))
      .map((sub) => {
        const speed = this.store.appliedSpeed(sub);
        const traffic = trafficNow(sub.customerId, speed, sub.blocked, now);
        const usage = monthUsage(sub.customerId, speed, { blockedAt: sub.blockedAt, since: sub.countersResetAt }, now);
        return {
          sub,
          speed,
          status: traffic.status,
          rx: traffic.rx,
          monthGb: usage.download + usage.upload,
          outOfSync: this.store.outOfSync(sub),
        };
      });
  });

  readonly kpis = computed(() => {
    const rows = this.rows();
    return {
      total: rows.length,
      online: rows.filter((row) => row.status === 'online').length,
      blocked: rows.filter((row) => row.status === 'blocked').length,
      offline: rows.filter((row) => row.status === 'offline').length,
      sync: rows.filter((row) => row.outOfSync).length,
      rx: rows.reduce((sum, row) => sum + row.rx, 0),
      monthGb: rows.reduce((sum, row) => sum + row.monthGb, 0),
    };
  });

  /** Clientes activos que todavía no tienen cola en MikroTik. */
  readonly withoutQueue = computed(() =>
    CUSTOMERS.filter((customer) => customer.status === 'active' && !this.store.subscribers()[customer.id]),
  );

  readonly filteredRows = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('es');
    const filter = this.filter();
    return this.rows().filter((row) => {
      if (filter === 'online' || filter === 'blocked' || filter === 'offline') {
        if (row.status !== filter) return false;
      } else if (filter === 'sync' && !row.outOfSync) return false;
      return (
        !query ||
        `${row.sub.customerId} ${row.sub.customerName} ${row.sub.ip} ${row.sub.queueName}`
          .toLocaleLowerCase('es')
          .includes(query)
      );
    });
  });

  readonly topConsumers = computed(() => [...this.rows()].sort((a, b) => b.monthGb - a.monthGb).slice(0, 5));
  readonly recentLog = computed(() => this.store.log().slice(0, 25));
  readonly selectedRows = computed(() => this.filteredRows().filter((row) => this.selected().has(row.sub.customerId)));
  readonly allSelected = computed(
    () => this.filteredRows().length > 0 && this.filteredRows().every((row) => this.selected().has(row.sub.customerId)),
  );

  constructor() {
    const timer = window.setInterval(() => this.now.set(new Date()), 5000);
    inject(DestroyRef).onDestroy(() => window.clearInterval(timer));
  }

  statusLabel(status: LinkStatus): string {
    return status === 'online' ? 'En línea' : status === 'blocked' ? 'Bloqueado' : 'Desconectado';
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
    this.selected.set(new Set());
  }

  toggle(id: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.filteredRows().map((row) => row.sub.customerId)));
  }

  toggleCutoff(id: string): void {
    this.cutoffSelected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  selectAllCutoff(): void {
    const ids = this.store.cutoffCandidates().map((item) => item.sub.customerId);
    this.cutoffSelected.set(this.cutoffSelected().size === ids.length ? new Set() : new Set(ids));
  }

  // ─────────────────────────────────────────────────────── Acciones

  /** Aviso de corte por WhatsApp; queda marcado para no repetirlo. */
  warnCutoff(customerId: string): void {
    this.messages.send(customerId, 'tpl-customer-cutoff-warning');
  }
  cutoffWarnedAt(customerId: string): string | undefined {
    return this.messages.last(customerId, 'tpl-customer-cutoff-warning')?.at;
  }
  /** Tras reactivar a quien ya pagó, avisarle que ya tiene servicio. */
  reactivateAndNotify(customerId: string): void {
    const result = this.store.unblock(customerId, this.actor(), 'Reactivado: sin facturas vencidas');
    if (!result.ok) return this.notify(result.error);
    this.messages.send(customerId, 'tpl-network-reactivated');
    this.notify('Cliente reactivado y avisado');
  }

  blockOne(row: Row): void {
    this.bulkReason.set('Falta de pago');
    this.selected.set(new Set([row.sub.customerId]));
    this.bulkDialog.set('block');
  }

  unblockOne(row: Row): void {
    const result = this.store.unblock(row.sub.customerId, this.actor());
    this.notify(result.ok ? `Internet de ${row.sub.customerName} reactivado` : result.error);
  }

  syncOne(row: Row): void {
    this.notify(
      this.store.syncManyToPlan([row.sub.customerId], this.actor())
        ? `Velocidad de ${row.sub.customerName} igualada al plan`
        : 'No se pudo aplicar el plan.',
    );
  }

  confirmBulkBlock(): void {
    const ids =
      this.bulkDialog() === 'cutoff' ? [...this.cutoffSelected()] : this.selectedRows().map((row) => row.sub.customerId);
    const reason = this.bulkDialog() === 'cutoff' ? 'Falta de pago' : this.bulkReason();
    const count = this.store.blockMany(ids, reason, this.actor());
    this.bulkDialog.set(null);
    this.selected.set(new Set());
    this.cutoffSelected.set(new Set());
    this.notify(`${count} cliente(s) bloqueado(s)`);
  }

  bulkUnblock(): void {
    const count = this.store.unblockMany(
      this.selectedRows().map((row) => row.sub.customerId),
      this.actor(),
    );
    this.selected.set(new Set());
    this.notify(`${count} cliente(s) reactivado(s)`);
  }

  bulkSync(): void {
    const count = this.store.syncManyToPlan(
      this.selectedRows().filter((row) => row.outOfSync).map((row) => row.sub.customerId),
      this.actor(),
    );
    this.selected.set(new Set());
    this.notify(`${count} cola(s) igualada(s) a su plan`);
  }

  reactivatePaid(): void {
    const count = this.store.unblockMany(
      this.store.reactivationCandidates().map((sub) => sub.customerId),
      this.actor(),
      'Reactivado: sin facturas vencidas',
    );
    this.notify(`${count} cliente(s) reactivado(s)`);
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 3000);
  }

  private actor(): string {
    return this.session.user()?.name ?? 'Sistema';
  }
}
