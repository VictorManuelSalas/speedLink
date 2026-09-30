import { TestBed } from '@angular/core/testing';
import { ConnectionsStore } from './connections-store';
import { googleMapsApiKey, whatsappLink, whatsappNumber } from './connections.model';

describe('ConnectionsStore', () => {
  let store: ConnectionsStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ConnectionsStore);
  });

  it('adds the country code to 10-digit phones for wa.me', () => {
    expect(whatsappNumber('871 508 4696')).toBe('528715084696');
    expect(whatsappNumber('+52 1 871 508 4696')).toBe('5218715084696');
    expect(whatsappLink('8715084696', 'Hola')).toBe('https://wa.me/528715084696?text=Hola');
    expect(store.saveWhatsapp('1', 'Test').ok).toBe(true);
    TestBed.tick();
    expect(whatsappNumber('2125550100')).toBe('12125550100');
    expect(store.saveWhatsapp('+52', 'Test').ok).toBe(false);
  });

  it('validates and overrides the Google Maps key, falling back to the deployed one', () => {
    expect(store.saveMapsKey('abc', 'Test').ok).toBe(false);
    const key = 'AIza' + 'x'.repeat(35);
    expect(store.saveMapsKey(key, 'Test').ok).toBe(true);
    TestBed.tick();
    expect(googleMapsApiKey()).toBe(key);
    store.saveMapsKey('', 'Test');
    TestBed.tick();
    expect(googleMapsApiKey()).toBe(store.deployedMapsKey);
  });

  it('never stores the private key, only its last 4 characters', () => {
    const input = { enabled: true, provider: 'stripe' as const, mode: 'sandbox' as const, publicKey: 'pk_live_1234567890' };
    expect(store.savePayments(input, 'sk_test_abcdefgh1234', 'Test').ok).toBe(false);
    expect(store.savePayments({ ...input, publicKey: 'pk_test_1234567890' }, 'sk_test_abcdefgh1234', 'Test').ok).toBe(true);
    TestBed.tick();
    expect(store.state().payments.secretTail).toBe('1234');
    expect(localStorage.getItem('speedlink-connections')).not.toContain('sk_test_abcdefgh');
    // Sin servidor queda configurada pero esperando.
    expect(store.statuses().payments).toBe('pending-server');
    store.disconnect('payments', 'Test');
    expect(store.state().payments).toMatchObject({ enabled: false, secretTail: '' });
  });

  it('requires the provider user and secret to enable CFDI stamping', () => {
    const input = { enabled: true, provider: 'facturama' as const, mode: 'sandbox' as const, username: '' };
    expect(store.saveCfdi(input, '', 'Test').ok).toBe(false);
    expect(store.saveCfdi({ ...input, enabled: false }, '', 'Test').ok).toBe(true);
    expect(store.statuses().cfdi).toBe('disabled');
  });
});
