import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import {
  ChannelsStore,
  FieldErrors,
  SMTP_SECURITY,
  SmtpConfig,
  SmtpInput,
  SmtpSecurity,
} from '../../../core/channels/channels-store';
import { OperationalStore } from '../../operations/operational-store';

function toInput(config: SmtpConfig): SmtpInput {
  const { updatedAt: _at, updatedBy: _by, ...input } = config;
  return input;
}

@Component({
  selector: 'app-settings-smtp-page',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './settings-smtp-page.html',
  styleUrls: ['../settings-pages.scss', '../settings-channel.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSmtpPage {
  readonly store = inject(ChannelsStore);
  private readonly session = inject(SessionContext);
  private readonly operations = inject(OperationalStore);
  readonly securityOptions = SMTP_SECURITY;

  readonly draft = signal<SmtpInput>(toInput(this.store.smtp()));
  readonly newPassword = signal('');
  readonly changingPassword = signal(!this.store.hasSmtpPassword());
  readonly touched = signal<ReadonlySet<string>>(new Set());
  readonly submitted = signal(false);
  readonly saveError = signal('');
  readonly toast = signal('');

  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));
  readonly errors = computed<FieldErrors<SmtpInput>>(() =>
    this.store.validateSmtp(this.draft(), true, this.newPassword()),
  );
  readonly warnings = computed(() => this.store.smtpWarnings(this.draft()));
  readonly dirty = computed(
    () =>
      !!this.newPassword() ||
      JSON.stringify(this.draft()) !== JSON.stringify(toInput(this.store.smtp())),
  );
  /** Correos que ya salieron por este canal desde el CRM. */
  readonly sentCount = computed(
    () =>
      Object.values(this.operations.emails())
        .flat()
        .filter((email) => email.status === 'SENT').length,
  );
  readonly draftCount = computed(
    () =>
      Object.values(this.operations.emails())
        .flat()
        .filter((email) => email.status === 'DRAFT').length,
  );

  set<K extends keyof SmtpInput>(key: K, value: SmtpInput[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.touched.update((touched) => new Set(touched).add(key));
    this.saveError.set('');
  }

  /** Al elegir el cifrado se sugiere su puerto, salvo que ya se haya escrito otro a mano. */
  setSecurity(security: SmtpSecurity): void {
    const current = this.draft();
    const previousDefault = SMTP_SECURITY.find((item) => item.value === current.security)?.port;
    const nextDefault = SMTP_SECURITY.find((item) => item.value === security)?.port ?? current.port;
    this.set('security', security);
    if (current.port === previousDefault) this.set('port', nextDefault);
  }

  setPort(value: string): void {
    this.set('port', value === '' ? NaN : Number(value));
  }

  setPassword(value: string): void {
    this.newPassword.set(value);
    this.touched.update((touched) => new Set(touched).add('secret'));
    this.saveError.set('');
  }

  error(key: keyof SmtpInput | 'secret'): string | undefined {
    // Apagado no exige datos completos, así que no se marcan como error.
    if (!this.draft().enabled) return undefined;
    return this.submitted() || this.touched().has(key) ? this.errors()[key] : undefined;
  }

  save(): void {
    this.submitted.set(true);
    const result = this.store.saveSmtp(
      this.draft(),
      this.newPassword(),
      this.session.user()?.name ?? 'Sistema',
    );
    if (!result.ok) return this.saveError.set(result.error);
    this.afterSave('Configuración de correo guardada');
  }

  discard(): void {
    this.draft.set(toInput(this.store.smtp()));
    this.newPassword.set('');
    this.changingPassword.set(!this.store.hasSmtpPassword());
    this.touched.set(new Set());
    this.submitted.set(false);
    this.saveError.set('');
  }

  private afterSave(message: string): void {
    this.draft.set(toInput(this.store.smtp()));
    this.newPassword.set('');
    this.changingPassword.set(false);
    this.touched.set(new Set());
    this.submitted.set(false);
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
