import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import {
  ChannelsStore,
  FieldErrors,
  SMS_PROVIDERS,
  SmsConfig,
  SmsInput,
  smsSegments,
} from '../../../core/channels/channels-store';
import { TemplateStore } from '../../../core/data-access/templates/template-store';

function toInput(config: SmsConfig): SmsInput {
  const { updatedAt: _at, updatedBy: _by, ...input } = config;
  return input;
}

@Component({
  selector: 'app-settings-sms-page',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './settings-sms-page.html',
  styleUrls: ['../settings-pages.scss', '../settings-channel.scss', './settings-sms-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSmsPage {
  readonly store = inject(ChannelsStore);
  private readonly session = inject(SessionContext);
  private readonly templates = inject(TemplateStore);
  readonly providers = SMS_PROVIDERS;

  readonly draft = signal<SmsInput>(toInput(this.store.sms()));
  readonly newToken = signal('');
  readonly changingToken = signal(!this.store.hasSmsToken());
  readonly touched = signal<ReadonlySet<string>>(new Set());
  readonly submitted = signal(false);
  readonly saveError = signal('');
  readonly toast = signal('');
  readonly sample = signal('Hola, tu pago de $350 fue recibido. Gracias por usar SpeedLink.');

  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));
  readonly provider = computed(
    () => SMS_PROVIDERS.find((item) => item.value === this.draft().provider) ?? SMS_PROVIDERS[0],
  );
  readonly errors = computed<FieldErrors<SmsInput>>(() =>
    this.store.validateSms(this.draft(), true, this.newToken()),
  );
  readonly dirty = computed(
    () =>
      !!this.newToken() ||
      JSON.stringify(this.draft()) !== JSON.stringify(toInput(this.store.sms())),
  );
  readonly sampleSegments = computed(() => smsSegments(this.sample()));
  /** Plantillas de SMS/WhatsApp con su costo en segmentos (texto sin sustituir variables). */
  readonly smsTemplates = computed(() =>
    this.templates
      .all()
      .filter((template) => template.channel === 'sms')
      .map((template) => ({ template, segments: smsSegments(template.body) })),
  );
  readonly quietNow = computed(() => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return this.store.inQuietHours(time, this.draft());
  });

  set<K extends keyof SmsInput>(key: K, value: SmsInput[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.touched.update((touched) => new Set(touched).add(key));
    this.saveError.set('');
  }

  setToken(value: string): void {
    this.newToken.set(value);
    this.touched.update((touched) => new Set(touched).add('secret'));
    this.saveError.set('');
  }

  error(key: keyof SmsInput | 'secret'): string | undefined {
    if (!this.draft().enabled) return undefined;
    return this.submitted() || this.touched().has(key) ? this.errors()[key] : undefined;
  }

  save(): void {
    this.submitted.set(true);
    const result = this.store.saveSms(this.draft(), this.newToken(), this.session.user()?.name ?? 'Sistema');
    if (!result.ok) return this.saveError.set(result.error);
    this.draft.set(toInput(this.store.sms()));
    this.newToken.set('');
    this.changingToken.set(false);
    this.touched.set(new Set());
    this.submitted.set(false);
    this.toast.set('Configuración de SMS guardada');
    window.setTimeout(() => this.toast.set(''), 2600);
  }

  discard(): void {
    this.draft.set(toInput(this.store.sms()));
    this.newToken.set('');
    this.changingToken.set(!this.store.hasSmsToken());
    this.touched.set(new Set());
    this.submitted.set(false);
    this.saveError.set('');
  }
}
