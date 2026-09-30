import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { MikrotikStore, NetworkResult } from '../../../core/network/mikrotik.store';
import {
  BLOCK_REASONS,
  BlockReason,
  RouterCommands,
  Speed,
  defaultUpload,
  formatGb,
  formatMbps,
  lastDays,
  lastHours,
  monthUsage,
  speedLabel,
  trafficNow,
} from '../../../core/network/mikrotik.model';
import { NetworkLog } from '../network-log';
import { CustomerMessages } from '../../../core/whatsapp/customer-messages';

type Dialog = 'block' | 'unblock' | 'speed' | 'ip' | 'reset' | 'remove' | null;

/**
 * Red del cliente en MikroTik: estado, consumo, velocidad y acciones.
 * `compact` es la tarjeta resumida que ve Soporte dentro de un ticket.
 */
@Component({
  selector: 'app-customer-network',
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, NetworkLog],
  templateUrl: './customer-network.html',
  styleUrls: ['../network.scss', './customer-network.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerNetwork {
  readonly store = inject(MikrotikStore);
  private readonly session = inject(SessionContext);
  readonly messages = inject(CustomerMessages);
  /** Tras bloquear o reactivar, abrir WhatsApp con el aviso para el cliente. */
  readonly notifyCustomer = signal(true);
  readonly canNotify = computed(() => this.messages.canSend(this.customerId()));

  readonly customerId = input.required<string>();
  readonly customerName = input('');
  readonly defaultIp = input('');
  readonly compact = input(false);
  /** Otro componente (p. ej. el botón del encabezado) pide abrir un diálogo. */
  readonly intent = input<{ action: 'block' | 'unblock'; key: number } | null>(null);

  readonly bandLabel = formatMbps;
  readonly gb = formatGb;
  readonly speedText = speedLabel;
  readonly reasons = BLOCK_REASONS;

  /** Reloj de la demo: la tasa actual se refresca cada 5 s como en Winbox. */
  readonly now = signal(new Date());

  readonly canRead = computed(() => this.session.hasPermission('network.read'));
  readonly canUpdate = computed(() => this.session.hasPermission('network.update'));
  readonly canBlock = computed(() => this.session.hasPermission('network.block'));

  readonly sub = computed(() => this.store.subscriber(this.customerId()));
  readonly router = computed(() => {
    const sub = this.sub();
    return sub ? this.store.router(sub.routerId) : undefined;
  });
  readonly plan = computed(() => this.store.planFor(this.customerId()));
  readonly applied = computed(() => {
    const sub = this.sub();
    return sub ? this.store.appliedSpeed(sub) : null;
  });
  readonly outOfSync = computed(() => {
    const sub = this.sub();
    return !!sub && this.store.outOfSync(sub);
  });
  readonly overdue = computed(() => this.store.overdueFor(this.customerId()));
  readonly pastGrace = computed(() => this.overdue().count > 0 && this.overdue().days > this.store.rules().graceDays);

  readonly traffic = computed(() => trafficNow(this.customerId(), this.applied(), !!this.sub()?.blocked, this.now()));
  readonly hours = computed(() => {
    const sub = this.sub();
    return lastHours(this.customerId(), this.applied(), sub?.blockedAt, this.now());
  });
  readonly days = computed(() => {
    const sub = this.sub();
    return lastDays(this.customerId(), this.applied(), 30, { blockedAt: sub?.blockedAt }, this.now());
  });
  readonly month = computed(() => {
    const sub = this.sub();
    return monthUsage(this.customerId(), this.applied(), { blockedAt: sub?.blockedAt, since: sub?.countersResetAt }, this.now());
  });
  readonly dailyAverage = computed(() => {
    const days = this.days().filter((day) => day.gb > 0);
    return days.length ? days.reduce((sum, day) => sum + day.gb, 0) / days.length : 0;
  });
  readonly peakHour = computed(() => this.hours().reduce((max, point) => (point.rx > max.rx ? point : max), this.hours()[0]));
  readonly customerLog = computed(() => this.store.logFor(this.customerId()).slice(0, 8));

  /** Área SVG de las últimas 24 h (ancho 240 × alto 60). */
  readonly hoursPath = computed(() => {
    const points = this.hours();
    const max = Math.max(0.1, ...points.map((point) => point.rx));
    const step = 240 / (points.length - 1);
    const line = points.map((point, i) => `${(i * step).toFixed(1)},${(58 - (point.rx / max) * 54).toFixed(1)}`);
    return { line: `M${line.join(' L')}`, area: `M0,60 L${line.join(' L')} L240,60 Z`, max };
  });
  readonly dayBars = computed(() => {
    const days = this.days();
    const max = Math.max(0.1, ...days.map((day) => day.gb));
    return days.map((day, i) => ({ ...day, x: i * 8, h: Math.max(day.gb > 0 ? 2 : 0, (day.gb / max) * 56) }));
  });

  // ───────────────────────────────────────────────────── Formularios

  readonly dialog = signal<Dialog>(null);
  readonly error = signal('');
  readonly toast = signal('');
  readonly moreOpen = signal(false);

  // Alta de la cola
  readonly provRouter = signal('');
  readonly provIp = signal('');
  readonly provQueue = signal('');
  readonly provProfile = signal('plan');
  readonly provDown = signal(10);
  readonly provUp = signal(2);
  readonly provBurst = signal(true);

  // Bloqueo / velocidad / IP
  readonly blockReason = signal<BlockReason>('Falta de pago');
  readonly blockNote = signal('');
  readonly speedChoice = signal('plan');
  readonly speedDown = signal(10);
  readonly speedUp = signal(2);
  readonly speedBurst = signal(true);
  readonly speedReason = signal('');
  readonly newIp = signal('');

  readonly provSpeed = computed<Speed | null>(() => this.speedFrom(this.provProfile(), this.provDown(), this.provUp()));
  readonly provCommand = computed(() => {
    const speed = this.provSpeed();
    return speed
      ? RouterCommands.provision(
          { customerId: this.customerId(), queueName: this.provQueue() || '…', ip: this.provIp() || '…' },
          speed,
          this.provBurst(),
        )
      : '';
  });
  readonly chosenSpeed = computed<Speed | null>(() => this.speedFrom(this.speedChoice(), this.speedDown(), this.speedUp()));
  /** Subir, bajar o igual respecto a lo aplicado. */
  readonly speedDirection = computed(() => {
    const chosen = this.chosenSpeed();
    const current = this.applied();
    if (!chosen || !current) return '';
    return chosen.download > current.download ? 'up' : chosen.download < current.download ? 'down' : 'same';
  });

  constructor() {
    const timer = window.setInterval(() => this.now.set(new Date()), 5000);
    inject(DestroyRef).onDestroy(() => window.clearInterval(timer));
    // Prellena el alta con los datos del cliente y su plan.
    effect(() => {
      const id = this.customerId();
      const name = this.customerName();
      const ip = this.defaultIp();
      untracked(() => {
        this.provRouter.set(this.store.activeRouters()[0]?.id ?? '');
        this.provIp.set(ip);
        this.provQueue.set(`${id} ${name}`.trim());
        const plan = this.store.planFor(id).speed;
        this.provProfile.set(plan ? 'plan' : 'custom');
      });
    });
    effect(() => {
      const intent = this.intent();
      if (intent) untracked(() => this.open(intent.action));
    });
  }

  // ─────────────────────────────────────────────────────────── Acciones

  open(dialog: Exclude<Dialog, null>): void {
    this.error.set('');
    this.moreOpen.set(false);
    const sub = this.sub();
    this.notifyCustomer.set(true);
    if (dialog === 'block') {
      this.blockReason.set(this.pastGrace() ? 'Falta de pago' : 'Solicitud del cliente');
      this.blockNote.set('');
    }
    if (dialog === 'speed') {
      const applied = this.applied();
      this.speedChoice.set(this.outOfSync() || !applied ? 'plan' : 'custom');
      this.speedDown.set(applied?.download ?? 10);
      this.speedUp.set(applied?.upload ?? 2);
      this.speedBurst.set(sub?.burst ?? true);
      this.speedReason.set('');
    }
    if (dialog === 'ip') this.newIp.set(sub?.ip ?? '');
    this.dialog.set(dialog);
  }

  close(): void {
    this.dialog.set(null);
  }

  provision(): void {
    const speed = this.provSpeed();
    if (!speed) return this.error.set('Elige una velocidad.');
    this.finish(
      this.store.provision(
        this.customerId(),
        { routerId: this.provRouter(), ip: this.provIp(), queueName: this.provQueue(), speed, burst: this.provBurst() },
        this.actor(),
      ),
      'Cola creada',
    );
  }

  confirmBlock(): void {
    const result = this.store.block(this.customerId(), this.blockReason(), this.blockNote(), this.actor());
    // El aviso de suspensión habla de adeudo: sólo aplica al corte por falta de pago.
    if (
      result.ok &&
      this.notifyCustomer() &&
      this.canNotify() &&
      this.blockReason() === 'Falta de pago' &&
      this.overdue().count > 0
    )
      this.messages.send(this.customerId(), 'tpl-network-suspended');
    this.finish(result, 'Internet bloqueado');
  }

  confirmUnblock(): void {
    const result = this.store.unblock(this.customerId(), this.actor());
    if (result.ok && this.notifyCustomer() && this.canNotify()) this.messages.send(this.customerId(), 'tpl-network-reactivated');
    this.finish(result, 'Internet reactivado');
  }

  confirmSpeed(): void {
    const speed = this.chosenSpeed();
    if (!speed) return this.error.set('Elige una velocidad.');
    const reason = this.speedChoice() === 'plan' ? 'Igualada al plan' : this.speedReason().trim();
    this.finish(this.store.setSpeed(this.customerId(), speed, this.speedBurst(), this.actor(), reason), 'Velocidad actualizada');
  }

  applyPlan(): void {
    const plan = this.plan();
    const sub = this.sub();
    if (!plan.speed || !sub) return;
    this.finish(
      this.store.setSpeed(this.customerId(), plan.speed, plan.profile?.burst ?? sub.burst, this.actor(), 'Igualada al plan'),
      'Velocidad igualada al plan',
    );
  }

  confirmIp(): void {
    this.finish(this.store.changeIp(this.customerId(), this.newIp(), this.actor()), 'IP actualizada');
  }

  confirmReset(): void {
    this.finish(this.store.resetCounters(this.customerId(), this.actor()), 'Contadores reiniciados');
  }

  confirmRemove(): void {
    this.finish(this.store.removeQueue(this.customerId(), this.actor()), 'Cola eliminada');
  }

  profileSpeed(id: string): string {
    const profile = this.store.profiles().find((item) => item.id === id);
    return profile ? speedLabel(profile) : '';
  }

  private speedFrom(choice: string, down: number, up: number): Speed | null {
    if (choice === 'plan') return this.plan().speed;
    if (choice === 'custom') {
      const download = Number(down);
      const upload = Number(up) || defaultUpload(download);
      return download > 0 ? { download, upload } : null;
    }
    const profile = this.store.profiles().find((item) => item.id === choice);
    return profile ? { download: profile.download, upload: profile.upload } : null;
  }

  private finish(result: NetworkResult<unknown>, message: string): void {
    if (!result.ok) return this.error.set(result.error);
    this.dialog.set(null);
    this.error.set('');
    this.toast.set(
      result.status === 'simulated'
        ? `${message} en el router de demostración.`
        : `${message}. Copia el comando de la bitácora y ejecútalo en el router.`,
    );
    window.setTimeout(() => this.toast.set(''), 3200);
  }

  private actor(): string {
    return this.session.user()?.name ?? 'Sistema';
  }
}
