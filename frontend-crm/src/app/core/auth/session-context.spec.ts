import { TestBed } from '@angular/core/testing';
import { AccessStore } from './access-store';
import { SessionContext } from './session-context';

const EMAIL = 'andrea.torres@speedlink.mx';
const PASSWORD = 'SpeedLink2026!';

describe('SessionContext', () => {
  let session: SessionContext;
  let access: AccessStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    session = TestBed.inject(SessionContext);
    access = TestBed.inject(AccessStore);
  });

  it('starts without an authenticated user', () => {
    expect(session.isAuthenticated()).toBe(false);
  });

  it('rejects invalid credentials', async () => {
    expect((await session.login(EMAIL, 'incorrecta', true)).success).toBe(false);
    expect(session.isAuthenticated()).toBe(false);
  });

  it('creates and persists a valid session', async () => {
    expect((await session.login(EMAIL, PASSWORD, true)).success).toBe(true);
    expect(session.isAuthenticated()).toBe(true);
    expect(session.user()?.isAdmin).toBe(true);
    expect(localStorage.getItem('speedlink-session')).toContain('usr-andrea-torres');
  });

  it('removes the session on logout', async () => {
    await session.login(EMAIL, PASSWORD, false);
    session.logout();
    expect(session.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('speedlink-session')).toBeNull();
    expect(localStorage.getItem('speedlink-session')).toBeNull();
  });

  it('lets an invited user in with the temporary password and accepts the invitation', async () => {
    const created = await access.createUser({
      fullName: 'Paola Ríos',
      email: 'paola.rios@speedlink.mx',
      phone: '',
      roleId: 'role-support',
      preferredLanguage: 'es',
    });
    if (!created.ok) throw new Error(created.error);
    expect((await session.login('paola.rios@speedlink.mx', created.value.password, false)).success).toBe(true);
    expect(access.user(created.value.user.id)?.status).toBe('active');
    expect(session.hasPermission('tickets.read')).toBe(true);
    expect(session.hasPermission('users.read')).toBe(false);
    expect(session.homeRoute()).toBe('/dashboard');
  });

  it('drops the session when the account is suspended', async () => {
    const created = await access.createUser({
      fullName: 'Paola Ríos',
      email: 'paola.rios@speedlink.mx',
      phone: '',
      roleId: 'role-support',
      preferredLanguage: 'es',
    });
    if (!created.ok) throw new Error(created.error);
    await session.login('paola.rios@speedlink.mx', created.value.password, false);
    access.suspendUser(created.value.user.id, 'usr-andrea-torres');
    expect(session.isAuthenticated()).toBe(false);
    expect((await session.login('paola.rios@speedlink.mx', created.value.password, false)).message).toContain('suspendida');
  });
});

describe('AccessStore rules', () => {
  let access: AccessStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    access = TestBed.inject(AccessStore);
  });

  it('protects the last active administrator', () => {
    expect(access.suspendUser('usr-andrea-torres', 'usr-carlos-madero').ok).toBe(false);
    expect(access.deleteUser('usr-andrea-torres', 'usr-carlos-madero').ok).toBe(false);
  });

  it('does not let users suspend or delete themselves', () => {
    expect(access.suspendUser('usr-carlos-madero', 'usr-carlos-madero').ok).toBe(false);
    expect(access.deleteUser('usr-carlos-madero', 'usr-carlos-madero').ok).toBe(false);
  });

  it('rejects duplicated emails', async () => {
    const result = await access.createUser({
      fullName: 'Otra Andrea',
      email: 'ANDREA.TORRES@speedlink.mx',
      phone: '',
      roleId: 'role-sales',
      preferredLanguage: 'es',
    });
    expect(result.ok).toBe(false);
  });

  it('adds "read" when another action is granted', () => {
    const result = access.updateRole(
      'role-sales',
      { name: 'Ventas', description: '' },
      ['invoices.export'],
      'usr-andrea-torres',
    );
    expect(result.ok && result.value.permissions).toEqual(['invoices.read', 'invoices.export']);
  });

  it('requires reassigning users before deleting a role', () => {
    expect(access.deleteRole('role-sales').ok).toBe(false);
    expect(access.deleteRole('role-sales', 'role-support').ok).toBe(true);
    expect(access.user('usr-carlos-madero')?.roleId).toBe('role-support');
  });

  it('never modifies or deletes the administrator role', () => {
    expect(access.deleteRole('role-admin', 'role-sales').ok).toBe(false);
    expect(
      access.updateRole('role-admin', { name: 'Admin', description: '' }, [], 'usr-andrea-torres').ok,
    ).toBe(false);
  });
});
