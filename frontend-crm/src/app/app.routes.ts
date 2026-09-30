import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import {
  authenticatedGuard,
  guestGuard,
  permissionGuard,
  userProfileGuard,
  customModuleGuard,
} from './core/auth/access.guards';
import { SessionContext } from './core/auth/session-context';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    title: 'SpeedLink | Internet para tu hogar',
    loadComponent: () =>
      import('./features/public/public-home-page/public-home-page').then(
        (m) => m.PublicHomePage,
      ),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Acceso | SpeedLink CRM',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'forbidden',
    title: 'Sin permiso | SpeedLink CRM',
    loadComponent: () => import('./features/system-message-page').then((m) => m.SystemMessagePage),
    data: { title: 'Sin permisos', message: 'Tu cuenta no tiene acceso a esta sección.' },
  },
  {
    path: 'portal/:slug',
    title: 'Portal de clientes | SpeedLink',
    loadComponent: () =>
      import('./features/client-portal/client-portal-page').then((m) => m.ClientPortalPage),
  },
  {
    path: '',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./core/layout/app-shell').then((m) => m.AppShell),
    children: [
      // No todos los roles ven el dashboard: se entra a la primera pantalla permitida.
      { path: '', pathMatch: 'full', redirectTo: () => inject(SessionContext).homeRoute() },
      {
        path: 'dashboard',
        canActivate: [permissionGuard('dashboard.read')],
        title: 'Dashboard | SpeedLink CRM',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'customers',
        canActivate: [permissionGuard('customers.read')],
        title: 'Clientes | SpeedLink CRM',
        loadComponent: () =>
          import('./features/customers/customers-page/customers-page').then(
            (m) => m.CustomersPage,
          ),
      },
      {
        path: 'customers/:id',
        canActivate: [permissionGuard('customers.read')],
        title: 'Detalle de cliente | SpeedLink CRM',
        loadComponent: () =>
          import('./features/customers/customer-detail-page/customer-detail-page').then(
            (m) => m.CustomerDetailPage,
          ),
      },
      {
        path: 'tickets',
        canActivate: [permissionGuard('tickets.read')],
        title: 'Tickets | SpeedLink CRM',
        loadComponent: () =>
          import('./features/tickets/tickets-page/tickets-page').then((m) => m.TicketsPage),
      },
      {
        path: 'tickets/:id',
        canActivate: [permissionGuard('tickets.read')],
        title: 'Detalle de ticket | SpeedLink CRM',
        loadComponent: () =>
          import('./features/tickets/ticket-detail-page/ticket-detail-page').then(
            (m) => m.TicketDetailPage,
          ),
      },
      ...(
        [
          ['leads', 'leads', 'leads.read', 'Leads'],
          ['services', 'services', 'services.read', 'Servicios'],
          ['equipment', 'equipment', 'equipment.read', 'Equipamiento'],
          ['assignments', 'assignments', 'assignments.read', 'Asignaciones'],
          ['contracts', 'contracts', 'contracts.read', 'Contratos'],
          ['invoices', 'invoices', 'invoices.read', 'Facturas'],
          ['payments', 'payments', 'payments.read', 'Pagos'],
          ['expenses', 'expenses', 'expenses.read', 'Gastos'],
        ] as const
      ).flatMap(([path, moduleKey, permission, title]) => [
        {
          path,
          canActivate: [permissionGuard(permission)],
          title: `${title} | SpeedLink CRM`,
          loadComponent: () =>
            import('./features/operations/operational-module-page/operational-module-page').then(
              (m) => m.OperationalModulePage,
            ),
          data: { moduleKey },
        },
        {
          path: `${path}/:id`,
          canActivate: [permissionGuard(permission)],
          title: `Detalle de ${title.toLowerCase()} | SpeedLink CRM`,
          loadComponent: () =>
            import(
              './features/operations/operational-record-detail-page/operational-record-detail-page'
            ).then((m) => m.OperationalRecordDetailPage),
          data: { moduleKey },
        },
      ]),
      {
        path: 'm/:moduleKey',
        canActivate: [customModuleGuard],
        title: 'Módulo | SpeedLink CRM',
        loadComponent: () =>
          import('./features/operations/operational-module-page/operational-module-page').then(
            (m) => m.OperationalModulePage,
          ),
      },
      {
        path: 'm/:moduleKey/:id',
        canActivate: [customModuleGuard],
        title: 'Detalle | SpeedLink CRM',
        loadComponent: () =>
          import(
            './features/operations/operational-record-detail-page/operational-record-detail-page'
          ).then((m) => m.OperationalRecordDetailPage),
      },
      {
        path: 'calendar',
        canActivate: [permissionGuard('calendar.read')],
        title: 'Calendario | SpeedLink CRM',
        loadComponent: () =>
          import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
      },
      {
        path: 'settings',
        canActivate: [permissionGuard('settings.read')],
        title: 'Centro de configuración | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-overview-page/settings-overview-page').then(
            (m) => m.SettingsOverviewPage,
          ),
      },
      {
        path: 'settings/organization',
        canActivate: [permissionGuard('settings.read')],
        title: 'Organización | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-organization-page/settings-organization-page').then(
            (m) => m.SettingsOrganizationPage,
          ),
      },
      {
        path: 'settings/taxes',
        canActivate: [permissionGuard('settings.read')],
        title: 'Impuestos | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-taxes-page/settings-taxes-page').then(
            (m) => m.SettingsTaxesPage,
          ),
      },
      {
        path: 'settings/smtp',
        canActivate: [permissionGuard('settings.read')],
        title: 'Correo SMTP | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-smtp-page/settings-smtp-page').then(
            (m) => m.SettingsSmtpPage,
          ),
      },
      {
        path: 'settings/sms',
        canActivate: [permissionGuard('settings.read')],
        title: 'Mensajería SMS | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-sms-page/settings-sms-page').then(
            (m) => m.SettingsSmsPage,
          ),
      },
      {
        path: 'settings/modules',
        canActivate: [permissionGuard('settings.read')],
        title: 'Módulos | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-modules-page/settings-modules-page').then(
            (m) => m.SettingsModulesPage,
          ),
      },
      {
        path: 'settings/modules/:key',
        canActivate: [permissionGuard('settings.read')],
        title: 'Campos del módulo | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-modules-page/settings-module-detail-page').then(
            (m) => m.SettingsModuleDetailPage,
          ),
      },
      {
        path: 'settings/users',
        canActivate: [permissionGuard('users.read')],
        title: 'Usuarios | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-users-page/settings-users-page').then(
            (m) => m.SettingsUsersPage,
          ),
      },
      {
        // El perfil sólo existe dentro de Ajustes; ya no hay ruta /users/:id.
        path: 'settings/users/:id',
        canActivate: [userProfileGuard],
        title: 'Perfil de usuario | SpeedLink CRM',
        loadComponent: () =>
          import('./features/users/user-profile-page').then((m) => m.UserProfilePage),
      },
      {
        path: 'settings/roles',
        canActivate: [permissionGuard('roles.read')],
        title: 'Roles y permisos | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-roles-page/settings-roles-page').then(
            (m) => m.SettingsRolesPage,
          ),
      },
      {
        path: 'settings/portal',
        canActivate: [permissionGuard('settings.read')],
        title: 'Portal de clientes | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-portal-page/settings-portal-page').then(
            (m) => m.SettingsPortalPage,
          ),
      },
      {
        path: 'settings/templates',
        canActivate: [permissionGuard('settings.read')],
        title: 'Plantillas | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-templates-page/settings-templates-page').then(
            (m) => m.SettingsTemplatesPage,
          ),
      },
      {
        path: 'settings/connections',
        canActivate: [permissionGuard('settings.read')],
        title: 'Conexiones | SpeedLink CRM',
        loadComponent: () =>
          import('./features/settings/settings-connections-page/settings-connections-page').then(
            (m) => m.SettingsConnectionsPage,
          ),
      },
      ...(
        [
          ['workflows', 'workflows', 'Flujos de trabajo'],
          ['schedules', 'schedules', 'Programaciones'],
          ['activity', 'activity', 'Registro de actividad'],
          ['audit', 'audit', 'Auditoría'],
          ['ip-restrictions', 'ip-restrictions', 'Restricciones IP'],
          ['2fa', '2fa', 'Autenticación 2FA'],
          ['webhooks', 'webhooks', 'Webhooks'],
          ['apis', 'apis', 'Acceso API'],
        ] as const
      ).map(([path, section, title]) => ({
        path: `settings/${path}`,
        canActivate: [permissionGuard('settings.read')],
        title: `${title} | SpeedLink CRM`,
        loadComponent: () =>
          import('./features/settings/settings-section-page/settings-section-page').then(
            (m) => m.SettingsSectionPage,
          ),
        data: { section },
      })),
      {
        path: ':section',
        title: 'Módulo | SpeedLink CRM',
        loadComponent: () =>
          import('./features/system-message-page').then((m) => m.SystemMessagePage),
        data: {
          title: 'Módulo en preparación',
          message:
            'Esta sección ya forma parte de la navegación y se implementará en una siguiente fase.',
        },
      },
    ],
  },
  {
    path: '**',
    title: 'Página no encontrada | SpeedLink CRM',
    loadComponent: () => import('./features/not-found-page').then((m) => m.NotFoundPage),
  },
];
