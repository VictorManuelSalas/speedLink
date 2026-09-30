import { Injectable, computed, effect, signal } from '@angular/core';
import { setLiveSystemUsers } from '../data-access/system-users';
import {
  ADMIN_ROLE_ID,
  allPermissions,
  CrmUser,
  Permission,
  Role,
  SEED_ROLES,
  SEED_USERS,
  UserStatus,
  normalizePermissions,
} from './access.model';

const ROLES_KEY = 'speedlink-access-roles';
const USERS_KEY = 'speedlink-access-users';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type AccessResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

export interface UserInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly roleId: string;
  readonly preferredLanguage: 'es' | 'en';
}

export interface RoleInput {
  readonly name: string;
  readonly description: string;
}

/** Usuario con la contraseña temporal recién generada (sólo se muestra una vez). */
export interface IssuedCredentials {
  readonly user: CrmUser;
  readonly password: string;
}

const ok = <T>(value: T): AccessResult<T> => ({ ok: true, value });
const fail = <T = never>(error: string): AccessResult<T> => ({ ok: false, error });

/**
 * Usuarios y roles del CRM. Todas las reglas de negocio viven aquí y no en las
 * pantallas: nadie se puede quitar el acceso a sí mismo y siempre queda al
 * menos un administrador activo.
 */
@Injectable({ providedIn: 'root' })
export class AccessStore {
  readonly roles = signal<ReadonlyArray<Role>>(this.readRoles());
  readonly users = signal<ReadonlyArray<CrmUser>>(this.read(USERS_KEY, SEED_USERS));

  readonly userCountByRole = computed(() => {
    const counts = new Map<string, number>();
    for (const user of this.users()) counts.set(user.roleId, (counts.get(user.roleId) ?? 0) + 1);
    return counts;
  });

  constructor() {
    effect(() => {
      this.persist(ROLES_KEY, this.roles());
      this.persist(USERS_KEY, this.users());
      // Los lookups de "responsable" en los módulos leen este roster.
      setLiveSystemUsers(
        this.users()
          .filter((user) => user.status !== 'suspended')
          .map((user) => ({
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: this.role(user.roleId)?.name ?? 'Sin rol',
            initials: initialsOf(user.fullName),
          })),
      );
    });
  }

  role(id: string): Role | undefined {
    return this.roles().find((role) => role.id === id);
  }

  user(id: string): CrmUser | undefined {
    return this.users().find((user) => user.id === id);
  }

  permissionsOf(userId: string): ReadonlySet<Permission> {
    const user = this.user(userId);
    if (!user || user.status === 'suspended') return new Set();
    const role = this.role(user.roleId);
    if (!role) return new Set();
    // El administrador tiene todo, incluidos los módulos creados después.
    return new Set(role.system ? allPermissions() : role.permissions);
  }

  can(userId: string, permission: Permission): boolean {
    return this.permissionsOf(userId).has(permission);
  }

  // ---------------------------------------------------------------- Usuarios

  async createUser(input: UserInput): Promise<AccessResult<IssuedCredentials>> {
    const invalid = this.validateUser(input);
    if (invalid) return fail(invalid);
    const now = new Date().toISOString();
    const password = generatePassword();
    const credentials = await hashPassword(password);
    const user: CrmUser = {
      id: `usr-${crypto.randomUUID?.() ?? Date.now()}`,
      ...clean(input),
      status: 'invited',
      createdAt: now,
      invitedAt: now,
      ...credentials,
      temporaryPassword: true,
    };
    this.users.update((users) => [user, ...users]);
    return ok({ user, password });
  }

  updateUser(id: string, input: UserInput, actorId: string): AccessResult<CrmUser> {
    const current = this.user(id);
    if (!current) return fail('El usuario ya no existe.');
    const invalid = this.validateUser(input, id);
    if (invalid) return fail(invalid);
    if (input.roleId !== current.roleId) {
      if (id === actorId) return fail('No puedes cambiar tu propio rol.');
      if (this.isLastActiveAdmin(current))
        return fail('Es el único administrador activo: asigna otro antes de cambiarle el rol.');
    }
    const updated: CrmUser = { ...current, ...clean(input) };
    this.replaceUser(updated);
    return ok(updated);
  }

  suspendUser(id: string, actorId: string): AccessResult {
    const user = this.user(id);
    if (!user) return fail('El usuario ya no existe.');
    if (id === actorId) return fail('No puedes suspender tu propia cuenta.');
    if (this.isLastActiveAdmin(user))
      return fail('Es el único administrador activo: no se puede suspender.');
    this.replaceUser({ ...user, status: 'suspended', suspendedAt: new Date().toISOString() });
    return ok(undefined);
  }

  /** Vuelve a "activo" si ya había entrado alguna vez; si no, sigue invitado. */
  reactivateUser(id: string): AccessResult {
    const user = this.user(id);
    if (!user) return fail('El usuario ya no existe.');
    const status: UserStatus = user.lastLoginAt ? 'active' : 'invited';
    this.replaceUser({ ...user, status, suspendedAt: undefined });
    return ok(undefined);
  }

  deleteUser(id: string, actorId: string): AccessResult {
    const user = this.user(id);
    if (!user) return fail('El usuario ya no existe.');
    if (id === actorId) return fail('No puedes eliminar tu propia cuenta.');
    if (this.isLastActiveAdmin(user))
      return fail('Es el único administrador activo: no se puede eliminar.');
    this.users.update((users) => users.filter((item) => item.id !== id));
    return ok(undefined);
  }

  /**
   * Genera una contraseña temporal nueva. La anterior deja de servir; para una
   * invitación pendiente equivale a reenviarla.
   */
  async resetPassword(id: string): Promise<AccessResult<IssuedCredentials>> {
    const user = this.user(id);
    if (!user) return fail('El usuario ya no existe.');
    if (user.status === 'suspended') return fail('Reactiva al usuario antes de darle acceso.');
    const password = generatePassword();
    const updated: CrmUser = {
      ...user,
      ...(await hashPassword(password)),
      temporaryPassword: true,
      invitedAt: user.status === 'invited' ? new Date().toISOString() : user.invitedAt,
    };
    this.replaceUser(updated);
    return ok({ user: updated, password });
  }

  async changePassword(id: string, current: string, next: string): Promise<AccessResult> {
    const user = this.user(id);
    if (!user?.passwordHash || !user.passwordSalt) return fail('El usuario ya no existe.');
    if ((await hashWith(user.passwordSalt, current)) !== user.passwordHash)
      return fail('La contraseña actual no es correcta.');
    const weak = passwordProblem(next);
    if (weak) return fail(weak);
    this.replaceUser({ ...user, ...(await hashPassword(next)), temporaryPassword: false });
    return ok(undefined);
  }

  /** Para el inicio de sesión: no distingue "no existe" de "contraseña incorrecta". */
  async verifyCredentials(email: string, password: string): Promise<AccessResult<CrmUser>> {
    const user = this.users().find(
      (item) => item.email.toLocaleLowerCase() === email.trim().toLocaleLowerCase(),
    );
    const valid =
      !!user?.passwordHash &&
      !!user.passwordSalt &&
      (await hashWith(user.passwordSalt, password)) === user.passwordHash;
    if (!user || !valid) return fail('El correo o la contraseña no son correctos.');
    if (user.status === 'suspended')
      return fail('Tu cuenta está suspendida. Contacta a un administrador.');
    if (!this.role(user.roleId)) return fail('Tu cuenta no tiene un rol asignado.');
    return ok(user);
  }

  setPreferredLanguage(id: string, language: 'es' | 'en'): void {
    const user = this.user(id);
    if (user && user.preferredLanguage !== language)
      this.replaceUser({ ...user, preferredLanguage: language });
  }

  /** El primer inicio de sesión acepta la invitación. */
  recordLogin(id: string): void {
    const user = this.user(id);
    if (!user) return;
    this.replaceUser({ ...user, status: 'active', lastLoginAt: new Date().toISOString() });
  }

  // ------------------------------------------------------------------ Roles

  createRole(input: RoleInput, copyFrom?: string): AccessResult<Role> {
    const invalid = this.validateRole(input);
    if (invalid) return fail(invalid);
    const source = copyFrom ? this.role(copyFrom) : undefined;
    const now = new Date().toISOString();
    const role: Role = {
      id: `role-${crypto.randomUUID?.() ?? Date.now()}`,
      name: input.name.trim(),
      description: input.description.trim(),
      system: false,
      permissions: source ? (source.system ? allPermissions() : source.permissions) : [],
      createdAt: now,
      updatedAt: now,
    };
    this.roles.update((roles) => [...roles, role]);
    return ok(role);
  }

  updateRole(
    id: string,
    input: RoleInput,
    permissions: Iterable<Permission>,
    actorId: string,
  ): AccessResult<Role> {
    const role = this.role(id);
    if (!role) return fail('El rol ya no existe.');
    if (role.system) return fail('El rol Administrador no se puede modificar.');
    const invalid = this.validateRole(input, id);
    if (invalid) return fail(invalid);
    const normalized = normalizePermissions(permissions);
    // Quien edita su propio rol no puede quitarse la administración de roles.
    const actor = this.user(actorId);
    if (actor?.roleId === id && !normalized.includes('roles.update'))
      return fail('No puedes quitar a tu propio rol el permiso de editar roles.');
    const updated: Role = {
      ...role,
      name: input.name.trim(),
      description: input.description.trim(),
      permissions: normalized,
      updatedAt: new Date().toISOString(),
    };
    this.roles.update((roles) => roles.map((item) => (item.id === id ? updated : item)));
    return ok(updated);
  }

  /** Un rol con usuarios sólo se borra pasando esos usuarios a otro rol. */
  deleteRole(id: string, reassignTo?: string): AccessResult {
    const role = this.role(id);
    if (!role) return fail('El rol ya no existe.');
    if (role.system) return fail('El rol Administrador no se puede eliminar.');
    const assigned = this.userCountByRole().get(id) ?? 0;
    if (assigned) {
      if (!reassignTo || reassignTo === id || !this.role(reassignTo))
        return fail('Elige a qué rol pasan los usuarios de este rol.');
      this.users.update((users) =>
        users.map((user) => (user.roleId === id ? { ...user, roleId: reassignTo } : user)),
      );
    }
    this.roles.update((roles) => roles.filter((item) => item.id !== id));
    return ok(undefined);
  }

  // -------------------------------------------------------------- Internos

  isLastActiveAdmin(user: CrmUser): boolean {
    if (user.roleId !== ADMIN_ROLE_ID || user.status !== 'active') return false;
    return (
      this.users().filter((item) => item.roleId === ADMIN_ROLE_ID && item.status === 'active')
        .length === 1
    );
  }

  private validateUser(input: UserInput, id?: string): string | null {
    if (input.fullName.trim().length < 3) return 'Escribe el nombre completo.';
    const email = input.email.trim().toLocaleLowerCase();
    if (!EMAIL_PATTERN.test(email)) return 'El correo no tiene un formato válido.';
    if (this.users().some((user) => user.id !== id && user.email.toLocaleLowerCase() === email))
      return 'Ya existe un usuario con ese correo.';
    if (!this.role(input.roleId)) return 'Selecciona un rol.';
    return null;
  }

  private validateRole(input: RoleInput, id?: string): string | null {
    const name = input.name.trim();
    if (name.length < 3) return 'El nombre del rol debe tener al menos 3 caracteres.';
    if (
      this.roles().some(
        (role) => role.id !== id && role.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      return 'Ya existe un rol con ese nombre.';
    return null;
  }

  private replaceUser(updated: CrmUser): void {
    this.users.update((users) => users.map((user) => (user.id === updated.id ? updated : user)));
  }

  private readRoles(): ReadonlyArray<Role> {
    const roles = this.read(ROLES_KEY, SEED_ROLES);
    // El administrador siempre existe: si el almacenamiento lo perdió, se repone.
    return roles.some((role) => role.id === ADMIN_ROLE_ID) ? roles : [SEED_ROLES[0], ...roles];
  }

  private read<T>(key: string, fallback: ReadonlyArray<T>): ReadonlyArray<T> {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as T[] | null;
      return Array.isArray(parsed) && parsed.length ? parsed : fallback;
    } catch {
      return fallback;
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

function clean(input: UserInput): UserInput {
  return {
    fullName: input.fullName.trim().replace(/\s+/g, ' '),
    email: input.email.trim().toLocaleLowerCase(),
    phone: input.phone.trim(),
    roleId: input.roleId,
    preferredLanguage: input.preferredLanguage,
  };
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase();
}

/** Qué le falta a una contraseña para ser aceptable, o null si está bien. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
    return 'Usa mayúsculas, minúsculas y números.';
  return null;
}

/** 12 caracteres sin los ambiguos (0/O, 1/l/I), con mayúscula, minúscula, número y símbolo. */
function generatePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*?'];
  const all = sets.join('');
  const random = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
  const chars = sets.map((set) => set[random(set.length)]);
  while (chars.length < 12) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function hashPassword(
  password: string,
): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return { passwordSalt: salt, passwordHash: await hashWith(salt, password) };
}

async function hashWith(salt: string, password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${password}`),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
