import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { IntegrationsStore, Webhook, WebhookDelivery, WebhookInput } from '../../../core/integrations/integrations.store';
import { WEBHOOK_EVENTS } from '../../../core/integrations/webhook-events';

const EMPTY: WebhookInput = { name: '', event: 'payment.created', connectionId: '', target: '', enabled: true };

@Component({
  selector: 'app-settings-webhooks-page',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './settings-webhooks-page.html',
  styleUrls: ['../settings-pages.scss', '../settings-channel.scss', './settings-webhooks-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsWebhooksPage {
  readonly store = inject(IntegrationsStore);
  private readonly session = inject(SessionContext);
  readonly events = WEBHOOK_EVENTS;
  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));

  readonly editor = signal<{ id?: string } | null>(null);
  readonly draft = signal<WebhookInput>(EMPTY);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly errors = computed(() => this.store.validateWebhook(this.draft()));
  readonly removing = signal<Webhook | null>(null);
  readonly payload = signal<WebhookDelivery | null>(null);
  readonly testing = signal<string | null>(null);
  readonly toast = signal('');
  readonly filter = signal<'all' | 'queued' | 'failed' | 'sent'>('all');

  readonly preview = computed(() => this.store.urlOf(this.draft()));
  readonly deliveries = computed(() =>
    this.store.deliveries().filter((delivery) => this.filter() === 'all' || delivery.status === this.filter()).slice(0, 60),
  );

  open(hook?: Webhook): void {
    this.draft.set(hook ? { name: hook.name, event: hook.event, connectionId: hook.connectionId, target: hook.target, enabled: hook.enabled } : EMPTY);
    this.submitted.set(false);
    this.error.set('');
    this.editor.set({ id: hook?.id });
  }

  set<K extends keyof WebhookInput>(key: K, value: WebhookInput[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.error.set('');
  }

  fieldError(key: keyof WebhookInput): string | undefined {
    return this.submitted() ? this.errors()[key] : undefined;
  }

  save(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    const id = this.editor()?.id;
    const result = this.store.saveWebhook(this.draft(), this.actor(), id);
    if (!result.ok) return this.error.set(result.error);
    this.editor.set(null);
    this.notify(id ? 'Webhook actualizado' : 'Webhook creado');
  }

  confirmRemove(): void {
    const hook = this.removing();
    if (hook) this.store.removeWebhook(hook.id);
    this.removing.set(null);
    this.notify('Webhook eliminado');
  }

  toggle(hook: Webhook): void {
    this.store.toggleWebhook(hook.id, this.actor());
  }

  async test(hook: Webhook): Promise<void> {
    this.testing.set(hook.id);
    const delivery = await this.store.sendTest(hook.id);
    this.testing.set(null);
    if (delivery) this.notify(delivery.status === 'sent' ? `Prueba entregada (${delivery.detail})` : `La prueba falló: ${delivery.detail}`);
  }

  eventHint(value: string): string {
    return WEBHOOK_EVENTS.find((item) => item.value === value)?.hint ?? '';
  }

  statusLabel(status: WebhookDelivery['status']): string {
    return status === 'sent' ? 'Entregado' : status === 'failed' ? 'Falló' : 'En cola';
  }

  lastDelivery(hook: Webhook): WebhookDelivery | undefined {
    return this.store.deliveries().find((delivery) => delivery.webhookId === hook.id);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.editor.set(null);
    this.removing.set(null);
    this.payload.set(null);
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 3000);
  }

  private actor(): string {
    return this.session.user()?.name ?? 'Sistema';
  }
}
