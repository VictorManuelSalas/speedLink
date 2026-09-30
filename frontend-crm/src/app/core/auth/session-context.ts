import { AuditLog, setAuditActor } from '../audit/audit-log';
import { Injectable, effect, computed, inject, signal } from '@angular/core';
import { AccessStore } from './access-store';
import { AccessModuleKey, Permission } from './access.model';

export type { Permission } from './access.model';

export interface SessionUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  permissions: ReadonlySet<Permission>;
  preferredLanguage: 'es' | 'en';
  /** Entró con una contraseña temporal: conviene pedirle que la cambie. */
  temporaryPassword: boolean;
}

export interface LoginResult {
  success: boolean;
  message?: string;
}

interface StoredSession {
  userId: string;
  organizationId: string;
}

const SESSION_KEY = 'speedlink-session';
const ORGANIZATION_ID = 'speedlink-mx-01';

/** Orden de preferencia para la pantalla de inicio según los permisos. */
const HOME_ROUTES: ReadonlyArray<[AccessModuleKey, string]> = [
  ['dashboard', '/dashboard'],
  ['customers', '/customers'],
  ['tickets', '/tickets'],
  ['leads', '/leads'],
  ['calendar', '/calendar'],
  ['assignments', '/assignments'],
  ['equipment', '/equipment'],
  ['services', '/services'],
  ['contracts', '/contracts'],
  ['invoices', '/invoices'],
  ['payments', '/payments'],
  ['expenses', '/expenses'],
  ['settings', '/settings'],
];

/**
 * Sesión del usuario. Nombre, rol y permisos se leen en vivo de AccessStore:
 * si un administrador cambia el rol o suspende la cuenta, aplica sin volver a
 * iniciar sesión (una cuenta suspendida o eliminada deja de estar autenticada).
 */
@Injectable({ providedIn: 'root' })
export class SessionContext {
  private readonly access = inject(AccessStore);
  private readonly audit = inject(AuditLog);
  private readonly session = signal<StoredSession | null>(this.restoreSession());

  private readonly auditActor = effect(() => setAuditActor(this.user()?.name));
  readonly user = computed<SessionUser | null>(() => {
    const session = this.session();
    if (!session) return null;
    const user = this.access.user(session.userId);
    if (!user || user.status === 'suspended') return null;
    const role = this.access.role(user.roleId);
    return {
      id: user.id,
      organizationId: session.organizationId,
      name: user.fullName,
      email: user.email,
      roleId: user.roleId,
      roleName: role?.name ?? 'Sin rol',
      isAdmin: !!role?.system,
      permissions: this.access.permissionsOf(user.id),
      preferredLanguage: user.preferredLanguage,
      temporaryPassword: !!user.temporaryPassword,
    };
  });

  isAuthenticated(): boolean {
    return this.user() !== null;
  }

  hasPermission(permission: Permission): boolean {
    return this.user()?.permissions.has(permission) ?? false;
  }

  /** Primera pantalla a la que el usuario tiene acceso. */
  homeRoute(): string {
    const match = HOME_ROUTES.find(([module]) => this.hasPermission(`${module}.read`));
    return match?.[1] ?? '/forbidden';
  }

  async login(email: string, password: string, remember: boolean): Promise<LoginResult> {
    const result = await this.access.verifyCredentials(email, password);
    if (!result.ok) {
      this.audit.record('Acceso', 'Intento de inicio fallido', email.trim().toLocaleLowerCase(), result.error, 'warning', 'Desconocido');
      return { success: false, message: result.error };
    }
    this.access.recordLogin(result.value.id);
    const session: StoredSession = { userId: result.value.id, organizationId: ORGANIZATION_ID };
    this.session.set(session);
    this.persist(session, remember);
    this.audit.record('Acceso', 'Inicio de sesión', result.value.email, remember ? 'Recordar sesión en este equipo' : '', 'info', result.value.fullName);
    return { success: true };
  }

  logout(): void {
    const user = this.user();
    if (user) this.audit.record('Acceso', 'Cierre de sesión', user.email, '', 'info', user.name);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    this.session.set(null);
  }

  private persist(session: StoredSession, remember: boolean): void {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
  }

  private restoreSession(): StoredSession | null {
    const serialized = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    if (!serialized) return null;
    try {
      const stored = JSON.parse(serialized) as Partial<StoredSession> & { id?: string };
      // Sesiones guardadas por la versión anterior traían el usuario completo.
      const userId = stored.userId ?? stored.id;
      if (!userId) throw new Error();
      return { userId, organizationId: stored.organizationId ?? ORGANIZATION_ID };
    } catch {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
  }
}
