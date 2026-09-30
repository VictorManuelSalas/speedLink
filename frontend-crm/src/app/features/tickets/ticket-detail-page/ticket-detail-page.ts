import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TicketRecord, TicketStore } from '../../../core/data-access/ticket-store';
import { LanguageService } from '../../../core/i18n/language.service';
import { SessionContext } from '../../../core/auth/session-context';
import { CrmAttachment, CustomerTicket, TicketComment } from '../../../core/models/customer';
import { AttachmentPicker } from '../../../shared/attachment-picker';
import { FileItem } from '../../../shared/file-item';
import { CustomFieldsCard } from '../../operations/record-sections/custom-fields-card';
import { RecordField, RecordFieldConfig } from '../../../shared/record-field';
import {
  RecordDetailLayout,
  RecordHeader,
  RecordInformationCard,
  RecordSummary,
} from '../../../shared/record-detail-shell';

@Component({
  selector: 'app-ticket-detail-page',
  imports: [
    AttachmentPicker,
    FileItem,
    CustomFieldsCard,
    DatePipe,
    RecordDetailLayout,
    RecordField,
    RecordHeader,
    RecordInformationCard,
    RecordSummary,
    RouterLink,
  ],
  templateUrl: './ticket-detail-page.html',
  styleUrl: './ticket-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketDetailPage {
  readonly store = inject(TicketStore);
  readonly i18n = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly ticketId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly ticket = computed(() => this.store.get(this.ticketId()));
  readonly commentFilter = signal<'all' | 'internal'>('all');
  readonly commentDraft = signal('');
  readonly internalComment = signal(false);
  readonly commentAttachments = signal<ReadonlyArray<CrmAttachment>>([]);
  readonly commentReset = signal(0);
  readonly ticketFiles = signal<ReadonlyArray<CrmAttachment>>([]);
  readonly fileReset = signal(0);
  readonly descriptionEditMode = signal(false);
  readonly descriptionEditDraft = signal('');
  readonly shareMenuOpen = signal(false);
  readonly shareCopied = signal(false);
  readonly confirmDelete = signal(false);
  private readonly session = inject(SessionContext);
  readonly canDelete = computed(() => this.session.hasPermission('tickets.delete'));

  // Picklist options
  readonly statusOptions = [
    { value: 'Open', label: 'Abierto' },
    { value: 'In Progress', label: 'En progreso' },
    { value: 'Waiting', label: 'En espera' },
    { value: 'Resolved', label: 'Resuelto' },
    { value: 'Closed', label: 'Cerrado' },
  ];
  readonly priorityOptions = [
    { value: 'Low', label: 'Baja' },
    { value: 'Medium', label: 'Media' },
    { value: 'High', label: 'Alta' },
    { value: 'Urgent', label: 'Urgente' },
  ];
  readonly categoryOptions = [
    { value: 'Conectividad', label: 'Conectividad' },
    { value: 'Facturación', label: 'Facturación' },
    { value: 'Equipo', label: 'Equipo' },
    { value: 'Instalación', label: 'Instalación' },
    { value: 'Otro', label: 'Otro' },
  ];
  readonly responsableOptions = [
    { value: 'USR-001', label: 'Andrea Torres' },
    { value: 'USR-002', label: 'Carlos Mendoza' },
    { value: 'USR-003', label: 'María García' },
  ];
  constructor() {
    this.route.paramMap.subscribe((params) => this.ticketId.set(params.get('id') ?? ''));
  }
  changeStatus(ticket: CustomerTicket, status: string): void {
    this.store.updateStatus(
      ticket.id,
      status as CustomerTicket['status'],
      new Date().toISOString(),
    );
  }
  addComment(ticket: CustomerTicket): void {
    const message = this.commentDraft().trim();
    if (!message) return;
    const comment: TicketComment = {
      id: `comment-${Date.now()}`,
      message,
      author: { fullName: 'Andrea Torres', email: 'andrea.torres@speedlink.mx', initials: 'AT' },
      isInternal: this.internalComment(),
      createdAt: new Date().toISOString(),
      attachments: this.commentAttachments(),
    };
    this.store.addComment(ticket.id, comment);
    this.commentDraft.set('');
    this.internalComment.set(false);
    this.commentAttachments.set([]);
    this.commentReset.update((value) => value + 1);
  }
  saveTicketFiles(ticketId: string): void {
    this.store.addAttachments(ticketId, this.ticketFiles());
    this.ticketFiles.set([]);
    this.fileReset.update((value) => value + 1);
  }
  filteredComments(ticket: CustomerTicket): ReadonlyArray<TicketComment> {
    return ticket.comments.filter(
      (comment) => this.commentFilter() === 'all' || comment.isInternal,
    );
  }
  statusLabel(status: CustomerTicket['status']): string {
    return this.i18n.t(
      {
        open: 'Abierto',
        in_progress: 'En progreso',
        waiting: 'En espera',
        resolved: 'Resuelto',
        closed: 'Cerrado',
      }[status],
    );
  }
  ticketStatusTone(status: CustomerTicket['status']): string {
    return status === 'resolved' || status === 'closed'
      ? 'green'
      : status === 'waiting'
        ? 'amber'
        : 'blue';
  }
  openDuration(ticket: CustomerTicket): string {
    const end = ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : Date.now();
    const minutes = Math.max(0, Math.floor((end - new Date(ticket.createdAt).getTime()) / 60_000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }
  isSlaOverdue(ticket: CustomerTicket): boolean {
    return (
      !['resolved', 'closed'].includes(ticket.status) &&
      new Date(ticket.slaDueAt).getTime() < Date.now()
    );
  }
  slaLabel(ticket: CustomerTicket): string {
    if (['resolved', 'closed'].includes(ticket.status)) return this.i18n.t('Resuelto');
    if (this.isSlaOverdue(ticket)) return this.i18n.language() === 'en' ? 'Overdue' : 'Vencido';
    const hours = Math.ceil((new Date(ticket.slaDueAt).getTime() - Date.now()) / 3_600_000);
    return `${hours} h`;
  }
  customFields(ticket: CustomerTicket): ReadonlyArray<[string, string]> {
    return Object.entries(ticket.customFields ?? {}).map(([key, value]) => [key, String(value)]);
  }
  formatSize(size: number): string {
    return size < 1024 * 1024
      ? `${Math.ceil(size / 1024)} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  ticketFieldConfig(key: string, label: string, kind: RecordFieldConfig['kind'] = 'text'): RecordFieldConfig {
    const baseConfig: RecordFieldConfig = { key, label, kind, editable: true };

    if (key === 'status') {
      return {
        ...baseConfig,
        kind: 'status',
        options: this.statusOptions.map((o) => o.value),
      };
    } else if (key === 'priority') {
      return {
        ...baseConfig,
        kind: 'select',
        options: this.priorityOptions.map((o) => o.value),
        optionLabels: Object.fromEntries(this.priorityOptions.map((o) => [o.value, o.label])),
      };
    } else if (key === 'assignedTo') {
      return {
        ...baseConfig,
        kind: 'lookup',
        options: this.responsableOptions.map((o) => o.value),
        optionLabels: Object.fromEntries(this.responsableOptions.map((o) => [o.value, o.label])),
        route: ['/settings/users', baseConfig.key],
      };
    } else if (key === 'category') {
      return {
        ...baseConfig,
        kind: 'select',
        options: this.categoryOptions.map((o) => o.value),
        optionLabels: Object.fromEntries(this.categoryOptions.map((o) => [o.value, o.label])),
      };
    } else if (key === 'description') {
      return { ...baseConfig, kind: 'text' };
    }
    return baseConfig;
  }

  updateTicketField(ticketId: string, key: string, value: string): void {
    const update: Partial<CustomerTicket> = {};
    if (key === 'status') {
      update.status = value as CustomerTicket['status'];
    } else if (key === 'priority') {
      update.priority = value as CustomerTicket['priority'];
    } else if (key === 'assignedTo') {
      update.assignedTo = value;
    } else if (key === 'description') {
      update.description = value;
    } else if (key === 'category') {
      update.category = value as CustomerTicket['category'];
    }
    this.store.update(ticketId, update);
  }

  toggleShareMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.shareCopied.set(false);
    this.shareMenuOpen.update((open) => !open);
  }
  @HostListener('document:click') closeShareMenu(): void {
    this.shareMenuOpen.set(false);
  }
  /** URL absoluta del ticket, para copiar o pegar en cualquier conversación. */
  ticketLink(): string {
    return `${window.location.origin}/tickets/${this.ticketId()}`;
  }
  async copyTicketLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.ticketLink());
    } catch {
      // Navegadores sin permiso de portapapeles: selección manual como respaldo.
      const helper = document.createElement('textarea');
      helper.value = this.ticketLink();
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    this.shareCopied.set(true);
    window.setTimeout(() => {
      this.shareCopied.set(false);
      this.shareMenuOpen.set(false);
    }, 1400);
  }
  /** Ficha en texto plano lista para mandar al equipo por WhatsApp. */
  shareMessage(ticket: TicketRecord): string {
    return [
      `*Ticket ${ticket.id}* · ${ticket.subject}`,
      `Cliente: ${ticket.clientName}`,
      `Categoría: ${ticket.category}`,
      `Estado: ${this.statusLabel(ticket.status)}`,
      `Responsable: ${ticket.assignedTo || 'Sin asignar'}`,
      '',
      `Ver en el CRM: ${this.ticketLink()}`,
    ].join('\n');
  }
  whatsappShareUrl(ticket: TicketRecord): string {
    return `https://wa.me/?text=${encodeURIComponent(this.shareMessage(ticket))}`;
  }
  deleteTicket(ticketId: string): void {
    this.store.delete(ticketId);
    this.confirmDelete.set(false);
    this.router.navigate(['/tickets']);
  }

  deleteComment(ticketId: string, commentId: string): void {
    this.store.deleteComment(ticketId, commentId);
  }

  startDescriptionEdit(currentValue: string): void {
    this.descriptionEditDraft.set(currentValue);
    this.descriptionEditMode.set(true);
  }

  saveDescription(ticketId: string): void {
    const newValue = this.descriptionEditDraft().trim();
    this.descriptionEditMode.set(false);
    if (newValue && newValue !== this.ticket()?.description) {
      this.updateTicketField(ticketId, 'description', newValue);
    }
  }

  getOptionLabel(options: ReadonlyArray<{ value: string; label: string }>, value: string): string {
    return options.find((o) => o.value === value)?.label || value;
  }
}
