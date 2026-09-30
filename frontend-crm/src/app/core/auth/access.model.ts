import { customModules } from '../modules/custom-modules.model';

/**
 * Modelo de acceso: qué módulos existen, qué acciones admite cada uno y los
 * roles que agrupan esos permisos. Un permiso es `modulo.accion`
 * (p. ej. `invoices.delete`).
 */

export type AccessAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  // Permisos especiales de Equipamiento: revelar contraseñas del equipo o del WiFi del cliente.
  | 'credentials'
  | 'wifi';

export type AccessModuleKey =
  | 'dashboard'
  | 'customers'
  | 'leads'
  | 'services'
  | 'equipment'
  | 'assignments'
  | 'contracts'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'calendar'
  | 'tickets'
  | 'settings'
  | 'users'
  | 'roles'
  // Módulos creados en Ajustes > Módulos.
  | `cm_${string}`;

export type Permission = `${AccessModuleKey}.${AccessAction}`;

export interface AccessModule {
  readonly key: AccessModuleKey;
  readonly label: string;
  readonly group: string;
  readonly description: string;
  readonly actions: ReadonlyArray<AccessAction>;
}

export const ACTION_LABELS: Readonly<Record<AccessAction, string>> = {
  read: 'Ver',
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
  export: 'Exportar',
  credentials: 'Ver credenciales del equipo',
  wifi: 'Ver WiFi del cliente',
};

/** Acciones fuera de la matriz estándar; sólo algunos módulos las tienen. */
export const SPECIAL_ACTIONS: ReadonlyArray<AccessAction> = ['credentials', 'wifi'];

export const SPECIAL_ACTION_HINTS: Readonly<Partial<Record<AccessAction, string>>> = {
  credentials: 'Revelar usuario y contraseña de administración de los equipos.',
  wifi: 'Revelar la contraseña del WiFi que usa el cliente.',
};

export const ACCESS_ACTIONS: ReadonlyArray<AccessAction> = [
  'read',
  'create',
  'update',
  'delete',
  'export',
];

const CRUD_EXPORT: ReadonlyArray<AccessAction> = ACCESS_ACTIONS;
const CRUD: ReadonlyArray<AccessAction> = ['read', 'create', 'update', 'delete'];

export const ACCESS_MODULES: ReadonlyArray<AccessModule> = [
  { key: 'dashboard', label: 'Dashboard', group: 'General', description: 'Indicadores y resumen de la operación.', actions: ['read'] },
  { key: 'customers', label: 'Clientes', group: 'Comercial', description: 'Fichas de cliente, notas, correos y archivos.', actions: CRUD_EXPORT },
  { key: 'leads', label: 'Leads', group: 'Comercial', description: 'Prospectos y su conversión a cliente.', actions: CRUD_EXPORT },
  { key: 'contracts', label: 'Contratos', group: 'Comercial', description: 'Contratos de servicio y su envío.', actions: CRUD_EXPORT },
  { key: 'services', label: 'Servicios', group: 'Red', description: 'Catálogo de planes y servicios.', actions: CRUD_EXPORT },
  { key: 'equipment', label: 'Equipamiento', group: 'Red', description: 'Inventario de equipos, acceso y WiFi.', actions: [...CRUD_EXPORT, 'credentials', 'wifi'] },
  { key: 'assignments', label: 'Asignaciones', group: 'Red', description: 'Equipos asignados a clientes.', actions: CRUD_EXPORT },
  { key: 'invoices', label: 'Facturas', group: 'Finanzas', description: 'Facturación y notificaciones de cobro.', actions: CRUD_EXPORT },
  { key: 'payments', label: 'Pagos', group: 'Finanzas', description: 'Registro de pagos y recibos.', actions: CRUD_EXPORT },
  { key: 'expenses', label: 'Gastos', group: 'Finanzas', description: 'Gastos operativos.', actions: CRUD_EXPORT },
  { key: 'calendar', label: 'Calendario', group: 'Operación', description: 'Eventos, instalaciones y visitas.', actions: CRUD },
  { key: 'tickets', label: 'Tickets', group: 'Operación', description: 'Soporte y seguimiento de incidencias.', actions: CRUD_EXPORT },
  { key: 'settings', label: 'Centro de configuración', group: 'Administración', description: 'Organización, canales, plantillas y portal.', actions: ['read', 'update'] },
  { key: 'users', label: 'Usuarios', group: 'Administración', description: 'Alta, suspensión y contraseñas de usuarios.', actions: CRUD },
  { key: 'roles', label: 'Roles y permisos', group: 'Administración', description: 'Definición de roles y su acceso.', actions: CRUD },
];

/** Permisos de los módulos nativos (semilla de roles). */
export const ALL_PERMISSIONS: ReadonlyArray<Permission> = ACCESS_MODULES.flatMap((module) =>
  module.actions.map((action) => `${module.key}.${action}` as Permission),
);

/**
 * Módulos con control de acceso, incluidos los personalizados. Lee la vista
 * viva de módulos, así que dentro de un `computed` se actualiza al crear uno.
 */
export function accessModules(): ReadonlyArray<AccessModule> {
  return [
    ...ACCESS_MODULES,
    ...customModules().map((module) => ({
      key: module.key,
      label: module.plural,
      group: 'Personalizados',
      description: module.description || 'Módulo personalizado.',
      actions: CRUD_EXPORT,
    })),
  ];
}

export function allPermissions(): ReadonlyArray<Permission> {
  return accessModules().flatMap((module) =>
    module.actions.map((action) => `${module.key}.${action}` as Permission),
  );
}

export function permissionOf(module: AccessModuleKey, action: AccessAction): Permission {
  return `${module}.${action}`;
}

/**
 * Crear, editar, eliminar o exportar sin poder ver el módulo no tiene sentido:
 * cualquier acción arrastra `read`, y quitar `read` quita todo lo demás.
 */
export function normalizePermissions(permissions: Iterable<Permission>): Permission[] {
  const set = new Set(permissions);
  for (const module of accessModules()) {
    const hasOther = module.actions.some(
      (action) => action !== 'read' && set.has(permissionOf(module.key, action)),
    );
    if (hasOther) set.add(permissionOf(module.key, 'read'));
  }
  return allPermissions().filter((permission) => set.has(permission));
}

export interface Role {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Rol del sistema: tiene todos los permisos y no se edita ni elimina. */
  readonly system: boolean;
  readonly permissions: ReadonlyArray<Permission>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type UserStatus = 'active' | 'invited' | 'suspended';

export interface CrmUser {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly roleId: string;
  readonly status: UserStatus;
  readonly preferredLanguage: 'es' | 'en';
  readonly createdAt: string;
  readonly invitedAt?: string;
  readonly lastLoginAt?: string;
  readonly suspendedAt?: string;
  /** SHA-256 de `salt:contraseña`; sin él, el usuario no puede iniciar sesión. */
  readonly passwordHash?: string;
  readonly passwordSalt?: string;
  /** La contraseña es temporal: se generó al invitar o al restablecerla. */
  readonly temporaryPassword?: boolean;
}

export const ADMIN_ROLE_ID = 'role-admin';

const read = (...modules: AccessModuleKey[]) => modules.map((m) => permissionOf(m, 'read'));
const all = (module: AccessModuleKey) =>
  ACCESS_MODULES.find((m) => m.key === module)!.actions.map((a) => permissionOf(module, a));
const actions = (module: AccessModuleKey, ...list: AccessAction[]) =>
  list.map((a) => permissionOf(module, a));

const SEED_DATE = '2026-01-12T09:30:00-06:00';

export const SEED_ROLES: ReadonlyArray<Role> = [
  {
    id: ADMIN_ROLE_ID,
    name: 'Administrador',
    description: 'Acceso total al CRM, incluida la administración de usuarios y roles.',
    system: true,
    permissions: ALL_PERMISSIONS,
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
  },
  {
    id: 'role-sales',
    name: 'Ventas',
    description: 'Prospección, clientes y contratos.',
    system: false,
    permissions: normalizePermissions([
      ...read('dashboard', 'services'),
      ...all('leads'),
      ...actions('customers', 'create', 'update', 'export'),
      ...actions('contracts', 'create', 'update', 'export'),
      ...actions('calendar', 'create', 'update'),
      ...actions('tickets', 'create'),
    ]),
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
  },
  {
    id: 'role-operations',
    name: 'Operaciones',
    description: 'Red, inventario, asignaciones e instalaciones.',
    system: false,
    permissions: normalizePermissions([
      ...read('dashboard'),
      ...actions('customers', 'update'),
      ...all('services'),
      ...all('equipment'),
      ...all('assignments'),
      ...all('calendar'),
      ...actions('tickets', 'create', 'update'),
    ]),
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
  },
  {
    id: 'role-support',
    name: 'Soporte',
    description: 'Atención de tickets y seguimiento a clientes.',
    system: false,
    permissions: normalizePermissions([
      ...read('dashboard', 'equipment', 'assignments'),
      ...actions('customers', 'update'),
      // Soporte ayuda con el WiFi del cliente, pero no administra los equipos.
      ...actions('equipment', 'wifi'),
      ...actions('tickets', 'create', 'update', 'export'),
      ...actions('calendar', 'create', 'update'),
    ]),
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
  },
  {
    id: 'role-field',
    name: 'Técnico de campo',
    description: 'Instalaciones y visitas en sitio.',
    system: false,
    permissions: normalizePermissions([
      ...read('customers'),
      ...actions('assignments', 'update'),
      ...actions('equipment', 'update', 'credentials', 'wifi'),
      ...actions('calendar', 'update'),
      ...actions('tickets', 'update'),
    ]),
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
  },
  {
    id: 'role-billing',
    name: 'Cobranza',
    description: 'Facturación, pagos y gastos.',
    system: false,
    permissions: normalizePermissions([
      ...read('dashboard', 'contracts'),
      ...actions('customers', 'export'),
      ...all('invoices'),
      ...all('payments'),
      ...actions('expenses', 'create', 'update', 'export'),
    ]),
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
  },
];

/** Contraseña demo de Andrea: `SpeedLink2026!` (ver página de acceso). */
const ANDREA_SALT = 'sl-seed-andrea';
const ANDREA_HASH = '13f2b636b63226fb34ba7ef1046204311509128a7824902c38acefca0a43f8d8';

const seedUser = (
  id: string,
  fullName: string,
  email: string,
  roleId: string,
  extra: Partial<CrmUser> = {},
): CrmUser => ({
  id,
  fullName,
  email,
  phone: '',
  roleId,
  status: 'active',
  preferredLanguage: 'es',
  createdAt: SEED_DATE,
  ...extra,
});

/** Mismos ids que el roster original: los registros ya los referencian. */
export const SEED_USERS: ReadonlyArray<CrmUser> = [
  seedUser('usr-andrea-torres', 'Andrea Torres', 'andrea.torres@speedlink.mx', ADMIN_ROLE_ID, {
    phone: '+52 55 4100 2201',
    passwordHash: ANDREA_HASH,
    passwordSalt: ANDREA_SALT,
    lastLoginAt: '2026-07-18T15:28:00-06:00',
  }),
  seedUser('usr-carlos-madero', 'Carlos Madero', 'carlos.madero@speedlink.mx', 'role-sales', {
    lastLoginAt: '2026-07-17T18:10:00-06:00',
  }),
  seedUser('usr-carlos-mendoza', 'Carlos Mendoza', 'carlos.mendoza@speedlink.mx', 'role-operations', {
    lastLoginAt: '2026-07-18T08:02:00-06:00',
  }),
  seedUser('usr-ana-torres', 'Ana Torres', 'ana.torres@speedlink.mx', 'role-support', {
    lastLoginAt: '2026-07-16T12:45:00-06:00',
  }),
  seedUser('usr-mariana-silva', 'Mariana Silva', 'mariana.silva@speedlink.mx', 'role-support', {
    status: 'invited',
    invitedAt: '2026-07-16T10:00:00-06:00',
  }),
  seedUser('usr-luis-ramirez', 'Luis Ramírez', 'luis.ramirez@speedlink.mx', 'role-field', {
    lastLoginAt: '2026-07-15T07:30:00-06:00',
  }),
  seedUser('usr-sofia-guzman', 'Sofía Guzmán', 'sofia.guzman@speedlink.mx', 'role-sales', {
    lastLoginAt: '2026-07-18T11:20:00-06:00',
  }),
  seedUser('usr-jorge-vega', 'Jorge Vega', 'jorge.vega@speedlink.mx', 'role-billing', {
    status: 'suspended',
    suspendedAt: '2026-06-30T17:00:00-06:00',
    lastLoginAt: '2026-06-28T09:15:00-06:00',
  }),
];
