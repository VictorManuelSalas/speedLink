import { TestBed } from '@angular/core/testing';
import { OperationalStore } from '../../features/operations/operational-store';
import { DEMO_ROUTER_ID, MikrotikStore } from './mikrotik.store';
import { RouterCommands, lastDays, mbpsIn, monthUsage, trafficNow } from './mikrotik.model';

describe('MikrotikStore', () => {
  let store: MikrotikStore;
  let ops: OperationalStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(MikrotikStore);
    ops = TestBed.inject(OperationalStore);
  });

  it('starts connected with a demo router and seeded queues', () => {
    expect(store.connected()).toBe(true);
    expect(store.subscriber('SL-1044')?.routerId).toBe(DEMO_ROUTER_ID);
    // El suspendido llega bloqueado; SL-1061 queda sin cola para la demo de alta.
    expect(store.subscriber('SL-1057')?.blocked).toBe(true);
    expect(store.subscriber('SL-1061')).toBeUndefined();
  });

  it('hides everything when no router is enabled', () => {
    const router = store.router(DEMO_ROUTER_ID)!;
    store.saveRouter({ ...router, enabled: false }, '', 'Test', router.id);
    expect(store.connected()).toBe(false);
    expect(store.subscriber('SL-1044')).toBeUndefined();
  });

  it('takes the plan speed from the active contract before the customer card', () => {
    ops.records.update((records) => ({
      ...records,
      services: [{ id: 'SRV-X', name: 'Internet Premium 50 Mbps', type: 'Internet' }],
      contracts: [{ id: 'CTR-X', clientId: 'SL-1044', status: 'ACTIVE', items: JSON.stringify([{ serviceId: 'SRV-X' }]) }],
    }));
    const plan = store.planFor('SL-1044');
    expect(plan.source).toBe('contract');
    expect(plan.speed).toEqual({ download: 50, upload: 10 });
    // Sin contrato activo, la velocidad de la ficha (10 Mbps).
    expect(store.planFor('SL-1046').source).toBe('customer');
  });

  it('blocks and unblocks, logging the RouterOS commands', () => {
    expect(store.block('SL-1044', 'Falta de pago', '', 'Test').ok).toBe(true);
    expect(store.subscriber('SL-1044')?.blocked).toBe(true);
    expect(store.block('SL-1044', 'Falta de pago', '', 'Test').ok).toBe(false);
    const entry = store.log()[0];
    expect(entry.commands[0]).toContain('/ip firewall address-list add list=morosos');
    expect(entry.status).toBe('simulated');
    expect(store.unblock('SL-1044', 'Test').ok).toBe(true);
    expect(store.log()[0].commands[0]).toContain('address-list remove');
  });

  it('changes speed and detects queues out of sync with the plan', () => {
    const sub = store.subscriber('SL-1044')!;
    expect(store.outOfSync(sub)).toBe(false);
    store.setSpeed('SL-1044', { download: 30, upload: 6 }, false, 'Test', 'Promoción');
    expect(store.outOfSync(store.subscriber('SL-1044')!)).toBe(true);
    expect(store.log()[0].commands[0]).toContain('max-limit=6M/30M');
    expect(store.syncManyToPlan(['SL-1044'], 'Test')).toBe(1);
    expect(store.outOfSync(store.subscriber('SL-1044')!)).toBe(false);
  });

  it('provisions a simple queue validating IP conflicts', () => {
    const speed = { download: 10, upload: 2 };
    const taken = store.subscriber('SL-1044')!.ip;
    const input = { routerId: DEMO_ROUTER_ID, ip: taken, queueName: 'SL-1061 Test', speed, burst: true };
    expect(store.provision('SL-1061', input, 'Test').ok).toBe(false);
    expect(store.provision('SL-1061', { ...input, ip: '10.20.9.9' }, 'Test').ok).toBe(true);
    expect(store.log()[0].commands[0]).toBe(
      RouterCommands.provision({ customerId: 'SL-1061', queueName: 'SL-1061 Test', ip: '10.20.9.9' }, speed, true),
    );
    expect(store.removeQueue('SL-1061', 'Test').ok).toBe(true);
    expect(store.subscriber('SL-1061')).toBeUndefined();
  });

  it('lists overdue customers past the grace days as cutoff candidates', () => {
    const due = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10);
    ops.records.update((records) => ({
      ...records,
      invoices: [{ id: 'INV-X', clientId: 'SL-1044', status: 'OVERDUE', dueDate: due, total: 350 }],
    }));
    expect(store.cutoffCandidates().map((item) => item.sub.customerId)).toContain('SL-1044');
    store.saveRules({ ...store.rules(), graceDays: 30 }, 'Test');
    expect(store.cutoffCandidates().map((item) => item.sub.customerId)).not.toContain('SL-1044');
  });

  it('refuses to remove a router that still has queues', () => {
    expect(store.removeRouter(DEMO_ROUTER_ID).ok).toBe(false);
  });
});

describe('MikroTik ↔ servicios de Internet', () => {
  let store: MikrotikStore;
  let ops: OperationalStore;
  const plan = { id: 'SRV-P20', name: 'Hogar 20 Mbps', type: 'Internet', downloadMbps: 20, uploadMbps: 4 };

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(MikrotikStore);
    ops = TestBed.inject(OperationalStore);
    // SL-1044 tiene contrato activo con el plan de 20 Mbps.
    ops.records.update((records) => ({
      ...records,
      services: [plan, { id: 'SRV-ADD', name: 'Streaming Plus', type: 'Complemento' }],
      contracts: [{ id: 'CTR-1', clientId: 'SL-1044', status: 'ACTIVE', items: JSON.stringify([{ serviceId: 'SRV-P20' }]) }],
    }));
    ops.dataReady.set(true);
    TestBed.tick();
  });

  it('links each Internet service to a profile (adopting one with the same speed)', () => {
    const linked = store.profiles().find((item) => item.serviceId === 'SRV-P20');
    expect(linked).toMatchObject({ id: 'prf-20', name: 'Hogar 20 Mbps', download: 20, upload: 4 });
    expect(store.profiles().some((item) => item.serviceId === 'SRV-ADD')).toBe(false);
  });

  it('creates a profile when a new Internet service is added', () => {
    ops.add('services', { id: 'SRV-P35', name: 'Turbo', type: 'Internet', downloadMbps: 35, uploadMbps: 7 });
    TestBed.tick();
    expect(store.profiles().find((item) => item.serviceId === 'SRV-P35')).toMatchObject({ download: 35, upload: 7, name: 'Turbo' });
    expect(store.log()[0].action).toBe('plan');
  });

  it('pushes a speed change of the plan to the queues that follow it, not to custom ones', () => {
    store.setSpeed('SL-1044', { download: 20, upload: 4 }, true, 'Test');
    ops.update('services', 'SRV-P20', { downloadMbps: 30, uploadMbps: 6 });
    TestBed.tick();
    expect(store.appliedSpeed(store.subscriber('SL-1044')!)).toEqual({ download: 30, upload: 6 });
    expect(store.log()[0].commands[0]).toContain('crm:SL-1044');
    expect(store.log()[0].commands[0]).toContain('max-limit=6M/30M');
    // Con velocidad personalizada, el cambio del plan no la pisa.
    store.setSpeed('SL-1044', { download: 50, upload: 10 }, true, 'Test', 'Promoción');
    ops.update('services', 'SRV-P20', { downloadMbps: 40, uploadMbps: 8 });
    TestBed.tick();
    expect(store.appliedSpeed(store.subscriber('SL-1044')!)).toEqual({ download: 50, upload: 10 });
  });

  it('edits the service when a plan profile is edited from settings', () => {
    const linked = store.profiles().find((item) => item.serviceId === 'SRV-P20')!;
    store.saveProfile({ name: 'Hogar 25', download: 25, upload: 5, burst: true }, linked.id);
    TestBed.tick();
    expect(ops.find('services', 'SRV-P20')).toMatchObject({ name: 'Hogar 25', downloadMbps: 25, uploadMbps: 5 });
    expect(store.profiles().find((item) => item.id === linked.id)).toMatchObject({ download: 25, name: 'Hogar 25' });
    expect(store.removeProfile(linked.id).ok).toBe(false);
  });

  it('removes the profile when the service is deleted, keeping the customers speed', () => {
    ops.records.update((records) => ({ ...records, services: (records['services'] ?? []).filter((s) => s.id !== 'SRV-P20') }));
    TestBed.tick();
    expect(store.profiles().some((item) => item.serviceId === 'SRV-P20')).toBe(false);
    expect(store.subscriber('SL-1044')?.speed).toEqual({ download: 20, upload: 4 });
  });
});

describe('MikroTik metrics', () => {
  it('parses plan speeds and simulates stable usage', () => {
    expect(mbpsIn('Internet Premium 50 Mbps')).toBe(50);
    expect(mbpsIn('1 Gbps')).toBe(1000);
    const now = new Date('2026-09-15T21:00:00');
    const speed = { download: 10, upload: 2 };
    expect(lastDays('SL-1044', speed, 30, {}, now)).toEqual(lastDays('SL-1044', speed, 30, {}, now));
    const month = monthUsage('SL-1044', speed, {}, now).download;
    // Un hogar de 10 Mbps: decenas a cientos de GB al mes, no terabytes.
    expect(month).toBeGreaterThan(20);
    expect(month).toBeLessThan(600);
    expect(trafficNow('SL-1044', speed, true, now).rx).toBe(0);
  });
});
