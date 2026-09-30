import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Permission, SessionContext } from '../auth/session-context';
import { AccessModuleKey, accessModules } from '../auth/access.model';
import { customModules, isHiddenInMenu } from '../modules/custom-modules.model';
import { LanguageService } from '../i18n/language.service';

import { FilePreviewModal } from '../../shared/file-preview-modal';
import { MikrotikStore } from '../network/mikrotik.store';
interface NavItem {
  label: string;
  icon: string;
  route: string;
}
interface NavGroup {
  title: string;
  items: readonly NavItem[];
}
interface AppNotification {
  title: string;
  detail: string;
  time: string;
  tone: 'orange' | 'blue' | 'red' | 'green' | 'purple';
  unread: boolean;
  route: string[];
  queryParams?: Readonly<Record<string, string>>;
}

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, FilePreviewModal],
  templateUrl: './app-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly session = inject(SessionContext);
  private readonly mikrotik = inject(MikrotikStore);
  readonly i18n = inject(LanguageService);
  @ViewChild('globalSearch') private globalSearch?: ElementRef<HTMLInputElement>;
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);
  readonly darkMode = signal(this.readStoredTheme());
  readonly userMenuOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly searchQuery = signal('');
  readonly notificationsOpen = signal(false);
  readonly notificationDrawerOpen = signal(false);
  readonly notificationDrawerClosing = signal(false);
  readonly settingsMode = signal(this.router.url.startsWith('/settings'));
  readonly allNotifications: AppNotification[] = [
    {
      title: 'Nuevo correo recibido',
      detail: 'José Luis Hernández · Re: actualización del servicio',
      time: 'Hace 4 min',
      tone: 'blue',
      unread: true,
      route: ['/customers', 'SL-1044'],
      queryParams: { tab: 'Correos' },
    },
    {
      title: 'Factura próxima a vencer',
      detail: 'Rocío Macías · INV-2026-39437',
      time: 'Hace 10 min',
      tone: 'orange',
      unread: true,
      route: ['/invoices', 'INV-4484'],
    },
    {
      title: 'Nueva instalación programada',
      detail: 'Karime Galves · 15:00 - 16:30',
      time: 'Hace 35 min',
      tone: 'blue',
      unread: true,
      route: ['/customers', 'SL-1042'],
      queryParams: { tab: 'Eventos' },
    },
    {
      title: 'Factura vencida',
      detail: 'INV-2026-39407 · $460.00 MXN',
      time: 'Hace 1 h',
      tone: 'red',
      unread: true,
      route: ['/invoices', 'INV-4481'],
    },
    {
      title: 'Pago recibido',
      detail: 'Miriam Guerrero · $500.00 MXN',
      time: 'Hace 2 h',
      tone: 'green',
      unread: true,
      route: ['/payments', 'PAY-74021'],
    },
    {
      title: 'Nuevo cliente registrado',
      detail: 'Perla Ramírez',
      time: 'Hace 3 h',
      tone: 'purple',
      unread: true,
      route: ['/customers', 'SL-1042'],
    },
    {
      title: 'Instalación completada',
      detail: 'Ivet Martínez · Servicio básico',
      time: 'Ayer',
      tone: 'blue',
      unread: false,
      route: ['/assignments', 'ASG-7831'],
    },
    {
      title: 'Recordatorio de seguimiento',
      detail: 'Lead: Carlos Hernández',
      time: 'Ayer',
      tone: 'orange',
      unread: false,
      route: ['/leads', 'LD-1084'],
      queryParams: { tab: 'Eventos' },
    },
    {
      title: 'Servicio actualizado',
      detail: 'Rocío Macías · Plan intermedio',
      time: 'Hace 2 días',
      tone: 'green',
      unread: false,
      route: ['/services', 'SRV-100'],
    },
  ];
  readonly quickLinks = [
    {
      label: 'Dashboard',
      section: 'Menú principal',
      icon: '/icons/menu/fi-sr-apps.svg',
      route: '/dashboard',
    },
    {
      label: 'Clientes',
      section: 'Menú principal',
      icon: '/icons/menu/fi-rr-portrait.svg',
      route: '/customers',
    },
    {
      label: 'Leads',
      section: 'Menú principal',
      icon: '/icons/menu/fi-rr-interactive.svg',
      route: '/leads',
    },
    {
      label: 'Servicios',
      section: 'Red',
      icon: '/icons/menu/fi-rr-database.svg',
      route: '/services',
    },
    {
      label: 'Equipamiento',
      section: 'Red',
      icon: '/icons/menu/fi-rr-subtitles.svg',
      route: '/equipment',
    },
    {
      label: 'Asignaciones',
      section: 'Red',
      icon: '/icons/menu/fi-rr-reflect.svg',
      route: '/assignments',
    },
    {
      label: 'Contratos',
      section: 'Comercial',
      icon: '/icons/menu/fi-rr-document.svg',
      route: '/contracts',
    },
    {
      label: 'Tickets',
      section: 'Funciones',
      icon: '/icons/settings/fi-rr-comments.svg',
      route: '/tickets',
    },
    {
      label: 'Facturas',
      section: 'Funciones',
      icon: '/icons/menu/fi-rr-document.svg',
      route: '/invoices',
    },
    {
      label: 'Pagos',
      section: 'Funciones',
      icon: '/icons/menu/fi-rr-subtitles.svg',
      route: '/payments',
    },
    {
      label: 'Gastos',
      section: 'Funciones',
      icon: '/icons/menu/fi-rr-diploma.svg',
      route: '/expenses',
    },
    {
      label: 'Calendario',
      section: 'Funciones',
      icon: '/icons/menu/fi-rr-calendar.svg',
      route: '/calendar',
    },
    {
      label: 'Configuración de organización',
      section: 'Preferencias',
      icon: '/icons/settings/fi-rr-building.svg',
      route: '/settings/organization',
    },
    {
      label: 'Usuarios',
      section: 'Preferencias',
      icon: '/icons/settings/fi-rr-portrait-2.svg',
      route: '/settings/users',
    },
  ];
  readonly searchResults = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('es');
    return query
      ? this.visibleQuickLinks().filter((item) => item.label.toLocaleLowerCase('es').includes(query))
      : this.visibleQuickLinks();
  });
  readonly visibleQuickLinks = computed(() =>
    this.quickLinks.filter((item) => this.canSee(item.route)),
  );
  /** Menú del modo actual sin las entradas que el rol no puede abrir. */
  readonly visibleNavigation = computed(() =>
    (this.settingsMode() ? this.settingsNavigation : [...this.navigation, this.customNavigation()])
      .map((group) => ({
        ...group,
        items: group.items.filter(
          // Ocultar un nativo en Ajustes > Módulos sólo lo quita del menú; el permiso sigue igual.
          (item) =>
            this.canSee(item.route) &&
            !isHiddenInMenu(item.route.split('/')[1] ?? '') &&
            // MikroTik sólo aparece con un router conectado.
            (item.route !== '/network' || this.mikrotik.connected()),
        ),
      }))
      .filter((group) => group.items.length),
  );
  /** Módulos creados en Ajustes > Módulos que se muestran en el menú. */
  private readonly customNavigation = computed<NavGroup>(() => ({
    title: 'PERSONALIZADOS',
    items: customModules()
      .filter((module) => module.showInMenu)
      .map((module) => ({ label: module.plural, icon: module.icon, route: `/m/${module.key}` })),
  }));
  /** Primera pantalla de ajustes permitida; null oculta el acceso a configuración. */
  readonly settingsEntry = computed(
    () =>
      this.settingsNavigation.flatMap((group) => group.items).find((item) => this.canSee(item.route))
        ?.route ?? null,
  );
  readonly navigation: readonly NavGroup[] = [
    {
      title: 'MENÚ PRINCIPAL',
      items: [
        { label: 'Dashboard', icon: '/icons/menu/fi-sr-apps.svg', route: '/dashboard' },
        { label: 'Clientes', icon: '/icons/menu/fi-rr-portrait.svg', route: '/customers' },
        { label: 'Leads', icon: '/icons/menu/fi-rr-interactive.svg', route: '/leads' },
      ],
    },
    {
      title: 'RED',
      items: [
        { label: 'Asignaciones', icon: '/icons/menu/fi-rr-reflect.svg', route: '/assignments' },
        { label: 'Servicios', icon: '/icons/menu/fi-rr-database.svg', route: '/services' },
        { label: 'Equipamiento', icon: '/icons/menu/fi-rr-subtitles.svg', route: '/equipment' },
        { label: 'Existencias', icon: '/icons/menu/fi-rr-database.svg', route: '/inventory' },
        { label: 'MikroTik', icon: '/icons/settings/fi-rr-clouds.svg', route: '/network' },
      ],
    },
    {
      title: 'COMERCIAL',
      items: [{ label: 'Contratos', icon: '/icons/menu/fi-rr-document.svg', route: '/contracts' }],
    },
    {
      title: 'FUNCIONES',
      items: [
        { label: 'Facturas', icon: '/icons/menu/fi-rr-document.svg', route: '/invoices' },
        { label: 'Pagos', icon: '/icons/menu/fi-rr-subtitles.svg', route: '/payments' },
        { label: 'Gastos', icon: '/icons/menu/fi-rr-diploma.svg', route: '/expenses' },
        { label: 'Calendario', icon: '/icons/menu/fi-rr-calendar.svg', route: '/calendar' },
        { label: 'Tickets', icon: '/icons/settings/fi-rr-comments.svg', route: '/tickets' },
        { label: 'Reportes', icon: '/icons/menu/fi-rr-diploma.svg', route: '/reports' },
      ],
    },
  ];
  readonly settingsNavigation: readonly NavGroup[] = [
    {
      title: 'AJUSTES',
      items: [
        {
          label: 'Centro de configuración',
          icon: '/icons/menu/fi-sr-apps.svg',
          route: '/settings',
        },
      ],
    },
    {
      title: 'GENERAL',
      items: [
        {
          label: 'Configuración de organización',
          icon: '/icons/settings/fi-rr-building.svg',
          route: '/settings/organization',
        },
        {
          label: 'Usuarios',
          icon: '/icons/settings/fi-rr-portrait-2.svg',
          route: '/settings/users',
        },
        {
          label: 'Roles y permisos',
          icon: '/icons/menu/fi-rr-diploma.svg',
          route: '/settings/roles',
        },
        {
          label: 'Impuestos',
          icon: '/icons/menu/fi-rr-document.svg',
          route: '/settings/taxes',
        },
      ],
    },
    {
      title: 'CANALES',
      items: [
        { label: 'SMTP', icon: '/icons/settings/fi-rr-envelope.svg', route: '/settings/smtp' },
        { label: 'SMS', icon: '/icons/settings/fi-rr-comments.svg', route: '/settings/sms' },
        { label: 'Portal', icon: '/icons/settings/fi-rr-layers.svg', route: '/settings/portal' },
      ],
    },
    {
      title: 'PERSONALIZACIÓN',
      items: [
        {
          label: 'Plantillas',
          icon: '/icons/menu/fi-rr-document.svg',
          route: '/settings/templates',
        },
        { label: 'Módulos', icon: '/icons/settings/fi-rr-apps.svg', route: '/settings/modules' },
      ],
    },
    {
      title: 'AUTOMATIZACIÓN',
      items: [
        {
          label: 'Flujos de trabajo',
          icon: '/icons/settings/fi-rr-chart-tree.svg',
          route: '/settings/workflows',
        },
        {
          label: 'Programaciones',
          icon: '/icons/settings/fi-rr-time-forward.svg',
          route: '/settings/schedules',
        },
      ],
    },
    {
      title: 'SEGURIDAD',
      items: [
        {
          label: 'Registro de actividad',
          icon: '/icons/menu/fi-rr-document.svg',
          route: '/settings/activity',
        },
        { label: 'Auditoría', icon: '/icons/settings/fi-rr-bug.svg', route: '/settings/audit' },
        {
          label: 'Restricciones IP',
          icon: '/icons/settings/fi-rr-lock.svg',
          route: '/settings/ip-restrictions',
        },
        {
          label: 'Inicio de sesión 2FA',
          icon: '/icons/settings/fi-rr-lock.svg',
          route: '/settings/2fa',
        },
      ],
    },
    {
      title: 'INTEGRACIONES',
      items: [
        {
          label: 'Webhooks',
          icon: '/icons/settings/fi-rr-resize.svg',
          route: '/settings/webhooks',
        },
        { label: 'APIs', icon: '/icons/settings/fi-rr-clouds.svg', route: '/settings/apis' },
        {
          label: 'Conexiones',
          icon: '/icons/settings/fi-rr-cube.svg',
          route: '/settings/connections',
        },
      ],
    },
  ];

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.settingsMode.set(event.urlAfterRedirects.startsWith('/settings')));
  }

  @HostListener('document:keydown.escape') closePanels(): void {
    this.mobileOpen.set(false);
    this.notificationsOpen.set(false);
    this.userMenuOpen.set(false);
    this.closeQuickAccess();
    this.globalSearch?.nativeElement.blur();
    if (this.notificationDrawerOpen()) this.closeNotificationDrawer();
  }

  @HostListener('document:keydown', ['$event']) handleGlobalShortcut(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault();
      this.searchOpen.set(true);
      queueMicrotask(() => this.globalSearch?.nativeElement.focus());
    }
  }

  @HostListener('document:click', ['$event']) handleDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && !target.closest('.search-shell')) this.closeQuickAccess();
  }

  updateSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.searchOpen.set(true);
  }
  handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeQuickAccess();
      this.globalSearch?.nativeElement.blur();
    } else if (event.key === 'Enter' && this.searchResults().length > 0) {
      void this.openSearchResult(this.searchResults()[0].route);
    }
  }
  closeQuickAccess(): void {
    this.searchOpen.set(false);
  }
  async openSearchResult(route: string): Promise<void> {
    await this.router.navigateByUrl(route);
    this.searchOpen.set(false);
    this.searchQuery.set('');
    if (this.globalSearch) this.globalSearch.nativeElement.value = '';
  }

  unreadNotificationCount(): number {
    return this.allNotifications.filter((notification) => notification.unread).length;
  }
  openNotificationDrawer(): void {
    this.notificationsOpen.set(false);
    this.notificationDrawerClosing.set(false);
    this.notificationDrawerOpen.set(true);
  }
  closeNotificationDrawer(): void {
    if (this.notificationDrawerClosing()) return;
    this.notificationDrawerClosing.set(true);
    window.setTimeout(() => {
      this.notificationDrawerOpen.set(false);
      this.notificationDrawerClosing.set(false);
    }, 250);
  }
  markAllNotificationsRead(): void {
    this.allNotifications.forEach((notification) => (notification.unread = false));
  }
  async openNotification(notification: AppNotification): Promise<void> {
    notification.unread = false;
    this.notificationsOpen.set(false);
    this.notificationDrawerClosing.set(false);
    this.notificationDrawerOpen.set(false);
    await this.router.navigate(notification.route, { queryParams: notification.queryParams });
  }
  toggleDarkMode(): void {
    const darkMode = !this.darkMode();
    this.darkMode.set(darkMode);
    localStorage.setItem('speedlink-theme', darkMode ? 'dark' : 'light');
    this.userMenuOpen.set(false);
  }
  private readStoredTheme(): boolean {
    return localStorage.getItem('speedlink-theme') === 'dark';
  }
  signOut(): void {
    this.userMenuOpen.set(false);
    this.session.logout();
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }
  userInitials(): string {
    return (this.session.user()?.name ?? 'Usuario')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }
  userRole(): string {
    return this.session.user()?.roleName ?? 'Usuario';
  }
  /** Permiso que exige cada ruta del menú; sin permiso, la entrada no se muestra. */
  private routePermission(route: string): Permission | null {
    if (route === '/inventory') return 'equipment.read';
    if (route === '/settings/users') return 'users.read';
    if (route === '/settings/roles') return 'roles.read';
    if (route.startsWith('/settings')) return 'settings.read';
    if (route.startsWith('/m/')) return `${route.split('/')[2] as `cm_${string}`}.read`;
    const module = route.split('/')[1] as AccessModuleKey;
    return accessModules().some((item) => item.key === module) ? `${module}.read` : null;
  }
  canSee(route: string): boolean {
    const permission = this.routePermission(route);
    return !permission || this.session.hasPermission(permission);
  }
  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}
