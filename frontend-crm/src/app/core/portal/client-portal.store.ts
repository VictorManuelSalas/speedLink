import { Injectable, computed, inject, signal } from '@angular/core';
import { TicketStore, TicketRecord } from '../data-access/ticket-store';
import { OperationalStore } from '../../features/operations/operational-store';
import { ConnectionsStore } from '../connections/connections-store';
import { PAYMENT_PROVIDERS } from '../connections/connections.model';
import { documentLink } from '../documents/shared-documents';
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
  status: 'Abierto' | 'En progreso' | 'En espera' | 'Resuelto';
  priority: 'Baja' | 'Media' | 'Alta';
  createdAt: string;
  updatedAt: string;
  category?: string;
  /** Quién lo atiende (sin exponer datos internos del equipo). */
  assignedTo?: string;
  /** Respuestas públicas del equipo; las notas internas nunca llegan al portal. */
  replies?: ReadonlyArray<{ id: string; author: string; message: string; createdAt: string }>;
  /** Etapas del seguimiento: recibido → en atención → resuelto. */
  steps?: ReadonlyArray<{ label: string; done: boolean; at?: string }>;
}

/** Tipos de falla que el cliente puede reportar y su categoría en el CRM. */
export const PORTAL_FAULT_TYPES: ReadonlyArray<{ value: string; label: string; category: 'Conectividad' | 'Equipo' | 'Facturación' | 'Otro' }> = [
  { value: 'sin-internet', label: 'No tengo internet', category: 'Conectividad' },
  { value: 'lento', label: 'El internet está lento', category: 'Conectividad' },
  { value: 'intermitente', label: 'Se corta a ratos', category: 'Conectividad' },
  { value: 'equipo', label: 'Problema con mi módem o router', category: 'Equipo' },
  { value: 'factura', label: 'Duda con mi factura o pago', category: 'Facturación' },
  { value: 'otro', label: 'Otro', category: 'Otro' },
];

export interface PortalInvoice {
  id: string;
  folio: string;
  description: string;
  issuedAt: string;
  dueAt: string;
  amount: number;
  balance: number;
  status: 'Pagada' | 'Pendiente' | 'Vencida';
  documentUrl: string;
}

export interface PortalPayment {
  id: string;
  date: string;
  method: string;
  reference: string;
  amount: number;
  status: string;
  documentUrl: string;
}

const TICKET_STATUS: Readonly<Record<string, PortalTicket['status']>> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  waiting: 'En espera',
  resolved: 'Resuelto',
  closed: 'Resuelto',
};
const TICKET_PRIORITY: Readonly<Record<string, PortalTicket['priority']>> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Alta',
};
const PAYMENT_METHOD: Readonly<Record<string, string>> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CREDIT_CARD: 'Tarjeta',
  DEBIT_CARD: 'Tarjeta de débito',
  OTHER: 'Otro',
};

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


@Injectable({ providedIn: 'root' })
export class ClientPortalStore {
  private readonly crmTickets = inject(TicketStore);
  private readonly access = inject(PortalAccessStore);
  private readonly ops = inject(OperationalStore);
  private readonly connections = inject(ConnectionsStore);
  readonly config = signal(this.read<ClientPortalConfig>(CONFIG_KEY, DEFAULT_CONFIG));
  readonly profile = signal(this.read<PortalProfile>(PROFILE_KEY, DEFAULT_PROFILE));
  /** Los tickets del cliente en el CRM, con su estado y respuestas reales. */
  readonly tickets = computed<PortalTicket[]>(() =>
    this.crmTickets
      .forClient(this.profile().id)
      .filter((ticket) => !ticket.deletedAt)
      .map((ticket) => this.toPortalTicket(ticket))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  readonly authenticated = signal(
    sessionStorage.getItem('speedlink-client-portal-session') === 'active',
  );
  /** Facturas del cliente en el CRM, con su saldo y enlace de descarga. */
  readonly invoices = computed<PortalInvoice[]>(() => {
    const clientId = this.profile().id;
    const payments = this.ops.recordsFor('payments');
    return this.ops
      .recordsFor('invoices')
      .filter((invoice) => invoice['clientId'] === clientId && invoice['status'] !== 'CANCELLED' && invoice['status'] !== 'DRAFT')
      .map((invoice) => {
        const paid = payments
          .filter((payment) => payment['invoiceId'] === invoice.id || payment['invoice'] === invoice.id || (!!invoice['folio'] && payment['invoice'] === invoice['folio']))
          .reduce((sum, payment) => sum + (Number(payment['amount']) || 0), 0);
        const total = Number(invoice['total']) || 0;
        const balance = invoice['status'] === 'PAID' ? 0 : Math.max(0, total - paid);
        const due = String(invoice['dueDate'] ?? '');
        const overdue = balance > 0 && (invoice['status'] === 'OVERDUE' || (!!due && due.slice(0, 10) < new Date().toISOString().slice(0, 10)));
        return {
          id: invoice.id,
          folio: String(invoice['folio'] ?? invoice.id),
          description: String(invoice['description'] ?? 'Servicio de internet'),
          issuedAt: String(invoice['issueDate'] ?? ''),
          dueAt: due,
          amount: total,
          balance,
          status: balance === 0 ? 'Pagada' : overdue ? 'Vencida' : 'Pendiente',
          documentUrl: documentLink('invoice', invoice.id),
        } satisfies PortalInvoice;
      })
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  });
  readonly payments = computed<PortalPayment[]>(() =>
    this.ops
      .recordsFor('payments')
      .filter((payment) => payment['clientId'] === this.profile().id)
      .map((payment) => ({
        id: payment.id,
        date: String(payment['paidAt'] ?? ''),
        method: PAYMENT_METHOD[String(payment['method'] ?? '')] ?? String(payment['method'] ?? ''),
        reference: String(payment['reference'] ?? '—'),
        amount: Number(payment['amount']) || 0,
        status: 'Aplicado',
        documentUrl: documentLink('payment', payment.id),
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  readonly balanceDue = computed(() => this.invoices().reduce((sum, invoice) => sum + invoice.balance, 0));

  /**
   * Pago en línea: aparece si la conexión de pagos está configurada. En modo
   * pruebas se simula un cobro aprobado (sin pedir datos de tarjeta); en
   * producción el cobro real lo hará el servidor con el proveedor.
   */
  readonly onlinePayments = computed(() => {
    const status = this.connections.statuses().payments;
    if (status === 'disabled' || status === 'incomplete') return null;
    const config = this.connections.state().payments;
    return {
      provider: PAYMENT_PROVIDERS.find((item) => item.value === config.provider)?.label ?? config.provider,
      sandbox: config.mode === 'sandbox',
      available: config.mode === 'sandbox' || status === 'active',
    };
  });

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
    faultType = 'otro',
  ): PortalTicket {
    const profile = this.profile();
    const fault = PORTAL_FAULT_TYPES.find((item) => item.value === faultType) ?? PORTAL_FAULT_TYPES[PORTAL_FAULT_TYPES.length - 1];
    const now = new Date().toISOString();
    const id = `TK-${2300 + this.crmTickets.tickets().length}`;
    this.crmTickets.add(
      {
        id,
        clientId: profile.id,
        subject,
        description,
        category: fault.category,
        priority: priority === 'Alta' ? 'high' : priority === 'Baja' ? 'low' : 'medium',
        status: 'open',
        channel: 'Portal',
        assignedTo: 'Sin asignar',
        createdById: `client-${profile.id}`,
        createdAt: now,
        updatedAt: now,
        // Sin internet es lo más urgente: 4 h; lo demás, 24 h.
        slaDueAt: new Date(Date.now() + (fault.value === 'sin-internet' ? 4 : 24) * 3600_000).toISOString(),
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
    return this.tickets().find((ticket) => ticket.id === id) ?? {
      id,
      subject,
      description,
      priority,
      status: 'Abierto',
      createdAt: now,
      updatedAt: now,
    };
  }

  /** Respuesta del cliente a su ticket: llega al CRM como comentario público. */
  replyToTicket(ticketId: string, message: string): void {
    const profile = this.profile();
    this.crmTickets.addComment(ticketId, {
      id: `cm-${Date.now().toString(36)}`,
      message: message.trim(),
      author: { fullName: profile.name, email: profile.email, initials: profile.name.slice(0, 2).toUpperCase() },
      isInternal: false,
      createdAt: new Date().toISOString(),
      attachments: [],
    });
  }

  /**
   * Cobro de una factura en línea. En modo pruebas se registra como pago con
   * tarjeta aprobado; se ve en el CRM, dispara los webhooks y, si el cliente
   * estaba cortado por adeudo, aparece en «Ya pagaron y siguen bloqueados».
   */
  payInvoice(invoiceId: string): { ok: true; reference: string } | { ok: false; error: string } {
    const online = this.onlinePayments();
    if (!online?.available) return { ok: false, error: 'El pago en línea aún no está disponible.' };
    if (!online.sandbox) return { ok: false, error: 'El cobro real se activa cuando el CRM tenga servidor.' };
    const invoice = this.invoices().find((item) => item.id === invoiceId);
    if (!invoice || invoice.balance <= 0) return { ok: false, error: 'Esta factura ya no tiene saldo.' };
    const profile = this.profile();
    const reference = `SBX-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    this.ops.add('payments', {
      id: `PAY-${Date.now().toString(36).toUpperCase()}`,
      clientId: profile.id,
      client: profile.name,
      invoiceId: invoice.id,
      invoice: invoice.folio,
      amount: invoice.balance,
      method: 'CREDIT_CARD',
      reference,
      paidAt: now,
      notes: `Pago en línea desde el portal (${online.provider}, modo pruebas)`,
      createdAt: now,
      updatedAt: now,
    });
    this.ops.update('invoices', invoice.id, { status: 'PAID' });
    return { ok: true, reference };
  }

  private toPortalTicket(ticket: TicketRecord): PortalTicket {
    const status = TICKET_STATUS[ticket.status] ?? 'Abierto';
    const assigned = ticket.assignedTo && ticket.assignedTo !== 'Sin asignar' ? ticket.assignedTo : undefined;
    const resolved = ticket.status === 'resolved' || ticket.status === 'closed';
    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status,
      priority: TICKET_PRIORITY[ticket.priority] ?? 'Media',
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      category: ticket.category,
      assignedTo: assigned,
      replies: ticket.comments
        .filter((comment) => !comment.isInternal)
        .map((comment) => ({ id: comment.id, author: comment.author.fullName, message: comment.message, createdAt: comment.createdAt })),
      steps: [
        { label: 'Recibimos tu reporte', done: true, at: ticket.createdAt },
        { label: assigned ? `${assigned} lo está atendiendo` : 'Asignando a un técnico', done: !!assigned || ticket.status !== 'open' },
        { label: 'Resuelto', done: resolved, at: ticket.resolvedAt },
      ],
    };
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
