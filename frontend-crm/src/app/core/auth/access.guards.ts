import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permission, SessionContext } from './session-context';
import { customModule } from '../modules/custom-modules.model';

export const authenticatedGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionContext);
  const router = inject(Router);
  return session.isAuthenticated()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const session = inject(SessionContext);
  return session.isAuthenticated() ? inject(Router).createUrlTree([session.homeRoute()]) : true;
};

export function permissionGuard(permission: Permission): CanActivateFn {
  return () =>
    inject(SessionContext).hasPermission(permission)
      ? true
      : inject(Router).createUrlTree(['/forbidden']);
}

/** Perfil de usuario: quien administra usuarios ve cualquiera; el resto, sólo el suyo. */
export const userProfileGuard: CanActivateFn = (route) => {
  const session = inject(SessionContext);
  const isSelf = route.paramMap.get('id') === session.user()?.id;
  return isSelf || session.hasPermission('users.read')
    ? true
    : inject(Router).createUrlTree(['/forbidden']);
};

/** Módulos personalizados (`/m/:moduleKey`): deben existir y el rol debe poder verlos. */
export const customModuleGuard: CanActivateFn = (route) => {
  const key = route.paramMap.get('moduleKey') ?? '';
  if (!customModule(key)) return inject(Router).createUrlTree(['/forbidden']);
  return inject(SessionContext).hasPermission(`${key as `cm_${string}`}.read`)
    ? true
    : inject(Router).createUrlTree(['/forbidden']);
};
