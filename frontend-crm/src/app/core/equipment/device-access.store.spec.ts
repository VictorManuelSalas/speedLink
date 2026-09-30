import { TestBed } from '@angular/core/testing';
import { OperationalStore } from '../../features/operations/operational-store';
import { SEED_ROLES } from '../auth/access.model';
import { CredentialVault } from './credential-vault';
import { isValidIpv4, modelKeyOf, ssidProblem, wifiPasswordProblem } from './device-access.model';
import { DeviceAccessStore } from './device-access.store';

describe('Device access rules', () => {
  it('validates IPv4, SSID length in bytes and WPA passwords', () => {
    expect(isValidIpv4('10.20.30.40')).toBe(true);
    expect(isValidIpv4('10.20.30.256')).toBe(false);
    expect(isValidIpv4('10.20.030.4')).toBe(false);
    expect(ssidProblem('a'.repeat(32))).toBeNull();
    expect(ssidProblem('ñ'.repeat(17))).not.toBeNull(); // 34 bytes
    expect(wifiPasswordProblem('corta')).not.toBeNull();
    expect(wifiPasswordProblem('12345678')).not.toBeNull();
    expect(wifiPasswordProblem('Lopez-Casa-2026')).toBeNull();
  });

  it('groups units of the same model for factory values', () => {
    expect(modelKeyOf({ brand: 'TP-Link · Archer C6' })).toBe('tp-link archer c6');
    expect(modelKeyOf({ brand: 'TP-Link', model: 'TP-Link Archer C6' })).toBe('tp-link archer c6');
    expect(modelKeyOf({ brand: 'MikroTik', model: 'cAP ac' })).toBe('mikrotik cap ac');
  });

  it('grants credential permissions only to the roles that need them', () => {
    const role = (id: string) => SEED_ROLES.find((r) => r.id === id)!.permissions;
    expect(role('role-operations')).toContain('equipment.credentials');
    expect(role('role-field')).toContain('equipment.credentials');
    expect(role('role-support')).toContain('equipment.wifi');
    expect(role('role-support')).not.toContain('equipment.credentials');
    expect(role('role-sales')).not.toContain('equipment.wifi');
  });
});

describe('DeviceAccessStore', () => {
  let store: DeviceAccessStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(DeviceAccessStore);
  });

  it('rejects a management IP already used by another unit', () => {
    const input = { managementIp: '10.0.0.5', managementPort: 80, username: 'admin', firmware: '' };
    expect(store.saveAdmin('EQ-1', input, 'Test').ok).toBe(true);
    expect(store.saveAdmin('EQ-2', input, 'Test').ok).toBe(false);
    expect(store.saveAdmin('EQ-1', input, 'Test').ok).toBe(true);
  });

  it('flags credentials and WiFi when the assignment is returned', () => {
    const operations = TestBed.inject(OperationalStore);
    const equipmentId = 'EQ-TEST';
    const assignment = { id: 'ASG-TEST', status: 'ACTIVE', equipmentId };
    operations.add('assignments', assignment);
    store.saveNetwork(equipmentId, { ssid: 'Casa', band: '2.4', security: 'WPA2', enabled: true }, 'Test');
    operations.update('assignments', assignment.id, { status: 'RETURNED' });
    expect(store.access(equipmentId).credentialsNeedRotation).toBe(true);
    expect(store.access(equipmentId).wifiNeedsReset).toBe(true);
  });

  it('never keeps passwords in the browser', async () => {
    const vault = TestBed.inject(CredentialVault);
    expect(vault.available).toBe(false);
    expect((await vault.store({ equipmentId: 'EQ-1', kind: 'admin' }, 'secreto')).ok).toBe(false);
    expect(JSON.stringify(localStorage)).not.toContain('secreto');
  });
});
