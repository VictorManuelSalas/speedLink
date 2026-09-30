import { TestBed } from '@angular/core/testing';
import { ClientPortalStore } from '../portal/client-portal.store';
import { ChannelsStore, smsSegments } from './channels-store';

describe('smsSegments', () => {
  it('uses GSM-7 (160) for plain text and Unicode (70) with accents or emoji', () => {
    expect(smsSegments('Hola, tu pago fue recibido.')).toMatchObject({ encoding: 'GSM-7', segments: 1 });
    expect(smsSegments('a'.repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
    expect(smsSegments('Recibimos tu pago, ¡gracias! Tu línea está activa.').encoding).toBe('Unicode');
    expect(smsSegments('á'.repeat(71))).toMatchObject({ segments: 2, perSegment: 67 });
  });
});

describe('ChannelsStore', () => {
  let store: ChannelsStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ChannelsStore);
  });

  it('starts with a ready SMTP and a disabled SMS', () => {
    expect(store.smtpStatus()).toBe('ready');
    expect(store.smsStatus()).toBe('disabled');
  });

  it('refuses to enable SMS without provider data but saves it disabled', () => {
    const sms = { ...store.sms(), enabled: true };
    expect(store.saveSms(sms, '', 'Test').ok).toBe(false);
    expect(store.saveSms({ ...sms, enabled: false }, '', 'Test').ok).toBe(true);
    const ready = { ...sms, accountId: 'AC123456', sender: '+5215512345678' };
    expect(store.saveSms(ready, 'token-123', 'Test').ok).toBe(true);
    expect(store.smsStatus()).toBe('ready');
  });

  it('warns when the port does not match the security mode', () => {
    expect(store.smtpWarnings({ ...store.smtp(), security: 'ssl', port: 587 }).length).toBe(1);
  });

  it('handles quiet hours that cross midnight', () => {
    const config = { quietHours: true, quietStart: '21:00', quietEnd: '08:00' };
    expect(store.inQuietHours('23:30', config)).toBe(true);
    expect(store.inQuietHours('07:59', config)).toBe(true);
    expect(store.inQuietHours('12:00', config)).toBe(false);
  });
});

describe('ClientPortalStore config', () => {
  let portal: ClientPortalStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    portal = TestBed.inject(ClientPortalStore);
  });

  it('keeps the previous slug as a redirect when the address changes', () => {
    expect(portal.saveConfig({ ...portal.config(), slug: 'mi-speedlink' }).ok).toBe(true);
    expect(portal.resolveSlug('mi-speedlink')).toBe('current');
    expect(portal.resolveSlug('speedlink')).toBe('alias');
    expect(portal.resolveSlug('otro')).toBe('unknown');
  });

  it('rejects reserved or malformed slugs', () => {
    expect(portal.saveConfig({ ...portal.config(), slug: 'admin' }).ok).toBe(false);
    expect(portal.saveConfig({ ...portal.config(), slug: '-mal-' }).ok).toBe(false);
  });

  it('turns off actions whose content is hidden', () => {
    portal.saveConfig({ ...portal.config(), showTickets: false, allowTicketCreation: true });
    expect(portal.config().allowTicketCreation).toBe(false);
  });
});
