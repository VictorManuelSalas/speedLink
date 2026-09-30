import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../auth/session-context';
import { CrmAttachment, CustomerTicket, TicketComment } from '../models/customer';
import { runtimeConfig } from '../runtime-config';
import { CUSTOMERS } from './mock-crm-data';
import { TicketsApi } from './tickets-api';
import { emitWebhookEvent } from '../integrations/webhook-events';

export interface TicketRecord extends CustomerTicket {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientInitials: string;
}

@Injectable({ providedIn: 'root' })
export class TicketStore {
  private readonly api = inject(TicketsApi);
  private readonly session = inject(SessionContext);
  // Real backend only implements the Tickets domain today; everything else in
  // the app still runs on mock data. Leaving `apiBaseUrl` empty keeps this
  // store fully in-memory, exactly as before.
  private readonly useApi = !!runtimeConfig().apiBaseUrl;

  readonly tickets = signal<ReadonlyArray<TicketRecord>>(this.useApi ? [] : this.mockTickets());
  readonly openCount = computed(
    () => this.tickets().filter((ticket) => !['resolved', 'closed'].includes(ticket.status)).length,
  );

  constructor() {
    if (this.useApi) this.reload();
  }

  forClient(clientId: string): ReadonlyArray<TicketRecord> {
    return this.tickets().filter((ticket) => ticket.clientId === clientId);
  }

  get(ticketId: string): TicketRecord | undefined {
    return this.tickets().find((ticket) => ticket.id === ticketId);
  }

  add(
    ticket: CustomerTicket,
    client: Pick<TicketRecord, 'clientName' | 'clientEmail' | 'clientPhone' | 'clientInitials'>,
  ): void {
    this.tickets.update((tickets) => [{ ...ticket, ...client }, ...tickets]);
    emitWebhookEvent('ticket.created', { id: ticket.id, clientId: ticket.clientId, subject: ticket.subject, priority: ticket.priority, category: ticket.category, channel: ticket.channel });
    if (!this.useApi) return;
    const organizationId = this.session.user()?.organizationId;
    if (!organizationId) return;
    this.api
      .create({
        organizationId,
        clientId: ticket.clientId,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        channel: ticket.channel,
        assignedToId: ticket.assignedToId,
        createdById: ticket.createdById,
      })
      .subscribe({
        error: (error) => console.error('No se pudo crear el ticket en la API', error),
      });
  }

  updateStatus(ticketId: string, status: CustomerTicket['status'], updatedAt: string): void {
    const before = this.get(ticketId);
    if (before && ['resolved', 'closed'].includes(status) && !['resolved', 'closed'].includes(before.status))
      emitWebhookEvent('ticket.resolved', { id: ticketId, clientId: before.clientId, subject: before.subject, status });
    this.tickets.update((tickets) =>
      tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status,
              updatedAt,
              resolvedAt: ['resolved', 'closed'].includes(status) ? updatedAt : undefined,
            }
          : ticket,
      ),
    );
    this.syncUpdate(ticketId, { status });
  }

  update(ticketId: string, changes: Partial<TicketRecord>): void {
    this.tickets.update((tickets) =>
      tickets.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, ...changes, updatedAt: new Date().toISOString() }
          : ticket,
      ),
    );
    this.syncUpdate(ticketId, changes);
  }

  delete(ticketId: string): void {
    this.tickets.update((tickets) => tickets.filter((ticket) => ticket.id !== ticketId));
    if (!this.useApi) return;
    this.api.remove(ticketId).subscribe({
      error: (error) => console.error('No se pudo eliminar el ticket en la API', error),
    });
  }

  addComment(ticketId: string, comment: TicketComment): void {
    this.tickets.update((tickets) =>
      tickets.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, comments: [...ticket.comments, comment], updatedAt: comment.createdAt }
          : ticket,
      ),
    );
    if (!this.useApi) return;
    const authorId = this.session.user()?.id;
    if (!authorId) return;
    this.api
      .addComment(ticketId, {
        message: comment.message,
        authorId,
        isInternal: comment.isInternal,
      })
      .subscribe({
        error: (error) => console.error('No se pudo publicar el comentario en la API', error),
      });
  }

  deleteComment(ticketId: string, commentId: string): void {
    this.tickets.update((tickets) =>
      tickets.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, comments: ticket.comments.filter((c) => c.id !== commentId), updatedAt: new Date().toISOString() }
          : ticket,
      ),
    );
  }

  addAttachments(ticketId: string, attachments: ReadonlyArray<CrmAttachment>): void {
    // Attachments are still client-side blob previews (no upload endpoint wired
    // up yet), so this stays local-only even in API mode.
    this.tickets.update((tickets) =>
      tickets.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, attachments: [...ticket.attachments, ...attachments] }
          : ticket,
      ),
    );
  }

  /** Quita un archivo del ticket o, con `commentId`, de ese comentario. */
  removeAttachment(ticketId: string, attachmentId: string, commentId?: string): void {
    const keep = (files: ReadonlyArray<CrmAttachment>) => files.filter((f) => f.id !== attachmentId);
    this.tickets.update((tickets) =>
      tickets.map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        return commentId
          ? {
              ...ticket,
              comments: ticket.comments.map((comment) =>
                comment.id === commentId
                  ? { ...comment, attachments: keep(comment.attachments) }
                  : comment,
              ),
            }
          : { ...ticket, attachments: keep(ticket.attachments) };
      }),
    );
  }

  private mockTickets(): ReadonlyArray<TicketRecord> {
    return CUSTOMERS.flatMap((customer) =>
      customer.tickets.map((ticket) => ({
        ...ticket,
        clientName: customer.name,
        clientEmail: customer.email,
        clientPhone: customer.phone,
        clientInitials: customer.initials,
      })),
    );
  }

  private reload(): void {
    const organizationId = this.session.user()?.organizationId;
    if (!organizationId) return;
    this.api.list(organizationId).subscribe({
      next: (tickets) => this.tickets.set(tickets),
      error: (error) => console.error('No se pudieron cargar los tickets desde la API', error),
    });
  }

  private syncUpdate(ticketId: string, changes: Partial<TicketRecord>): void {
    if (!this.useApi) return;
    const { subject, description, status, priority, category, channel, assignedToId } = changes;
    this.api
      .update(ticketId, { subject, description, status, priority, category, channel, assignedToId })
      .subscribe({
        error: (error) => console.error('No se pudo actualizar el ticket en la API', error),
      });
  }
}
