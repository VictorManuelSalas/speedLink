import { TestBed } from '@angular/core/testing';
import { OrganizationStore } from './organization-store';
import { ORGANIZATION, computeTax, isValidRfc } from './organization.model';

describe('Organization model', () => {
  it('validates RFC format for companies and individuals', () => {
    expect(isValidRfc('STE200115AB3')).toBe(true);
    expect(isValidRfc('GODE561231GR8')).toBe(true);
    expect(isValidRfc('STE201315AB3')).toBe(false); // mes 13
    expect(isValidRfc('ST200115AB3')).toBe(false);
  });

  it('computes tax rounded to cents and treats exempt as no tax', () => {
    expect(computeTax(349.99, { factor: 'rate', rate: 16 })).toEqual({
      subtotal: 349.99,
      taxAmount: 56,
      total: 405.99,
    });
    expect(computeTax(500, { factor: 'exempt', rate: 16 }).taxAmount).toBe(0);
  });
});

describe('OrganizationStore', () => {
  let store: OrganizationStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(OrganizationStore);
  });

  it('keeps exactly one default tax and protects it', () => {
    const current = store.defaultTax()!;
    expect(store.setActive(current.id, false).ok).toBe(false);
    expect(store.deleteTax(current.id, 0).ok).toBe(false);
    expect(store.setDefault('tax-iva-8').ok).toBe(true);
    expect(store.taxes().filter((tax) => tax.isDefault).map((tax) => tax.id)).toEqual(['tax-iva-8']);
  });

  it('does not delete a tax used by invoices', () => {
    expect(store.deleteTax('tax-iva-8', 3).ok).toBe(false);
    expect(store.deleteTax('tax-iva-8', 0).ok).toBe(true);
  });

  it('cannot make an inactive tax the default', () => {
    expect(store.setDefault('tax-exempt').ok).toBe(false);
  });

  it('advances the invoice series when a folio is used', () => {
    expect(store.consumeInvoiceFolio()).toBe('FAC-000001');
    expect(store.previewInvoiceFolio()).toBe('FAC-000002');
  });

  it('rejects an invalid profile and publishes a valid one to documents', () => {
    const base = { ...store.profile() };
    expect(store.updateProfile({ ...base, rfc: 'XXX' }, 'Test').ok).toBe(false);
    expect(store.updateProfile({ ...base, tradeName: 'Nueva Marca' }, 'Test').ok).toBe(true);
    TestBed.tick();
    expect(ORGANIZATION.name).toBe('Nueva Marca');
  });
});
