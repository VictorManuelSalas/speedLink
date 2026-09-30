import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { ORGANIZATION } from '../../../core/organization/organization.model';
import {
  ClientPortalConfig,
  ClientPortalStore,
  PortalConfigErrors,
} from '../../../core/portal/client-portal.store';
import { PortalAccessStore } from '../../../core/portal/portal-access.store';
import { OperationalStore } from '../../operations/operational-store';

type ToggleKey =
  | 'showInvoices'
  | 'showPayments'
  | 'showTickets'
  | 'showAttachments'
  | 'allowProfileEdit'
  | 'allowTicketCreation'
  | 'allowFileUpload'
  | 'showWifi';

/** Contraste WCAG entre un color y el blanco (el texto de botones y encabezados). */
function contrastWithWhite(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05);
}

@Component({
  selector: 'app-settings-portal-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './settings-portal-page.html',
  styleUrl: './settings-portal-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPortalPage {
  readonly store = inject(ClientPortalStore);
  private readonly session = inject(SessionContext);
  private readonly access = inject(PortalAccessStore);
  private readonly operations = inject(OperationalStore);
  readonly organizationLogo = computed(() => ORGANIZATION.logo);

  readonly draft = signal<ClientPortalConfig>({ ...this.store.config() });
  readonly touched = signal<ReadonlySet<string>>(new Set());
  readonly submitted = signal(false);
  readonly saveError = signal('');
  readonly toast = signal('');
  readonly confirmUnpublish = signal(false);

  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));
  readonly errors = computed<PortalConfigErrors>(() => this.store.validateConfig(this.draft()));
  readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== JSON.stringify(this.store.config()),
  );
  readonly slugChanged = computed(() => this.draft().slug !== this.store.config().slug);
  /** Con poco contraste, el texto blanco sobre el color de marca no se lee. */
  readonly lowContrast = computed(() => {
    const color = this.draft().primaryColor;
    return /^#[0-9a-f]{6}$/i.test(color) && contrastWithWhite(color) < 4.5;
  });
  readonly hiddenEverything = computed(() => {
    const draft = this.draft();
    return !draft.showInvoices && !draft.showPayments && !draft.showTickets && !draft.showAttachments;
  });
  /** Clientes con acceso real al portal, según las invitaciones de cada ficha. */
  readonly accessStats = computed(() => {
    const summary = this.access.summary();
    const customers = this.operations.recordsFor('customers').length;
    return {
      ...summary,
      customers,
      notInvited: Math.max(0, customers - summary.active - summary.disabled),
    };
  });

  portalUrl(slug = this.store.config().slug): string {
    return `${window.location.origin}/portal/${slug}`;
  }

  set<K extends keyof ClientPortalConfig>(key: K, value: ClientPortalConfig[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.touched.update((touched) => new Set(touched).add(key));
    this.saveError.set('');
  }

  /** Normaliza mientras se escribe: minúsculas y guiones en lugar de espacios. */
  setSlug(value: string): void {
    this.set(
      'slug',
      value
        .toLocaleLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-'),
    );
  }

  /** Quitar "ver" apaga también la acción que depende de ello. */
  toggle(key: ToggleKey, value: boolean): void {
    this.set(key, value);
    if (key === 'showTickets' && !value) this.set('allowTicketCreation', false);
    if (key === 'showAttachments' && !value) this.set('allowFileUpload', false);
  }

  error(key: keyof ClientPortalConfig): string | undefined {
    return this.submitted() || this.touched().has(key) ? this.errors()[key] : undefined;
  }

  /** Publicar aplica al instante; despublicar pide confirmación porque deja fuera a todos. */
  requestPublish(enabled: boolean): void {
    if (!enabled) {
      this.confirmUnpublish.set(true);
      return;
    }
    this.store.updateConfig({ enabled: true });
    this.draft.update((draft) => ({ ...draft, enabled: true }));
    this.notify('Portal publicado');
  }

  unpublish(): void {
    this.store.updateConfig({ enabled: false });
    this.draft.update((draft) => ({ ...draft, enabled: false }));
    this.confirmUnpublish.set(false);
    this.notify('Portal despublicado');
  }

  save(): void {
    this.submitted.set(true);
    const result = this.store.saveConfig(this.draft());
    if (!result.ok) return this.saveError.set(result.error);
    this.draft.set({ ...this.store.config() });
    this.touched.set(new Set());
    this.submitted.set(false);
    this.notify('Cambios del portal guardados');
  }

  discard(): void {
    this.draft.set({ ...this.store.config() });
    this.touched.set(new Set());
    this.submitted.set(false);
    this.saveError.set('');
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
