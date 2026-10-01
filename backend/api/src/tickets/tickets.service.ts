import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TicketCategory, TicketChannel, TicketPriority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAttachmentDto,
  CreateTicketCommentDto,
  CreateTicketDto,
  UpdateTicketDto,
} from './ticket.dto';

const ticketInclude = {
  client: { select: { id: true, code: true, name: true, email: true, phone: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: { where: { deletedAt: null } },
    },
  },
  attachments: { where: { deletedAt: null } },
};

/** Horas de SLA por prioridad (las mismas del frontend). */
const SLA_HOURS: Record<TicketPriority, number> = { LOW: 48, MEDIUM: 24, HIGH: 8, CRITICAL: 4 };

/** El frontend todavía manda categoría y canal dentro de customFields en español. */
const CATEGORY_BY_LABEL: Record<string, TicketCategory> = {
  Conectividad: 'CONNECTIVITY',
  Facturación: 'BILLING',
  Equipo: 'EQUIPMENT',
  Instalación: 'INSTALLATION',
  Otro: 'OTHER',
};
const CHANNEL_BY_LABEL: Record<string, TicketChannel> = {
  Teléfono: 'PHONE',
  WhatsApp: 'WHATSAPP',
  Correo: 'EMAIL',
  Portal: 'PORTAL',
};

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string, clientId?: string, status?: TicketStatus, search?: string) {
    return this.prisma.ticket.findMany({
      where: {
        organizationId,
        clientId,
        status,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { folio: { contains: search, mode: 'insensitive' as const } },
                { subject: { contains: search, mode: 'insensitive' as const } },
                { description: { contains: search, mode: 'insensitive' as const } },
                { client: { name: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      include: ticketInclude,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async get(id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, deletedAt: null },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async create(dto: CreateTicketDto) {
    const priority = dto.priority ?? TicketPriority.MEDIUM;
    const legacy = (dto.customFields ?? {}) as { category?: string; channel?: string };
    const folio = await this.nextFolio(dto.organizationId);
    return this.prisma.ticket.create({
      data: {
        ...dto,
        folio,
        priority,
        category: dto.category ?? CATEGORY_BY_LABEL[legacy.category ?? ''] ?? TicketCategory.OTHER,
        channel: dto.channel ?? CHANNEL_BY_LABEL[legacy.channel ?? ''] ?? TicketChannel.PHONE,
        slaDueAt: dto.slaDueAt ? new Date(dto.slaDueAt) : new Date(Date.now() + SLA_HOURS[priority] * 3_600_000),
        customFields: dto.customFields as Prisma.InputJsonValue | undefined,
      },
      include: ticketInclude,
    });
  }

  async update(id: string, dto: UpdateTicketDto) {
    await this.get(id);
    const resolved = dto.status === TicketStatus.RESOLVED || dto.status === TicketStatus.CLOSED;
    return this.prisma.ticket.update({
      where: { id },
      data: {
        ...dto,
        slaDueAt: dto.slaDueAt ? new Date(dto.slaDueAt) : undefined,
        customFields: dto.customFields as Prisma.InputJsonValue | undefined,
        ...(dto.status
          ? {
              resolvedAt: resolved ? new Date() : null,
              closedAt: dto.status === TicketStatus.CLOSED ? new Date() : null,
            }
          : {}),
      },
      include: ticketInclude,
    });
  }

  async remove(id: string) {
    await this.get(id);
    return this.prisma.ticket.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addComment(ticketId: string, dto: CreateTicketCommentDto) {
    const ticket = await this.get(ticketId);
    if (!dto.authorId && !dto.fromClient) {
      throw new BadRequestException('A comment needs an author or fromClient');
    }
    const [comment] = await this.prisma.$transaction([
      this.prisma.ticketComment.create({
        data: { ticketId, ...dto },
        include: {
          author: { select: { id: true, name: true, email: true } },
          attachments: true,
        },
      }),
      // Primera respuesta pública del equipo: mide el tiempo de respuesta.
      ...(!ticket.firstResponseAt && dto.authorId && !dto.isInternal
        ? [this.prisma.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: new Date() } })]
        : []),
    ]);
    return comment;
  }

  async addAttachment(dto: CreateAttachmentDto) {
    const parents = [dto.noteId, dto.ticketId, dto.ticketCommentId, dto.recordId].filter(Boolean);
    if (parents.length !== 1) {
      throw new BadRequestException('An attachment must belong to exactly one parent');
    }
    const owner = await this.ownerOf(dto);
    return this.prisma.attachment.create({ data: { ...dto, ...owner } });
  }

  /** Registro al que pertenece el archivo, para listarlo en su ficha. */
  private async ownerOf(dto: CreateAttachmentDto): Promise<{ module: string; recordId: string }> {
    if (dto.ticketId) return { module: 'tickets', recordId: dto.ticketId };
    if (dto.ticketCommentId) {
      const comment = await this.prisma.ticketComment.findUnique({ where: { id: dto.ticketCommentId } });
      if (!comment) throw new NotFoundException('Comment not found');
      return { module: 'tickets', recordId: comment.ticketId };
    }
    if (dto.noteId) {
      const note = await this.prisma.note.findUnique({ where: { id: dto.noteId } });
      if (!note) throw new NotFoundException('Note not found');
      return { module: note.module, recordId: note.recordId };
    }
    if (!dto.module) throw new BadRequestException('module is required with recordId');
    return { module: dto.module, recordId: dto.recordId! };
  }

  /** TK-000001, TK-000002… por organización; el incremento es atómico en Postgres. */
  private async nextFolio(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: { organizationId_key: { organizationId, key: 'tickets' } },
      create: { organizationId, key: 'tickets', prefix: 'TK', next: 2 },
      update: { next: { increment: 1 } },
    });
    const number = sequence.next - 1;
    return `${sequence.prefix}-${String(number).padStart(sequence.padding, '0')}`;
  }
}
