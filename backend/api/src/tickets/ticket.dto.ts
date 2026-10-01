import { TicketCategory, TicketChannel, TicketPriority, TicketStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// TODO(auth): organizationId y los ids de autor saldrán del JWT, no del body.

export class CreateTicketDto {
  @IsString() @IsNotEmpty() organizationId: string;
  @IsString() @IsNotEmpty() clientId: string;
  @IsString() @IsNotEmpty() @MaxLength(160) subject: string;
  @IsString() @IsNotEmpty() description: string;
  @IsEnum(TicketStatus) @IsOptional() status?: TicketStatus;
  @IsEnum(TicketPriority) @IsOptional() priority?: TicketPriority;
  @IsEnum(TicketCategory) @IsOptional() category?: TicketCategory;
  @IsEnum(TicketChannel) @IsOptional() channel?: TicketChannel;
  @IsString() @IsOptional() faultType?: string;
  @IsString() @IsOptional() @MaxLength(120) requester?: string;
  @IsDateString() @IsOptional() slaDueAt?: string;
  @IsString() @IsOptional() assignedToId?: string;
  /** Vacío cuando lo abre el cliente desde el portal. */
  @IsString() @IsOptional() createdById?: string;
  @IsObject() @IsOptional() customFields?: Record<string, unknown>;
}

export class UpdateTicketDto {
  @IsString() @IsOptional() @MaxLength(160) subject?: string;
  @IsString() @IsOptional() description?: string;
  @IsEnum(TicketStatus) @IsOptional() status?: TicketStatus;
  @IsEnum(TicketPriority) @IsOptional() priority?: TicketPriority;
  @IsEnum(TicketCategory) @IsOptional() category?: TicketCategory;
  @IsEnum(TicketChannel) @IsOptional() channel?: TicketChannel;
  @IsDateString() @IsOptional() slaDueAt?: string;
  @IsString() @IsOptional() assignedToId?: string;
  @IsObject() @IsOptional() customFields?: Record<string, unknown>;
}

export class CreateTicketCommentDto {
  @IsString() @IsNotEmpty() message: string;
  /** Vacío si responde el cliente desde el portal (fromClient = true). */
  @IsString() @IsOptional() authorId?: string;
  @IsBoolean() @IsOptional() fromClient?: boolean;
  @IsBoolean() @IsOptional() isInternal?: boolean;
}

export class CreateAttachmentDto {
  @IsString() @IsNotEmpty() organizationId: string;
  @IsString() @IsNotEmpty() fileName: string;
  @IsString() @IsNotEmpty() mimeType: string;
  @IsInt() @Min(0) size: number;
  /** Ruta en el bucket que devolvió la subida firmada. */
  @IsString() @IsNotEmpty() storageKey: string;
  @IsString() @IsOptional() uploadedById?: string;
  @IsBoolean() @IsOptional() uploadedByClient?: boolean;
  @IsBoolean() @IsOptional() visibleToClient?: boolean;
  /** Registro dueño cuando no es nota ni ticket: { module: 'invoices', recordId }. */
  @IsString() @IsOptional() module?: string;
  @IsString() @IsOptional() recordId?: string;
  @IsString() @IsOptional() noteId?: string;
  @IsString() @IsOptional() ticketId?: string;
  @IsString() @IsOptional() ticketCommentId?: string;
}
