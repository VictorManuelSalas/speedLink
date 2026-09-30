import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  ClientPortalStore,
  PortalAttachment,
  PortalTicket,
  PORTAL_FAULT_TYPES,
  PortalInvoice,
} from '../../core/portal/client-portal.store';
import { CrmAttachment } from '../../core/models/customer';
import { DeviceAccessStore } from '../../core/equipment/device-access.store';
import { WIFI_BANDS } from '../../core/equipment/device-access.model';
import { OperationalStore } from '../operations/operational-store';
import { MikrotikStore } from '../../core/network/mikrotik.store';
import { formatGb, monthUsage, speedLabel, trafficNow } from '../../core/network/mikrotik.model';
import { FilePreviewModal } from '../../shared/file-preview-modal';
import { FileViewer, NO_PREVIEW_MIME, downloadAttachment } from '../../shared/file-viewer.service';

type PortalTab = 'Resumen' | 'Mi perfil' | 'Facturación' | 'Tickets' | 'Archivos';

@Component({
  selector: 'app-client-portal-page',
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe, DecimalPipe, FilePreviewModal],
  templateUrl: './client-portal-page.html',
  styleUrl: './client-portal-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientPortalPage {
  readonly store = inject(ClientPortalStore);
  private readonly route = inject(ActivatedRoute);
  readonly activeTab = signal<PortalTab>('Resumen');
  readonly editingProfile = signal(false);
  readonly ticketComposerOpen = signal(false);
  readonly selectedTicket = signal<PortalTicket | null>(null);
  private readonly viewer = inject(FileViewer);
  /** Archivo con el Eliminar pendiente de confirmar. */
  readonly confirmDeleteId = signal<string | null>(null);
  /** Documentos de demostración sin archivo real: se generan una vez. */
  private readonly placeholderUrls = new Map<string, string>();
  readonly loginError = signal('');
  readonly toast = signal('');
  readonly today = new Date();
  account = '';
  pin = '';
  ticketSubject = '';
  ticketDescription = '';
  ticketPriority: PortalTicket['priority'] = 'Media';
  ticketFault = 'sin-internet';
  readonly faultTypes = PORTAL_FAULT_TYPES;
  /** Respuesta del cliente en el detalle del ticket. */
  readonly replyDraft = signal('');
  /** Factura que se está pagando en línea. */
  readonly paying = signal<PortalInvoice | null>(null);
  profileName = '';
  profileEmail = '';
  profilePhone = '';
  profileAddress = '';
  profileCommunity = '';
  private readonly router = inject(Router);
  private readonly deviceAccess = inject(DeviceAccessStore);
  private readonly mikrotik = inject(MikrotikStore);
  /**
   * Estado real del servicio si el cliente tiene cola en MikroTik: velocidad,
   * consumo del mes y si está suspendido. Sin MikroTik se muestra lo de la ficha.
   */
  readonly netService = computed(() => {
    if (!this.mikrotik.connected()) return null;
    const sub = this.mikrotik.subscriber(this.store.profile().id);
    if (!sub) return null;
    const speed = this.mikrotik.appliedSpeed(sub);
    const traffic = trafficNow(sub.customerId, speed, sub.blocked);
    const usage = monthUsage(sub.customerId, speed, { blockedAt: sub.blockedAt, since: sub.countersResetAt });
    return {
      speed: speedLabel(speed),
      plan: this.mikrotik.planFor(sub.customerId).label,
      status: traffic.status,
      blocked: sub.blocked,
      forPayment: sub.blockReason === 'Falta de pago',
      month: formatGb(usage.download + usage.upload),
      ip: sub.ip,
    };
  });
  private readonly operations = inject(OperationalStore);
  /**
   * Redes activas del equipo asignado al cliente. Sólo nombre y banda: la
   * contraseña llegará del servidor y el acceso de administración nunca se muestra.
   */
  readonly wifiNetworks = computed(() => {
    const clientId = this.store.profile().id;
    return this.operations
      .recordsFor('assignments')
      .filter((assignment) => assignment['clientId'] === clientId && assignment['status'] === 'ACTIVE')
      .flatMap((assignment) => this.deviceAccess.access(String(assignment['equipmentId'] ?? '')).wifi)
      .filter((network) => network.enabled);
  });
  wifiBandLabel(band: string): string {
    return WIFI_BANDS.find((item) => item.value === band)?.label ?? band;
  }
  /** Señal y no snapshot: al redirigir se reutiliza el componente y cambia el parámetro. */
  private readonly slugParam = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );
  readonly validSlug = computed(() => this.store.resolveSlug(this.slugParam()) === 'current');
  /** Una dirección anterior lleva a la vigente: los enlaces de invitaciones siguen sirviendo. */
  private readonly redirectAlias = effect(() => {
    if (this.store.resolveSlug(this.slugParam()) === 'alias')
      void this.router.navigate(['/portal', this.store.config().slug], { replaceUrl: true });
  });
  readonly tabs = computed<PortalTab[]>(() => [
    'Resumen',
    'Mi perfil',
    ...(this.store.config().showInvoices || this.store.config().showPayments
      ? ['Facturación' as PortalTab]
      : []),
    ...(this.store.config().showTickets ? ['Tickets' as PortalTab] : []),
    ...(this.store.config().showAttachments ? ['Archivos' as PortalTab] : []),
  ]);
  private readonly enforceVisibleTab = effect(() => {
    if (!this.tabs().includes(this.activeTab())) this.activeTab.set('Resumen');
  });

  firstName(): string {
    return this.store.profile().name.split(' ')[0];
  }
  initials(): string {
    return this.store
      .profile()
      .name.split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }
  fillDemo(): void {
    this.account = 'SL-1044';
    this.pin = '1044';
    this.loginError.set('');
  }
  login(): void {
    if (this.store.login(this.account, this.pin)) return;
    this.loginError.set(
      this.store.isAccessDisabled(this.account)
        ? 'Tu acceso al portal está deshabilitado. Contacta a soporte para reactivarlo.'
        : 'El número de cliente o PIN no son correctos.',
    );
  }
  startProfileEdit(): void {
    const profile = this.store.profile();
    this.profileName = profile.name;
    this.profileEmail = profile.email;
    this.profilePhone = profile.phone;
    this.profileAddress = profile.address;
    this.profileCommunity = profile.community;
    this.editingProfile.set(true);
  }
  saveProfile(): void {
    if (!this.store.config().allowProfileEdit) return;
    this.store.updateProfile({
      name: this.profileName,
      email: this.profileEmail,
      phone: this.profilePhone,
      address: this.profileAddress,
      community: this.profileCommunity,
    });
    this.editingProfile.set(false);
    this.showToast('Información actualizada');
  }
  openTicketComposer(): void {
    if (!this.store.config().allowTicketCreation) return;
    this.ticketSubject = '';
    this.ticketDescription = '';
    this.ticketPriority = 'Media';
    this.ticketFault = 'sin-internet';
    this.ticketComposerOpen.set(true);
  }
  createTicket(): void {
    if (!this.store.config().allowTicketCreation) return;
    if (!this.ticketSubject.trim() || !this.ticketDescription.trim()) return;
    this.store.createTicket(
      this.ticketSubject.trim(),
      this.ticketDescription.trim(),
      this.ticketPriority,
      this.ticketFault,
    );
    this.ticketComposerOpen.set(false);
    this.activeTab.set('Tickets');
    this.showToast('Ticket creado correctamente');
  }
  /** Ticket abierto en el detalle, siempre con los datos vivos del CRM. */
  readonly liveTicket = computed(() => {
    const selected = this.selectedTicket();
    return selected ? (this.store.tickets().find((ticket) => ticket.id === selected.id) ?? selected) : null;
  });
  sendReply(ticketId: string): void {
    const message = this.replyDraft().trim();
    if (!message) return;
    this.store.replyToTicket(ticketId, message);
    this.replyDraft.set('');
    this.showToast('Respuesta enviada');
  }
  confirmPayment(): void {
    const invoice = this.paying();
    if (!invoice) return;
    const result = this.store.payInvoice(invoice.id);
    this.paying.set(null);
    this.showToast(result.ok ? `Pago aprobado · referencia ${result.reference}` : result.error);
  }
  uploadFiles(event: Event): void {
    if (!this.store.config().showAttachments) return;
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.store.addFiles(input.files);
      this.showToast(`${input.files.length} archivo(s) agregado(s)`);
      input.value = '';
    }
  }
  viewFile(file: PortalAttachment): void {
    this.confirmDeleteId.set(null);
    this.viewer.open(
      this.toAttachment(file),
      file.uploadedByClient ? () => this.deleteFile(file) : undefined,
    );
  }
  downloadFile(file: PortalAttachment): void {
    void downloadAttachment(this.toAttachment(file));
  }
  deleteFile(file: PortalAttachment): void {
    this.store.removeFile(file.id);
    this.confirmDeleteId.set(null);
    this.showToast(`${file.name} eliminado`);
  }
  /**
   * Adapta el archivo del portal al visor compartido. Sin `url` (documentos de
   * demostración, o subidos antes de recargar) no hay contenido que mostrar:
   * se descarga un documento de referencia y el visor avisa que no hay vista previa.
   */
  private toAttachment(file: PortalAttachment): CrmAttachment {
    let url = file.url ?? this.placeholderUrls.get(file.id);
    if (!url) {
      url = URL.createObjectURL(
        new Blob([`Documento del portal: ${file.name}`], { type: 'text/plain' }),
      );
      this.placeholderUrls.set(file.id, url);
    }
    return {
      id: file.id,
      fileName: file.name,
      mimeType: file.url ? file.type : NO_PREVIEW_MIME,
      size: file.size,
      url,
      createdAt: file.date,
    };
  }
  private showToast(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2500);
  }
}
