import { Injectable, computed, effect, signal } from '@angular/core';
import {
  OrganizationProfile,
  SEED_ORGANIZATION,
  SEED_TAXES,
  TAX_REGIMES,
  TaxFactor,
  TaxRate,
  isValidRfc,
  setLiveOrganization,
  setLiveTaxes,
} from './organization.model';

const PROFILE_KEY = 'speedlink-organization';
const TAXES_KEY = 'speedlink-taxes';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type OrgResult<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): OrgResult<T> => ({ ok: true, value });
const fail = <T = never>(error: string): OrgResult<T> => ({ ok: false, error });

export type ProfileInput = Omit<OrganizationProfile, 'code' | 'updatedAt' | 'updatedBy'>;

export interface TaxInput {
  readonly name: string;
  readonly factor: TaxFactor;
  readonly rate: number;
  readonly description: string;
}

/** Errores de validación del perfil, por campo, para marcar el formulario. */
export type ProfileErrors = Partial<Record<keyof ProfileInput, string>>;

/**
 * Perfil de la organización e impuestos. Siempre existe una tasa
 * predeterminada y activa: es la que toman las facturas nuevas.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationStore {
  readonly profile = signal<OrganizationProfile>(this.readProfile());
  readonly taxes = signal<ReadonlyArray<TaxRate>>(this.readTaxes());

  readonly activeTaxes = computed(() => this.taxes().filter((tax) => tax.active));
  readonly defaultTax = computed<TaxRate | undefined>(
    () => this.taxes().find((tax) => tax.isDefault) ?? this.activeTaxes()[0],
  );

  constructor() {
    effect(() => {
      const profile = this.profile();
      setLiveOrganization(profile);
      this.persist(PROFILE_KEY, profile);
    });
    effect(() => {
      const taxes = this.taxes();
      setLiveTaxes(taxes);
      this.persist(TAXES_KEY, taxes);
    });
  }

  // ------------------------------------------------------------------ Perfil

  validateProfile(input: ProfileInput): ProfileErrors {
    const errors: ProfileErrors = {};
    if (input.tradeName.trim().length < 2) errors.tradeName = 'Escribe el nombre comercial.';
    if (input.legalName.trim().length < 3) errors.legalName = 'Escribe la razón social.';
    if (!isValidRfc(input.rfc))
      errors.rfc = 'RFC inválido: 12 caracteres (moral) o 13 (física), p. ej. ABC200115XY1.';
    if (!TAX_REGIMES.some((regime) => regime.code === input.taxRegime))
      errors.taxRegime = 'Selecciona el régimen fiscal.';
    if (!/^\d{5}$/.test(input.fiscalPostalCode))
      errors.fiscalPostalCode = 'El código postal fiscal tiene 5 dígitos.';
    if (!EMAIL_PATTERN.test(input.email.trim())) errors.email = 'Correo con formato inválido.';
    if (input.phone && input.phone.replace(/\D/g, '').length < 10)
      errors.phone = 'El teléfono debe tener al menos 10 dígitos.';
    if (input.website && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(input.website.trim()))
      errors.website = 'Incluye https://, p. ej. https://speedlink.mx';
    if (input.postalCode && !/^\d{5}$/.test(input.postalCode))
      errors.postalCode = 'El código postal tiene 5 dígitos.';
    if (!/^[A-Z]{1,10}$/.test(input.invoiceSeries))
      errors.invoiceSeries = 'De 1 a 10 letras mayúsculas, sin espacios.';
    if (!Number.isInteger(input.nextInvoiceNumber) || input.nextInvoiceNumber < 1)
      errors.nextInvoiceNumber = 'Debe ser un número entero mayor a 0.';
    if (
      !Number.isInteger(input.paymentTermsDays) ||
      input.paymentTermsDays < 0 ||
      input.paymentTermsDays > 120
    )
      errors.paymentTermsDays = 'Entre 0 y 120 días.';
    return errors;
  }

  updateProfile(input: ProfileInput, actorName: string): OrgResult<OrganizationProfile> {
    const clean: ProfileInput = {
      ...input,
      tradeName: input.tradeName.trim(),
      legalName: input.legalName.trim(),
      rfc: input.rfc.trim().toUpperCase(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      website: input.website.trim(),
      street: input.street.trim(),
      city: input.city.trim(),
      invoiceSeries: input.invoiceSeries.trim().toUpperCase(),
    };
    const errors = this.validateProfile(clean);
    if (Object.keys(errors).length) return fail('Revisa los campos marcados.');
    const profile: OrganizationProfile = {
      ...this.profile(),
      ...clean,
      updatedAt: new Date().toISOString(),
      updatedBy: actorName,
    };
    this.profile.set(profile);
    return ok(profile);
  }

  /** Folio que llevará la siguiente factura (no lo consume). */
  previewInvoiceFolio(profile: Pick<OrganizationProfile, 'invoiceSeries' | 'nextInvoiceNumber'> = this.profile()): string {
    return `${profile.invoiceSeries}-${String(profile.nextInvoiceNumber).padStart(6, '0')}`;
  }

  /**
   * Reserva el folio: la serie avanza aunque la factura se elimine después,
   * para que ningún folio se repita.
   */
  consumeInvoiceFolio(): string {
    const folio = this.previewInvoiceFolio();
    this.profile.update((profile) => ({
      ...profile,
      nextInvoiceNumber: profile.nextInvoiceNumber + 1,
    }));
    return folio;
  }

  // --------------------------------------------------------------- Impuestos

  tax(id: string): TaxRate | undefined {
    return this.taxes().find((tax) => tax.id === id);
  }

  createTax(input: TaxInput): OrgResult<TaxRate> {
    const invalid = this.validateTax(input);
    if (invalid) return fail(invalid);
    const now = new Date().toISOString();
    const tax: TaxRate = {
      id: `tax-${crypto.randomUUID?.() ?? Date.now()}`,
      ...this.cleanTax(input),
      active: true,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    this.taxes.update((taxes) => [...taxes, tax]);
    return ok(tax);
  }

  /** Las facturas guardan la tasa con la que se emitieron: editar no las altera. */
  updateTax(id: string, input: TaxInput): OrgResult<TaxRate> {
    const current = this.tax(id);
    if (!current) return fail('La tasa ya no existe.');
    const invalid = this.validateTax(input, id);
    if (invalid) return fail(invalid);
    const updated: TaxRate = {
      ...current,
      ...this.cleanTax(input),
      updatedAt: new Date().toISOString(),
    };
    this.replaceTax(updated);
    return ok(updated);
  }

  setDefault(id: string): OrgResult {
    const tax = this.tax(id);
    if (!tax) return fail('La tasa ya no existe.');
    if (!tax.active) return fail('Activa la tasa antes de hacerla predeterminada.');
    const now = new Date().toISOString();
    this.taxes.update((taxes) =>
      taxes.map((item) =>
        item.id === id
          ? { ...item, isDefault: true, updatedAt: now }
          : item.isDefault
            ? { ...item, isDefault: false, updatedAt: now }
            : item,
      ),
    );
    return ok(undefined);
  }

  setActive(id: string, active: boolean): OrgResult {
    const tax = this.tax(id);
    if (!tax) return fail('La tasa ya no existe.');
    if (!active && tax.isDefault)
      return fail('Es la tasa predeterminada: elige otra predeterminada antes de desactivarla.');
    this.replaceTax({ ...tax, active, updatedAt: new Date().toISOString() });
    return ok(undefined);
  }

  /** Una tasa usada por facturas sólo se desactiva, para no dejarlas sin referencia. */
  deleteTax(id: string, usedByInvoices: number): OrgResult {
    const tax = this.tax(id);
    if (!tax) return fail('La tasa ya no existe.');
    if (tax.isDefault) return fail('No se puede eliminar la tasa predeterminada.');
    if (usedByInvoices > 0)
      return fail(`La usan ${usedByInvoices} factura(s): desactívala en lugar de eliminarla.`);
    this.taxes.update((taxes) => taxes.filter((item) => item.id !== id));
    return ok(undefined);
  }

  private validateTax(input: TaxInput, id?: string): string | null {
    const name = input.name.trim();
    if (name.length < 2) return 'Escribe el nombre de la tasa.';
    if (
      this.taxes().some(
        (tax) => tax.id !== id && tax.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      return 'Ya existe una tasa con ese nombre.';
    if (input.factor === 'rate') {
      if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100)
        return 'La tasa debe estar entre 0 y 100%.';
      if (Math.round(input.rate * 10000) !== input.rate * 10000)
        return 'Usa como máximo 4 decimales.';
    }
    return null;
  }

  private cleanTax(input: TaxInput): TaxInput {
    return {
      name: input.name.trim(),
      factor: input.factor,
      rate: input.factor === 'exempt' ? 0 : Number(input.rate),
      description: input.description.trim(),
    };
  }

  private replaceTax(updated: TaxRate): void {
    this.taxes.update((taxes) => taxes.map((tax) => (tax.id === updated.id ? updated : tax)));
  }

  private readProfile(): OrganizationProfile {
    try {
      const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
      // Se mezcla con la semilla: campos nuevos llegan con su valor por defecto.
      return stored ? { ...SEED_ORGANIZATION, ...stored } : SEED_ORGANIZATION;
    } catch {
      return SEED_ORGANIZATION;
    }
  }

  private readTaxes(): ReadonlyArray<TaxRate> {
    try {
      const stored = JSON.parse(localStorage.getItem(TAXES_KEY) ?? 'null') as TaxRate[] | null;
      if (!Array.isArray(stored) || !stored.length) return SEED_TAXES;
      // Si el almacenamiento perdió la predeterminada, la primera activa toma su lugar.
      if (stored.some((tax) => tax.isDefault && tax.active)) return stored;
      const firstActive = stored.findIndex((tax) => tax.active);
      return firstActive < 0
        ? SEED_TAXES
        : stored.map((tax, index) => ({ ...tax, isDefault: index === firstActive }));
    } catch {
      return SEED_TAXES;
    }
  }

  private persist(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Sin almacenamiento los cambios duran sólo esta sesión.
    }
  }
}
