import { Injectable, computed, inject, signal } from '@angular/core';
import { TicketStore } from '../data-access/ticket-store';
import { PortalAccessStore } from './portal-access.store';

export interface ClientPortalConfig {
  name: string;
  slug: string;
  enabled: boolean;
  showInvoices: boolean;
  showPayments: boolean;
  showTickets: boolean;
  showAttachments: boolean;
  allowProfileEdit: boolean;
  allowTicketCreation: boolean;
  primaryColor: string;
  supportEmail: string;
  /** El cliente puede subir archivos (requiere mostrar archivos). */
  allowFileUpload: boolean;
  /** Muestra al cliente el nombre de sus redes WiFi (nunca el acceso de administración). */
  showWifi: boolean;
  /**
   * Direcciones anteriores: redirigen a la actual para que no se rompan los
   * enlaces de invitaciones ya enviadas.
   */
  previousSlugs: string[];
}

export type PortalConfigErrors = Partial<Record<keyof ClientPortalConfig, string>>;

/** Rutas que un slug no puede ocupar por chocar con páginas del sistema. */
const RESERVED_SLUGS = new Set(['admin', 'api', 'login', 'portal', 'settings', 'www', 'app']);

export interface PortalProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  community: string;
  plan: string;
  speed: string;
  monthlyFee: number;
  status: string;
  ipAddress: string;
  nextBillingDate: string;
}

export interface PortalTicket {
  id: string;
  subject: string;
  description: string;
  status: 'Abierto' | 'En progreso' | 'Resuelto';
  priority: 'Baja' | 'Media' | 'Alta';
  createdAt: string;
  updatedAt: string;
}

export interface PortalAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  date: string;
  url?: string;
  /** Lo subió el propio cliente: sólo esos puede eliminarlos desde el portal. */
  uploadedByClient?: boolean;
}

const CONFIG_KEY = 'speedlink-client-portal-config';
const PROFILE_KEY = 'speedlink-client-portal-profile';
const TICKETS_KEY = 'speedlink-client-portal-tickets';
const ATTACHMENTS_KEY = 'speedlink-client-portal-attachments';

const DEFAULT_CONFIG: ClientPortalConfig = {
  name: 'Mi SpeedLink',
  slug: 'speedlink',
  enabled: true,
  showInvoices: true,
  showPayments: true,
  showTickets: true,
  showAttachments: true,
  allowProfileEdit: true,
  allowTicketCreation: true,
  primaryColor: '#2563eb',
  supportEmail: 'soporte@speedlink.mx',
  allowFileUpload: true,
  // Activo en la demostración para que la cuenta de prueba vea su WiFi.
  showWifi: true,
  previousSlugs: [],
};

const DEFAULT_PROFILE: PortalProfile = {
  id: 'SL-1044',
  name: 'José Luis Hernández',
  email: 'jose.hernandez@email.mx',
  phone: '55 4421 7603',
  address: 'Priv. Las Flores 7',
  community: 'Zumpango, Estado de México',
  plan: 'Básico',
  speed: '5 Mbps',
  monthlyFee: 300,
  status: 'Pendiente',
  ipAddress: '10.20.4.22',
  nextBillingDate: '2026-08-15',
};

const DEFAULT_TICKETS: PortalTicket[] = [
  {
    id: 'TK-2290',
    subject: 'Intermitencia y pérdida de paquetes',
    description: 'Se presentan cortes breves durante videollamadas.',
    status: 'En progreso',
    priority: 'Alta',
    createdAt: '2026-07-14T09:41:00-06:00',
    updatedAt: '2026-07-18T11:20:00-06:00',
  },
  {
    id: 'TK-2184',
    subject: 'Validar configuración de IP estática',
    description: 'Confirmar gateway, máscara y DNS del router.',
    status: 'Abierto',
    priority: 'Media',
    createdAt: '2026-06-28T10:15:00-06:00',
    updatedAt: '2026-06-28T13:32:00-06:00',
  },
];

@Injectable({ providedIn: 'root' })
export class ClientPortalStore {
  private readonly crmTickets = inject(TicketStore);
  private readonly access = inject(PortalAccessStore);
  readonly config = signal(this.read<ClientPortalConfig>(CONFIG_KEY, DEFAULT_CONFIG));
  readonly profile = signal(this.read<PortalProfile>(PROFILE_KEY, DEFAULT_PROFILE));
  readonly tickets = signal(this.read<PortalTicket[]>(TICKETS_KEY, DEFAULT_TICKETS));
  readonly authenticated = signal(
    sessionStorage.getItem('speedlink-client-portal-session') === 'active',
  );
  readonly invoices = signal([
    {
      id: 'INV-4485',
      description: 'Servicio de internet · Julio 2026',
      issuedAt: '2026-07-01',
      dueAt: '2026-07-10',
      amount: 300,
      status: 'Pagada',
    },
    {
      id: 'INV-4412',
      description: 'Servicio de internet · Junio 2026',
      issuedAt: '2026-06-01',
      dueAt: '2026-06-10',
      amount: 300,
      status: 'Pagada',
    },
    {
      id: 'INV-4520',
      description: 'Servicio de internet · Agosto 2026',
      issuedAt: '2026-08-01',
      dueAt: '2026-08-15',
      amount: 300,
      status: 'Pendiente',
    },
  ]);
  readonly payments = signal([
    {
      id: 'PAY-74021',
      date: '2026-07-08',
      method: 'Transferencia bancaria',
      reference: 'ACH-4421A',
      amount: 300,
      status: 'Aplicado',
    },
    {
      id: 'PAY-73108',
      date: '2026-06-07',
      method: 'Tarjeta',
      reference: 'VISA-4291',
      amount: 300,
      status: 'Aplicado',
    },
  ]);
  readonly attachments = signal<PortalAttachment[]>(
    this.read<PortalAttachment[]>(ATTACHMENTS_KEY, [
      {
        id: 'file-1',
        name: 'Contrato_SpeedLink.pdf',
        type: 'application/pdf',
        size: 248_400,
        date: '2025-01-30',
      },
      {
        id: 'file-2',
        name: 'Comprobante_instalacion.pdf',
        type: 'application/pdf',
        size: 184_220,
        date: '2025-01-30',
      },
    ]),
  );
  readonly openTicketCount = computed(
    () => this.tickets().filter((ticket) => ticket.status !== 'Resuelto').length,
  );

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key === CONFIG_KEY && event.newValue) {
        try {
          this.config.set({ ...DEFAULT_CONFIG, ...JSON.parse(event.newValue) });
        } catch {
          this.config.set(DEFAULT_CONFIG);
        }
      }
      if (event.key === PROFILE_KEY && event.newValue) {
        try {
          this.profile.set({ ...DEFAULT_PROFILE, ...JSON.parse(event.newValue) });
        } catch {
          this.profile.set(DEFAULT_PROFILE);
        }
      }
      if (event.key === TICKETS_KEY && event.newValue) {
        try {
          this.tickets.set(JSON.parse(event.newValue) as PortalTicket[]);
        } catch {
          this.tickets.set(DEFAULT_TICKETS);
        }
      }
    });
  }

  validateConfig(config: ClientPortalConfig): PortalConfigErrors {
    const errors: PortalConfigErrors = {};
    const name = config.name.trim();
    if (name.length < 3 || name.length > 40) errors.name = 'Entre 3 y 40 caracteres.';
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(config.slug))
      errors.slug = 'De 3 a 40 minúsculas, números o guiones; sin guion al inicio ni al final.';
    else if (RESERVED_SLUGS.has(config.slug)) errors.slug = 'Esa dirección está reservada por el sistema.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(config.supportEmail.trim()))
      errors.supportEmail = 'Correo con formato inválido.';
    if (!/^#[0-9a-f]{6}$/i.test(config.primaryColor)) errors.primaryColor = 'Color en formato #RRGGBB.';
    return errors;
  }

  /**
   * Guarda validando. Si cambia la dirección, la anterior queda como alias para
   * que los enlaces que ya tienen los clientes sigan funcionando.
   */
  saveConfig(next: ClientPortalConfig): { ok: true } | { ok: false; error: string } {
    if (Object.keys(this.validateConfig(next)).length)
      return { ok: false, error: 'Revisa los campos marcados.' };
    const current = this.config();
    const previousSlugs =
      next.slug !== current.slug
        ? [current.slug, ...current.previousSlugs].filter((slug) => slug !== next.slug).slice(0, 5)
        : current.previousSlugs.filter((slug) => slug !== next.slug);
    this.updateConfig({
      ...next,
      name: next.name.trim(),
      supportEmail: next.supportEmail.trim().toLowerCase(),
      // Crear tickets o subir archivos sin poder verlos no tiene sentido.
      allowTicketCreation: next.showTickets && next.allowTicketCreation,
      allowFileUpload: next.showAttachments && next.allowFileUpload,
      previousSlugs,
    });
    return { ok: true };
  }

  /** `current`: dirección vigente; `alias`: anterior, hay que redirigir. */
  resolveSlug(slug: string | null): 'current' | 'alias' | 'unknown' {
    const config = this.config();
    if (slug === config.slug) return 'current';
    return slug && config.previousSlugs.includes(slug) ? 'alias' : 'unknown';
  }

  updateConfig(patch: Partial<ClientPortalConfig>): void {
    this.config.update((config) => ({ ...config, ...patch }));
    localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config()));
  }

  updateProfile(patch: Partial<PortalProfile>): void {
    this.profile.update((profile) => ({ ...profile, ...patch }));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile()));
  }

  login(account: string, pin: string): boolean {
    const accountId = account.trim().toLocaleUpperCase();
    // 1044 es el PIN de demostración; el resto viene de las invitaciones.
    const valid =
      accountId === this.profile().id &&
      !this.access.isDisabled(accountId) &&
      (pin === '1044' || this.access.matches(accountId, pin));
    if (valid) {
      sessionStorage.setItem('speedlink-client-portal-session', 'active');
      this.authenticated.set(true);
    }
    return valid;
  }

  /** Para explicar al cliente por qué no entra, en vez de "PIN incorrecto". */
  isAccessDisabled(account: string): boolean {
    return this.access.isDisabled(account);
  }

  logout(): void {
    sessionStorage.removeItem('speedlink-client-portal-session');
    this.authenticated.set(false);
  }

  createTicket(
    subject: string,
    description: string,
    priority: PortalTicket['priority'],
  ): PortalTicket {
    const ticket: PortalTicket = {
      id: `TK-${2300 + this.tickets().length}`,
      subject,
      description,
      priority,
      status: 'Abierto',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tickets.update((tickets) => [ticket, ...tickets]);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(this.tickets()));
    const profile = this.profile();
    this.crmTickets.add(
      {
        id: ticket.id,
        clientId: profile.id,
        subject: ticket.subject,
        description: ticket.description,
        category: 'Otro',
        priority:
          ticket.priority === 'Alta' ? 'high' : ticket.priority === 'Baja' ? 'low' : 'medium',
        status: 'open',
        channel: 'Portal',
        assignedTo: 'Sin asignar',
        createdById: `client-${profile.id}`,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        requester: profile.name,
        comments: [],
        attachments: [],
      },
      {
        clientName: profile.name,
        clientEmail: profile.email,
        clientPhone: profile.phone,
        clientInitials: profile.name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toLocaleUpperCase(),
      },
    );
    return ticket;
  }

  addFiles(files: FileList): void {
    if (!this.config().allowFileUpload) return;
    const added = Array.from(files).map((file) => ({
      id: `file-${Date.now()}-${file.name}`,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      date: new Date().toISOString(),
      url: URL.createObjectURL(file),
      uploadedByClient: true,
    }));
    this.attachments.update((current) => [...added, ...current]);
    this.persistAttachments();
  }

  removeFile(id: string): void {
    const file = this.attachments().find((item) => item.id === id);
    if (!file?.uploadedByClient) return;
    if (file.url?.startsWith('blob:')) URL.revokeObjectURL(file.url);
    this.attachments.update((current) => current.filter((item) => item.id !== id));
    this.persistAttachments();
  }

  /** La URL blob no sobrevive a una recarga, así que no se guarda. */
  private persistAttachments(): void {
    localStorage.setItem(
      ATTACHMENTS_KEY,
      JSON.stringify(this.attachments().map(({ url: _url, ...file }) => file)),
    );
  }

  private read<T>(key: string, fallback: T): T {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value) as T;
      return Array.isArray(fallback) ? parsed : ({ ...fallback, ...parsed } as T);
    } catch {
      return fallback;
    }
  }
}
