/**
 * System Users
 * Roster único de las personas con acceso al CRM.
 * Se usa para los lookups de responsable/owner en los módulos operativos.
 */

import { signal } from '@angular/core';
import { PicklistOption } from '../../shared/styled-picklist';

export interface SystemUser {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: string;
  readonly initials: string;
}

export const SYSTEM_USERS: ReadonlyArray<SystemUser> = [
  {
    id: 'usr-andrea-torres',
    fullName: 'Andrea Torres',
    email: 'andrea.torres@speedlink.mx',
    role: 'Administrador',
    initials: 'AT',
  },
  {
    id: 'usr-carlos-madero',
    fullName: 'Carlos Madero',
    email: 'carlos.madero@speedlink.mx',
    role: 'Ventas',
    initials: 'CM',
  },
  {
    id: 'usr-carlos-mendoza',
    fullName: 'Carlos Mendoza',
    email: 'carlos.mendoza@speedlink.mx',
    role: 'Operaciones',
    initials: 'CM',
  },
  {
    id: 'usr-ana-torres',
    fullName: 'Ana Torres',
    email: 'ana.torres@speedlink.mx',
    role: 'Soporte',
    initials: 'AT',
  },
  {
    id: 'usr-mariana-silva',
    fullName: 'Mariana Silva',
    email: 'mariana.silva@speedlink.mx',
    role: 'Soporte',
    initials: 'MS',
  },
  {
    id: 'usr-luis-ramirez',
    fullName: 'Luis Ramírez',
    email: 'luis.ramirez@speedlink.mx',
    role: 'Técnico de campo',
    initials: 'LR',
  },
  {
    id: 'usr-sofia-guzman',
    fullName: 'Sofía Guzmán',
    email: 'sofia.guzman@speedlink.mx',
    role: 'Ventas',
    initials: 'SG',
  },
  {
    id: 'usr-jorge-vega',
    fullName: 'Jorge Vega',
    email: 'jorge.vega@speedlink.mx',
    role: 'Cobranza',
    initials: 'JV',
  },
];

/**
 * Roster vivo: lo mantiene AccessStore con los usuarios de Ajustes > Usuarios.
 * `SYSTEM_USERS` queda como semilla para los datos de demostración.
 */
const liveUsers = signal<ReadonlyArray<SystemUser>>(SYSTEM_USERS);

export function setLiveSystemUsers(users: ReadonlyArray<SystemUser>): void {
  liveUsers.set(users);
}

/** Opciones para app-styled-picklist: nombre como etiqueta, rol y correo como detalle. */
export function systemUserOptions(): ReadonlyArray<PicklistOption> {
  return liveUsers().map((user) => ({
    value: user.id,
    label: user.fullName,
    detail: `${user.role} · ${user.email}`,
  }));
}

/** Mapa id → nombre de la semilla, para los `optionLabels` estáticos de los módulos. */
export const SYSTEM_USER_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  SYSTEM_USERS.map((user) => [user.id, user.fullName]),
);

export const SYSTEM_USER_IDS: ReadonlyArray<string> = SYSTEM_USERS.map((user) => user.id);

export function findSystemUser(id: string): SystemUser | undefined {
  return liveUsers().find((user) => user.id === id) ?? SYSTEM_USERS.find((user) => user.id === id);
}

export function systemUserName(id: string): string | undefined {
  return findSystemUser(id)?.fullName;
}
