export type SettingsSectionKey =
  | 'organization'
  | 'users'
  | 'roles'
  | 'smtp'
  | 'sms'
  | 'portal'
  | 'templates'
  | 'modules'
  | 'workflows'
  | 'schedules'
  | 'activity'
  | 'audit'
  | 'ip-restrictions'
  | '2fa'
  | 'webhooks'
  | 'apis'
  | 'connections'
  | 'taxes';

export interface SettingsMetric {
  label: string;
  value: string;
  note: string;
  tone: 'blue' | 'green' | 'amber' | 'violet';
}

export interface SettingsRow {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  status: string;
  tone: 'active' | 'pending' | 'inactive' | 'danger';
}

export interface SettingsField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'select' | 'textarea' | 'password';
  required?: boolean;
  value?: string;
  options?: readonly string[];
}

export interface SettingsSection {
  key: SettingsSectionKey;
  group: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
  action: string;
  singleton?: boolean;
  metrics: readonly SettingsMetric[];
  rows: readonly SettingsRow[];
  fields: readonly SettingsField[];
}

const icons = {
  building: '/icons/settings/fi-rr-building.svg',
  users: '/icons/settings/fi-rr-portrait-2.svg',
  roles: '/icons/menu/fi-rr-diploma.svg',
  email: '/icons/settings/fi-rr-envelope.svg',
  sms: '/icons/settings/fi-rr-comments.svg',
  portal: '/icons/settings/fi-rr-layers.svg',
  templates: '/icons/menu/fi-rr-document.svg',
  modules: '/icons/settings/fi-rr-apps.svg',
  workflow: '/icons/settings/fi-rr-chart-tree.svg',
  schedule: '/icons/settings/fi-rr-time-forward.svg',
  security: '/icons/settings/fi-rr-lock.svg',
  audit: '/icons/settings/fi-rr-bug.svg',
  webhook: '/icons/settings/fi-rr-resize.svg',
  api: '/icons/settings/fi-rr-clouds.svg',
  connection: '/icons/settings/fi-rr-cube.svg',
} as const;

const active = (id: string, title: string, subtitle: string, meta: string): SettingsRow => ({
  id,
  title,
  subtitle,
  meta,
  status: 'Activo',
  tone: 'active',
});

export const SETTINGS_SECTIONS: Record<SettingsSectionKey, SettingsSection> = {
  organization: {
    key: 'organization',
    group: 'General',
    title: 'Configuración de organización',
    shortTitle: 'Organización',
    description: 'Identidad, datos fiscales, zona horaria y preferencias principales de SpeedLink.',
    icon: icons.building,
    action: 'Editar organización',
    singleton: true,
    metrics: [
      { label: 'Código', value: 'SL-MX-01', note: 'Identificador único', tone: 'blue' },
      { label: 'Zona horaria', value: 'Monterrey', note: 'America/Monterrey', tone: 'violet' },
      { label: 'Estado', value: 'Activa', note: 'Operación habilitada', tone: 'green' },
    ],
    rows: [
      active(
        'org-1',
        'SpeedLink Telecom',
        'contacto@speedlink.mx · +52 55 4100 2200',
        'Zumpango, Estado de México',
      ),
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true, value: 'SpeedLink Telecom' },
      {
        key: 'orgCode',
        label: 'Código de organización',
        type: 'text',
        required: true,
        value: 'SL-MX-01',
      },
      {
        key: 'email',
        label: 'Correo electrónico',
        type: 'email',
        required: true,
        value: 'contacto@speedlink.mx',
      },
      { key: 'phone', label: 'Teléfono', type: 'text', value: '+52 55 4100 2200' },
      { key: 'address', label: 'Dirección', type: 'textarea', value: 'Zumpango, Estado de México' },
      {
        key: 'timeZone',
        label: 'Zona horaria',
        type: 'select',
        required: true,
        value: 'America/Monterrey',
        options: ['America/Monterrey', 'America/Mexico_City', 'America/Tijuana'],
      },
    ],
  },
  users: {
    key: 'users',
    group: 'General',
    title: 'Usuarios',
    shortTitle: 'Usuarios',
    description: 'Administra las personas con acceso al CRM, su rol, idioma y seguridad.',
    icon: icons.users,
    action: 'Nuevo usuario',
    metrics: [
      { label: 'Usuarios', value: '24', note: '22 activos', tone: 'blue' },
      { label: 'Con 2FA', value: '18', note: '75% de adopción', tone: 'green' },
      { label: 'Pendientes', value: '2', note: 'Invitaciones', tone: 'amber' },
    ],
    rows: [
      active(
        'usr-1',
        'Andrea Torres',
        'andrea@speedlink.mx · Administrador',
        'Último acceso: hoy, 09:42',
      ),
      active(
        'usr-2',
        'Carlos Madero',
        'carlos@speedlink.mx · Ventas',
        'Último acceso: ayer, 18:10',
      ),
      {
        id: 'usr-3',
        title: 'Mariana Silva',
        subtitle: 'mariana@speedlink.mx · Soporte',
        meta: 'Invitación enviada hace 2 días',
        status: 'Pendiente',
        tone: 'pending',
      },
    ],
    fields: [
      { key: 'name', label: 'Nombre completo', type: 'text', required: true },
      { key: 'email', label: 'Correo electrónico', type: 'email', required: true },
      { key: 'phone', label: 'Teléfono', type: 'text' },
      {
        key: 'roleId',
        label: 'Rol',
        type: 'select',
        required: true,
        options: ['Administrador', 'Ventas', 'Soporte', 'Finanzas'],
      },
      {
        key: 'preferredLanguage',
        label: 'Idioma',
        type: 'select',
        required: true,
        options: ['Español', 'English'],
      },
    ],
  },
  roles: {
    key: 'roles',
    group: 'General',
    title: 'Roles y permisos',
    shortTitle: 'Roles y permisos',
    description:
      'Define el acceso de lectura, creación, edición, eliminación y exportación por módulo.',
    icon: icons.roles,
    action: 'Nuevo rol',
    metrics: [
      { label: 'Roles', value: '6', note: '4 personalizados', tone: 'violet' },
      { label: 'Permisos', value: '84', note: 'Asignaciones activas', tone: 'blue' },
      { label: 'Sin asignar', value: '0', note: 'Usuarios cubiertos', tone: 'green' },
    ],
    rows: [
      active('role-1', 'Administrador', 'Acceso completo al sistema', '8 usuarios'),
      active('role-2', 'Ventas', 'Clientes, leads, contratos y calendario', '7 usuarios'),
      active('role-3', 'Soporte', 'Tickets, clientes y equipamiento', '6 usuarios'),
    ],
    fields: [
      { key: 'name', label: 'Nombre del rol', type: 'text', required: true },
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        required: true,
        options: ['Personalizado', 'Administrador', 'Operativo'],
      },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
  },
  smtp: {
    key: 'smtp',
    group: 'Canales',
    title: 'Servidor SMTP',
    shortTitle: 'Correo SMTP',
    description:
      'Configura el servidor que enviará correos, notificaciones y plantillas del sistema.',
    icon: icons.email,
    action: 'Configurar SMTP',
    singleton: true,
    metrics: [
      { label: 'Estado', value: 'Conectado', note: 'Última prueba: hoy', tone: 'green' },
      { label: 'Puerto', value: '587', note: 'Conexión TLS', tone: 'blue' },
      {
        label: 'Remitente',
        value: 'SpeedLink',
        note: 'notificaciones@speedlink.mx',
        tone: 'violet',
      },
    ],
    rows: [
      active('smtp-1', 'smtp.speedlink.mx', 'notificaciones@speedlink.mx', 'TLS · Puerto 587'),
    ],
    fields: [
      { key: 'host', label: 'Servidor', type: 'text', required: true, value: 'smtp.speedlink.mx' },
      { key: 'port', label: 'Puerto', type: 'number', required: true, value: '587' },
      { key: 'username', label: 'Usuario', type: 'text', required: true },
      { key: 'password', label: 'Contraseña', type: 'password', required: true },
      {
        key: 'fromEmail',
        label: 'Correo remitente',
        type: 'email',
        required: true,
        value: 'notificaciones@speedlink.mx',
      },
    ],
  },
  sms: {
    key: 'sms',
    group: 'Canales',
    title: 'Mensajería SMS',
    shortTitle: 'SMS',
    description: 'Proveedor, credenciales y número de salida para avisos por mensaje de texto.',
    icon: icons.sms,
    action: 'Configurar SMS',
    singleton: true,
    metrics: [
      { label: 'Estado', value: 'Conectado', note: 'Proveedor disponible', tone: 'green' },
      { label: 'Proveedor', value: 'Twilio', note: 'Cuenta principal', tone: 'blue' },
      { label: 'Este mes', value: '1,284', note: 'Mensajes enviados', tone: 'violet' },
    ],
    rows: [active('sms-1', 'Twilio', '+52 55 9000 4412', 'Sincronizado hace 8 min')],
    fields: [
      {
        key: 'provider',
        label: 'Proveedor',
        type: 'select',
        required: true,
        options: ['Twilio', 'MessageBird', 'Otro'],
      },
      { key: 'apiKey', label: 'API key', type: 'password', required: true },
      { key: 'apiSecret', label: 'API secret', type: 'password', required: true },
      { key: 'fromNumber', label: 'Número remitente', type: 'text', required: true },
    ],
  },
  portal: {
    key: 'portal',
    group: 'Canales',
    title: 'Portal de clientes',
    shortTitle: 'Portal',
    description: 'Personaliza el autoservicio para facturas, pagos y tickets de tus clientes.',
    icon: icons.portal,
    action: 'Personalizar portal',
    singleton: true,
    metrics: [
      { label: 'Estado', value: 'Publicado', note: 'Acceso habilitado', tone: 'green' },
      { label: 'Sesiones', value: '438', note: 'Últimos 30 días', tone: 'blue' },
      { label: 'Slug', value: 'speedlink', note: 'portal/speedlink', tone: 'violet' },
    ],
    rows: [
      active('portal-1', 'Mi SpeedLink', 'Facturas · Pagos · Tickets', 'Color principal #2563EB'),
    ],
    fields: [
      {
        key: 'name',
        label: 'Nombre del portal',
        type: 'text',
        required: true,
        value: 'Mi SpeedLink',
      },
      { key: 'slug', label: 'Dirección (slug)', type: 'text', required: true, value: 'speedlink' },
      { key: 'primaryColor', label: 'Color principal', type: 'text', value: '#2563EB' },
    ],
  },
  templates: {
    key: 'templates',
    group: 'Personalización',
    title: 'Plantillas',
    shortTitle: 'Plantillas',
    description: 'Contenido reutilizable para correos y SMS con variables del CRM.',
    icon: icons.templates,
    action: 'Nueva plantilla',
    metrics: [
      { label: 'Plantillas', value: '12', note: '9 de correo', tone: 'blue' },
      { label: 'Activas', value: '10', note: 'Disponibles al enviar', tone: 'green' },
      { label: 'Variables', value: '18', note: 'Campos dinámicos', tone: 'violet' },
    ],
    rows: [
      active(
        'tpl-1',
        'Bienvenida al servicio',
        'Correo · {{customer.name}}',
        'Actualizada hace 3 días',
      ),
      active(
        'tpl-2',
        'Recordatorio de pago',
        'SMS · {{invoice.dueDate}}',
        'Actualizada hace 1 semana',
      ),
      {
        id: 'tpl-3',
        title: 'Seguimiento comercial',
        subtitle: 'Correo · Borrador',
        meta: 'Actualizada ayer',
        status: 'Borrador',
        tone: 'pending',
      },
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      {
        key: 'channel',
        label: 'Canal',
        type: 'select',
        required: true,
        options: ['Correo', 'SMS'],
      },
      { key: 'subject', label: 'Asunto', type: 'text' },
      { key: 'body', label: 'Contenido', type: 'textarea', required: true },
    ],
  },
  modules: {
    key: 'modules',
    group: 'Personalización',
    title: 'Módulos personalizados',
    shortTitle: 'Módulos',
    description: 'Crea entidades y campos adicionales adaptados a tu operación.',
    icon: icons.modules,
    action: 'Nuevo módulo',
    metrics: [
      { label: 'Módulos', value: '3', note: 'Personalizados', tone: 'violet' },
      { label: 'Campos', value: '27', note: '24 activos', tone: 'blue' },
      { label: 'Registros', value: '846', note: 'En módulos custom', tone: 'green' },
    ],
    rows: [
      active('mod-1', 'Torres de cobertura', '12 campos · Infraestructura', '324 registros'),
      active('mod-2', 'Proveedores', '9 campos · Operación', '42 registros'),
      active('mod-3', 'Visitas técnicas', '6 campos · Servicio', '480 registros'),
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'slug', label: 'Identificador', type: 'text', required: true },
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        required: true,
        options: ['Personalizado', 'Sistema'],
      },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
  },
  workflows: {
    key: 'workflows',
    group: 'Automatización',
    title: 'Flujos de trabajo',
    shortTitle: 'Workflows',
    description: 'Automatiza acciones cuando se crean o actualizan registros.',
    icon: icons.workflow,
    action: 'Nuevo flujo',
    metrics: [
      { label: 'Flujos', value: '8', note: '6 activos', tone: 'blue' },
      { label: 'Ejecuciones', value: '1,942', note: 'Este mes', tone: 'green' },
      { label: 'Con errores', value: '2', note: 'Requieren atención', tone: 'amber' },
    ],
    rows: [
      active('wf-1', 'Asignar lead nuevo', 'Lead creado → asignar por zona', '312 ejecuciones'),
      active('wf-2', 'Aviso de factura vencida', 'Factura vencida → email + SMS', '94 ejecuciones'),
      {
        id: 'wf-3',
        title: 'Escalar ticket crítico',
        subtitle: 'Ticket actualizado → notificar supervisor',
        meta: '2 errores recientes',
        status: 'Revisar',
        tone: 'danger',
      },
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      {
        key: 'triggerModule',
        label: 'Módulo',
        type: 'select',
        required: true,
        options: ['Clientes', 'Leads', 'Tickets', 'Facturas', 'Pagos'],
      },
      {
        key: 'triggerEvent',
        label: 'Evento',
        type: 'select',
        required: true,
        options: ['Creación', 'Actualización', 'Eliminación'],
      },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
  },
  schedules: {
    key: 'schedules',
    group: 'Automatización',
    title: 'Programaciones',
    shortTitle: 'Programaciones',
    description: 'Ejecuta acciones una vez o de manera recurrente mediante horarios controlados.',
    icon: icons.schedule,
    action: 'Nueva programación',
    metrics: [
      { label: 'Programaciones', value: '7', note: '5 activas', tone: 'blue' },
      { label: 'Próxima', value: '23:00', note: 'Cierre diario', tone: 'violet' },
      { label: 'Éxito', value: '99.8%', note: 'Últimos 30 días', tone: 'green' },
    ],
    rows: [
      active(
        'sch-1',
        'Generar facturación mensual',
        'Recurrente · Día 1 a las 02:00',
        'Próxima: 1 ago 2026',
      ),
      active('sch-2', 'Resumen operativo diario', 'Cron · 0 23 * * *', 'Próxima: hoy 23:00'),
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        required: true,
        options: ['Recurrente', 'Una vez'],
      },
      { key: 'cronExpression', label: 'Expresión cron', type: 'text' },
      { key: 'action', label: 'Acción', type: 'text', required: true },
    ],
  },
  activity: {
    key: 'activity',
    group: 'Seguridad',
    title: 'Registro de actividad',
    shortTitle: 'Actividad',
    description: 'Consulta accesos y acciones administrativas recientes dentro de la organización.',
    icon: icons.templates,
    action: 'Exportar registro',
    metrics: [
      { label: 'Eventos hoy', value: '248', note: 'Toda la organización', tone: 'blue' },
      { label: 'Usuarios', value: '19', note: 'Con actividad', tone: 'green' },
      { label: 'Alertas', value: '3', note: 'Para revisar', tone: 'amber' },
    ],
    rows: [
      active(
        'act-1',
        'Andrea Torres actualizó un rol',
        'Roles y permisos · Administrador',
        'Hoy, 10:24 · 192.168.1.18',
      ),
      active(
        'act-2',
        'Carlos Madero exportó leads',
        'Leads · 86 registros',
        'Hoy, 09:51 · 192.168.1.34',
      ),
      {
        id: 'act-3',
        title: 'Intento de acceso rechazado',
        subtitle: 'Usuario desconocido',
        meta: 'Hoy, 04:12 · 201.141.22.8',
        status: 'Alerta',
        tone: 'danger',
      },
    ],
    fields: [],
  },
  audit: {
    key: 'audit',
    group: 'Seguridad',
    title: 'Auditoría de datos',
    shortTitle: 'Auditoría',
    description: 'Trazabilidad de valores anteriores y nuevos en registros sensibles.',
    icon: icons.audit,
    action: 'Exportar auditoría',
    metrics: [
      { label: 'Cambios', value: '1,106', note: 'Últimos 30 días', tone: 'blue' },
      { label: 'Módulos', value: '14', note: 'Con trazabilidad', tone: 'violet' },
      { label: 'Retención', value: '365 días', note: 'Política actual', tone: 'green' },
    ],
    rows: [
      active(
        'aud-1',
        'Estado de cliente modificado',
        'Cliente SL-1044 · Pendiente → Activo',
        'Andrea Torres · Hoy, 10:02',
      ),
      active(
        'aud-2',
        'Monto de factura modificado',
        'INV-4481 · $1,180 → $1,240',
        'María Luna · Ayer, 17:44',
      ),
    ],
    fields: [],
  },
  'ip-restrictions': {
    key: 'ip-restrictions',
    group: 'Seguridad',
    title: 'Restricciones IP',
    shortTitle: 'Restricciones IP',
    description: 'Permite o bloquea el acceso al CRM desde direcciones y redes específicas.',
    icon: icons.security,
    action: 'Agregar regla',
    metrics: [
      { label: 'Reglas', value: '6', note: '5 permitidas', tone: 'blue' },
      { label: 'Bloqueos', value: '14', note: 'Esta semana', tone: 'amber' },
      { label: 'Cobertura', value: '3 sedes', note: 'Redes autorizadas', tone: 'green' },
    ],
    rows: [
      active(
        'ip-1',
        '192.168.1.0/24',
        'Oficina Zumpango · Acceso permitido',
        'Creada por Andrea Torres',
      ),
      active(
        'ip-2',
        '189.203.44.18',
        'VPN administrativa · Acceso permitido',
        'Creada por Soporte',
      ),
      {
        id: 'ip-3',
        title: '201.141.22.8',
        subtitle: 'Dirección con intentos anómalos',
        meta: 'Bloqueada hoy',
        status: 'Bloqueada',
        tone: 'danger',
      },
    ],
    fields: [
      { key: 'ipAddress', label: 'Dirección IP o CIDR', type: 'text', required: true },
      {
        key: 'mode',
        label: 'Acceso',
        type: 'select',
        required: true,
        options: ['Permitir', 'Bloquear'],
      },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
  },
  '2fa': {
    key: '2fa',
    group: 'Seguridad',
    title: 'Inicio de sesión 2FA',
    shortTitle: 'Autenticación 2FA',
    description: 'Política de doble factor para proteger las cuentas de los usuarios.',
    icon: icons.security,
    action: 'Editar política',
    singleton: true,
    metrics: [
      { label: 'Adopción', value: '75%', note: '18 de 24 usuarios', tone: 'green' },
      { label: 'Obligatorio', value: 'Admins', note: 'Roles protegidos', tone: 'blue' },
      { label: 'Recuperación', value: '2', note: 'Solicitudes este mes', tone: 'amber' },
    ],
    rows: [
      active(
        '2fa-1',
        'Política de autenticación',
        'Obligatoria para administradores',
        'Aplicada a 8 usuarios',
      ),
    ],
    fields: [
      {
        key: 'policy',
        label: 'Requerir 2FA',
        type: 'select',
        required: true,
        options: ['Todos los usuarios', 'Solo administradores', 'Opcional'],
      },
      {
        key: 'gracePeriod',
        label: 'Periodo de gracia (días)',
        type: 'number',
        required: true,
        value: '7',
      },
    ],
  },
  webhooks: {
    key: 'webhooks',
    group: 'Integraciones',
    title: 'Webhooks',
    shortTitle: 'Webhooks',
    description: 'Notifica eventos del CRM a servicios externos y supervisa cada entrega.',
    icon: icons.webhook,
    action: 'Nuevo webhook',
    metrics: [
      { label: 'Endpoints', value: '5', note: '4 activos', tone: 'blue' },
      { label: 'Entregas', value: '3,820', note: 'Este mes', tone: 'green' },
      { label: 'Fallidas', value: '11', note: '0.29%', tone: 'amber' },
    ],
    rows: [
      active(
        'wh-1',
        'ERP · Facturas y pagos',
        'https://erp.speedlink.mx/hooks/crm',
        'Última entrega: 200 OK · hace 3 min',
      ),
      active(
        'wh-2',
        'NOC · Estado de tickets',
        'https://noc.speedlink.mx/events',
        'Última entrega: 200 OK · hace 12 min',
      ),
      {
        id: 'wh-3',
        title: 'Marketing leads',
        subtitle: 'https://automation.speedlink.mx/leads',
        meta: 'Última entrega: 503 · hace 1 h',
        status: 'Con errores',
        tone: 'danger',
      },
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'url', label: 'URL del endpoint', type: 'text', required: true },
      { key: 'secret', label: 'Secreto de firma', type: 'password' },
      {
        key: 'events',
        label: 'Evento principal',
        type: 'select',
        required: true,
        options: ['Registro creado', 'Registro actualizado', 'Registro eliminado', 'Pago recibido'],
      },
    ],
  },
  apis: {
    key: 'apis',
    group: 'Integraciones',
    title: 'Acceso API',
    shortTitle: 'APIs',
    description: 'Credenciales y límites para aplicaciones que consumen la API de SpeedLink.',
    icon: icons.api,
    action: 'Nueva credencial',
    metrics: [
      { label: 'Credenciales', value: '4', note: '3 activas', tone: 'blue' },
      { label: 'Solicitudes', value: '84.2K', note: 'Este mes', tone: 'green' },
      { label: 'Uso máximo', value: '42%', note: 'Del límite', tone: 'violet' },
    ],
    rows: [
      active('api-1', 'Aplicación móvil', 'Producción · lectura/escritura', 'Usada hace 2 min'),
      active('api-2', 'Reportes BI', 'Producción · solo lectura', 'Usada hace 18 min'),
      {
        id: 'api-3',
        title: 'Migración legacy',
        subtitle: 'Temporal · lectura/escritura',
        meta: 'Expira el 31 jul 2026',
        status: 'Por expirar',
        tone: 'pending',
      },
    ],
    fields: [
      { key: 'name', label: 'Nombre de credencial', type: 'text', required: true },
      {
        key: 'scope',
        label: 'Alcance',
        type: 'select',
        required: true,
        options: ['Solo lectura', 'Lectura y escritura'],
      },
      {
        key: 'expiresIn',
        label: 'Vigencia',
        type: 'select',
        required: true,
        options: ['30 días', '90 días', '1 año', 'Sin expiración'],
      },
    ],
  },
  connections: {
    key: 'connections',
    group: 'Integraciones',
    title: 'Conexiones externas',
    shortTitle: 'Conexiones',
    // La página tiene su propio componente (settings-connections-page).
    description: 'Google Maps, WhatsApp, servidor, pagos en línea y timbrado CFDI.',
    icon: icons.connection,
    action: '',
    metrics: [],
    rows: [],
    fields: [],
  },
  taxes: {
    key: 'taxes',
    group: 'General',
    title: 'Impuestos',
    shortTitle: 'Impuestos',
    description: 'Tasas fiscales disponibles para facturas, servicios y cargos.',
    icon: icons.roles,
    action: 'Nueva tasa',
    metrics: [
      { label: 'Tasas', value: '3', note: '2 activas', tone: 'blue' },
      { label: 'Predeterminada', value: 'IVA 16%', note: 'Aplicada por defecto', tone: 'green' },
      { label: 'Facturas', value: '98%', note: 'Con tasa asignada', tone: 'violet' },
    ],
    rows: [
      active('tax-1', 'IVA 16%', 'Tasa predeterminada', 'Usada en 2,481 facturas'),
      active('tax-2', 'IVA 8%', 'Región fronteriza', 'Usada en 24 facturas'),
      {
        id: 'tax-3',
        title: 'Exento',
        subtitle: 'Tasa 0%',
        meta: 'Sin uso reciente',
        status: 'Inactiva',
        tone: 'inactive',
      },
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'rate', label: 'Tasa (%)', type: 'number', required: true },
      {
        key: 'default',
        label: 'Uso',
        type: 'select',
        required: true,
        options: ['Normal', 'Predeterminada'],
      },
    ],
  },
};

export const SETTINGS_GROUPS = [
  {
    name: 'General',
    description: 'Organización, personas y control de acceso',
    keys: ['organization', 'users', 'roles', 'taxes'],
  },
  {
    name: 'Canales',
    description: 'Comunicación y autoservicio para clientes',
    keys: ['smtp', 'sms', 'portal'],
  },
  {
    name: 'Personalización',
    description: 'Adapta contenido y estructura del CRM',
    keys: ['templates', 'modules'],
  },
  {
    name: 'Automatización',
    description: 'Procesos que trabajan por tu equipo',
    keys: ['workflows', 'schedules'],
  },
  {
    name: 'Seguridad',
    description: 'Visibilidad, auditoría y protección',
    keys: ['activity', 'audit', 'ip-restrictions', '2fa'],
  },
  {
    name: 'Integraciones',
    description: 'Conecta SpeedLink con tu ecosistema',
    keys: ['webhooks', 'apis', 'connections'],
  },
] as const;
