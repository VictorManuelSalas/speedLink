import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { OrganizationStore, TaxInput } from '../../../core/organization/organization-store';
import { TaxRate, computeTax, taxLabel } from '../../../core/organization/organization.model';
import { FloatingPanel } from '../../../shared/floating-panel';
import { OperationalStore } from '../../operations/operational-store';

const EMPTY_TAX: TaxInput = { name: '', factor: 'rate', rate: 16, description: '' };

@Component({
  selector: 'app-settings-taxes-page',
  imports: [CurrencyPipe, FloatingPanel, FormsModule, RouterLink],
  templateUrl: './settings-taxes-page.html',
  styleUrls: ['../settings-pages.scss', './settings-taxes-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsTaxesPage {
  readonly store = inject(OrganizationStore);
  private readonly session = inject(SessionContext);
  private readonly operations = inject(OperationalStore);
  readonly taxLabel = taxLabel;

  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));
  readonly menuId = signal<string | null>(null);
  readonly toast = signal('');

  readonly editor = signal<{ id: string | null } | null>(null);
  readonly draft = signal<TaxInput>({ ...EMPTY_TAX });
  readonly formError = signal('');
  readonly deleting = signal<TaxRate | null>(null);
  readonly deleteError = signal('');

  /** Simulador: cómo queda una factura con cada tasa. */
  readonly simAmount = signal(1000);
  readonly simTaxId = signal(this.store.defaultTax()?.id ?? '');
  readonly simulation = computed(() =>
    computeTax(this.simAmount(), this.store.tax(this.simTaxId())),
  );

  /** Facturas por tasa, según la tasa con la que se emitieron. */
  readonly usage = computed(() => {
    const counts = new Map<string, number>();
    for (const invoice of this.operations.recordsFor('invoices')) {
      const id = String(invoice['taxRateId'] ?? '');
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  });
  readonly metrics = computed(() => {
    const invoices = this.operations.recordsFor('invoices');
    return {
      active: this.store.activeTaxes().length,
      total: this.store.taxes().length,
      withTax: invoices.filter((invoice) => invoice['taxRateId']).length,
      invoices: invoices.length,
    };
  });
  readonly editingUsage = computed(() => {
    const id = this.editor()?.id;
    return id ? (this.usage().get(id) ?? 0) : 0;
  });

  usedBy(tax: TaxRate): number {
    return this.usage().get(tax.id) ?? 0;
  }

  // ---------------------------------------------------------------- Editor

  openCreate(): void {
    this.draft.set({ ...EMPTY_TAX });
    this.formError.set('');
    this.editor.set({ id: null });
  }

  openEdit(tax: TaxRate): void {
    this.menuId.set(null);
    this.draft.set({
      name: tax.name,
      factor: tax.factor,
      rate: tax.rate,
      description: tax.description,
    });
    this.formError.set('');
    this.editor.set({ id: tax.id });
  }

  setDraft<K extends keyof TaxInput>(key: K, value: TaxInput[K]): void {
    this.draft.update((draft) => ({
      ...draft,
      [key]: value,
      // Exento no causa impuesto: su tasa siempre es 0.
      ...(key === 'factor' && value === 'exempt' ? { rate: 0 } : {}),
    }));
    this.formError.set('');
  }

  save(event: Event): void {
    event.preventDefault();
    const editor = this.editor();
    if (!editor) return;
    const input = { ...this.draft(), rate: Number(this.draft().rate) };
    const result = editor.id ? this.store.updateTax(editor.id, input) : this.store.createTax(input);
    if (!result.ok) return this.formError.set(result.error);
    this.editor.set(null);
    this.notify(editor.id ? `${result.value.name} actualizada` : `${result.value.name} creada`);
  }

  // --------------------------------------------------------------- Acciones

  toggleMenu(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.menuId.update((current) => (current === id ? null : id));
  }

  makeDefault(tax: TaxRate): void {
    this.menuId.set(null);
    const result = this.store.setDefault(tax.id);
    this.notify(result.ok ? `${tax.name} es ahora la tasa predeterminada` : result.error);
    if (result.ok) this.simTaxId.set(tax.id);
  }

  toggleActive(tax: TaxRate): void {
    this.menuId.set(null);
    const result = this.store.setActive(tax.id, !tax.active);
    this.notify(result.ok ? `${tax.name} ${tax.active ? 'desactivada' : 'activada'}` : result.error);
  }

  askDelete(tax: TaxRate): void {
    this.menuId.set(null);
    this.deleteError.set('');
    this.deleting.set(tax);
  }

  confirmDelete(): void {
    const tax = this.deleting();
    if (!tax) return;
    const result = this.store.deleteTax(tax.id, this.usedBy(tax));
    if (!result.ok) return this.deleteError.set(result.error);
    this.deleting.set(null);
    if (this.simTaxId() === tax.id) this.simTaxId.set(this.store.defaultTax()?.id ?? '');
    this.notify(`${tax.name} eliminada`);
  }

  /** Motivo por el que no se puede desactivar/eliminar, o null. */
  lockReason(tax: TaxRate, action: 'deactivate' | 'delete'): string | null {
    if (tax.isDefault) return 'Es la tasa predeterminada';
    if (action === 'delete' && this.usedBy(tax)) return `La usan ${this.usedBy(tax)} factura(s)`;
    return null;
  }

  @HostListener('document:click') closeMenu(): void {
    this.menuId.set(null);
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
