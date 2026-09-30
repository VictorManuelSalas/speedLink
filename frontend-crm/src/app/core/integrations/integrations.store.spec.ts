import { TestBed } from '@angular/core/testing';
import { OperationalStore } from '../../features/operations/operational-store';
import { AuditLog } from '../audit/audit-log';
import { AccessStore } from '../auth/access-store';
import { ConnectionsStore } from '../connections/connections-store';
import { InventoryStore } from '../inventory/inventory.store';
import { ClientPortalStore } from '../portal/client-portal.store';
import { IntegrationsStore } from './integrations.store';

describe('Integraciones, inventario, portal y auditoría', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('queues a webhook delivery with the JSON payload when a payment is registered', () => {
    const integrations = TestBed.inject(IntegrationsStore);
    const ops = TestBed.inject(OperationalStore);
    ops.add('payments', { id: 'PAY-T1', clientId: 'SL-1044', amount: 350, method: 'CASH' });
    TestBed.tick();
    const delivery = integrations.deliveries()[0];
    expect(delivery.event).toBe('payment.created');
    expect(delivery.status).toBe('queued');
    expect(delivery.url).toBe('https://erp.speedlink.mx/api/hooks/crm/payments');
    expect(JSON.parse(delivery.payload).data.id).toBe('PAY-T1');
  });

  it('validates custom connections and protects the ones in use', () => {
    const integrations = TestBed.inject(IntegrationsStore);
    const input = { name: 'UISP', baseUrl: 'http://uisp.local', auth: 'bearer' as const, authName: '', headers: [], enabled: true };
    expect(integrations.validateConnection(input).baseUrl).toContain('HTTPS');
    const saved = integrations.saveConnection({ ...input, baseUrl: 'https://uisp.speedlink.mx/api' }, 'tok-123456', 'Test');
    expect(saved.ok && saved.value.secretTail).toBe('3456');
    TestBed.tick();
    expect(localStorage.getItem('speedlink-custom-connections')).toContain('UISP');
    expect(localStorage.getItem('speedlink-custom-connections')).not.toContain('tok-123456');
    expect(integrations.removeConnection('cx-erp').ok).toBe(false);
  });

  it('flags models under their minimum stock', () => {
    const ops = TestBed.inject(OperationalStore);
    ops.records.update((records) => ({
      ...records,
      equipment: [
        { id: 'EQ-A', brand: 'TP-Link', model: 'Archer C6', status: 'AVAILABLE', purchaseCost: 900 },
        { id: 'EQ-B', brand: 'TP-Link', model: 'Archer C6', status: 'ASSIGNED', purchaseCost: 900 },
      ],
    }));
    const inventory = TestBed.inject(InventoryStore);
    const row = inventory.rows().find((item) => item.label === 'TP-Link Archer C6')!;
    // Con el mínimo por omisión (1), una unidad en bodega todavía alcanza.
    expect(row).toMatchObject({ available: 1, assigned: 1, low: false, stockValue: 900 });
    inventory.setMinimum(row.key, 2, row.label);
    expect(inventory.rows().find((item) => item.key === row.key)?.low).toBe(true);
  });

  it('lets the portal customer pay an invoice online in sandbox mode', () => {
    const ops = TestBed.inject(OperationalStore);
    ops.records.update((records) => ({
      ...records,
      invoices: [{ id: 'INV-P1', folio: 'FAC-P1', clientId: 'SL-1044', total: 300, status: 'PENDING', issueDate: '2026-09-01', dueDate: '2026-09-10' }],
      payments: [],
    }));
    const portal = TestBed.inject(ClientPortalStore);
    expect(portal.onlinePayments()).toBeNull();
    TestBed.inject(ConnectionsStore).savePayments(
      { enabled: true, provider: 'conekta', mode: 'sandbox', publicKey: 'key_public_1234567' },
      'key_private_7654321',
      'Test',
    );
    expect(portal.onlinePayments()?.sandbox).toBe(true);
    expect(portal.payInvoice('INV-P1').ok).toBe(true);
    expect(ops.find('invoices', 'INV-P1')?.['status']).toBe('PAID');
    expect(portal.invoices()[0].status).toBe('Pagada');
    expect(portal.payInvoice('INV-P1').ok).toBe(false);
  });

  it('audits role changes with the permissions added and removed', async () => {
    const access = TestBed.inject(AccessStore);
    const role = access.roles().find((item) => item.id === 'role-support')!;
    access.updateRole(role.id, { name: role.name, description: role.description }, [...role.permissions, 'invoices.read'], 'usr-andrea-torres');
    const entry = TestBed.inject(AuditLog).entries()[0];
    expect(entry.action).toBe('Permisos modificados');
    expect(entry.detail).toContain('invoices.read');
  });
});
