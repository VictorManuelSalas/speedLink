import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import {
  OrganizationStore,
  ProfileErrors,
  ProfileInput,
} from '../../../core/organization/organization-store';
import {
  MX_STATES,
  OrganizationProfile,
  TAX_REGIMES,
  formatAddress,
} from '../../../core/organization/organization.model';
import { OperationalStore } from '../../operations/operational-store';

const LOGO_MAX_BYTES = 512 * 1024;

function toInput(profile: OrganizationProfile): ProfileInput {
  const { code: _code, updatedAt: _at, updatedBy: _by, ...input } = profile;
  return input;
}

@Component({
  selector: 'app-settings-organization-page',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './settings-organization-page.html',
  styleUrls: ['../settings-pages.scss', './settings-organization-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsOrganizationPage {
  readonly store = inject(OrganizationStore);
  private readonly session = inject(SessionContext);
  private readonly operations = inject(OperationalStore);
  readonly regimes = TAX_REGIMES;
  readonly states = MX_STATES;

  readonly draft = signal<ProfileInput>(toInput(this.store.profile()));
  /** Campos que el usuario ya tocó: sólo esos muestran su error mientras escribe. */
  readonly touched = signal<ReadonlySet<string>>(new Set());
  readonly submitted = signal(false);
  readonly logoError = signal('');
  readonly saveError = signal('');
  readonly toast = signal('');

  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));
  readonly errors = computed<ProfileErrors>(() => ({
    ...this.store.validateProfile(this.draft()),
    ...this.folioConflict(),
  }));
  readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== JSON.stringify(toInput(this.store.profile())),
  );
  readonly nextFolio = computed(() => this.store.previewInvoiceFolio(this.draft()));
  readonly previewAddress = computed(() =>
    formatAddress({ ...this.store.profile(), ...this.draft() }),
  );
  readonly regimeLabel = computed(
    () => TAX_REGIMES.find((regime) => regime.code === this.draft().taxRegime)?.label ?? '',
  );
  readonly invoiceCount = computed(() => this.operations.recordsFor('invoices').length);

  set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.touched.update((touched) => new Set(touched).add(key));
    this.saveError.set('');
  }

  setNumber(key: 'nextInvoiceNumber' | 'paymentTermsDays', value: string): void {
    this.set(key, value === '' ? NaN : Number(value));
  }

  /** Error visible del campo: tras tocarlo o al intentar guardar. */
  error(key: keyof ProfileInput): string | undefined {
    return this.submitted() || this.touched().has(key) ? this.errors()[key] : undefined;
  }

  async pickLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.logoError.set('');
    if (!['image/png', 'image/jpeg'].includes(file.type))
      return this.logoError.set('Usa una imagen PNG o JPG.');
    if (file.size > LOGO_MAX_BYTES) return this.logoError.set('El logo debe pesar menos de 512 KB.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }).catch(() => '');
    if (!dataUrl) return this.logoError.set('No se pudo leer la imagen.');
    this.set('logo', dataUrl);
  }

  save(): void {
    this.submitted.set(true);
    if (Object.keys(this.errors()).length) {
      this.saveError.set('Revisa los campos marcados en rojo.');
      return;
    }
    const result = this.store.updateProfile(this.draft(), this.session.user()?.name ?? 'Sistema');
    if (!result.ok) return this.saveError.set(result.error);
    this.draft.set(toInput(result.value));
    this.touched.set(new Set());
    this.submitted.set(false);
    this.notify('Datos de la organización guardados');
  }

  discard(): void {
    this.draft.set(toInput(this.store.profile()));
    this.touched.set(new Set());
    this.submitted.set(false);
    this.saveError.set('');
    this.logoError.set('');
  }

  /** Un folio que ya existe en Facturas repetiría la numeración. */
  private folioConflict(): ProfileErrors {
    const draft = this.draft();
    if (!draft.invoiceSeries || !Number.isInteger(draft.nextInvoiceNumber)) return {};
    const folio = this.store.previewInvoiceFolio(draft);
    const taken = this.operations
      .recordsFor('invoices')
      .some((invoice) => String(invoice['folio'] ?? '').toUpperCase() === folio);
    return taken
      ? { nextInvoiceNumber: `El folio ${folio} ya existe: usa un número mayor.` }
      : {};
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
