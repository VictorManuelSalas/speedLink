import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Actor, ActorSchema } from './common';

export type MessageLogDocument = HydratedDocument<MessageLog>;

/**
 * Todo mensaje que sale al cliente o al equipo: correo y SMS (los envía el
 * worker) y WhatsApp (manual por wa.me: se registra al abrir el chat).
 * Sirve para «Último WhatsApp», no repetir avisos de corte y reportes.
 */
@Schema({ collection: 'message_logs', timestamps: true })
export class MessageLog {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true, enum: ['email', 'sms', 'whatsapp'] }) channel: 'email' | 'sms' | 'whatsapp';
  /**
   * queued/sending/sent/failed para correo y SMS.
   * opened = se abrió WhatsApp con el mensaje (no hay confirmación de entrega).
   */
  @Prop({ required: true, enum: ['queued', 'sending', 'sent', 'failed', 'opened'] }) status: string;

  @Prop() module?: string;
  @Prop() recordId?: string;
  @Prop() customerId?: string;
  @Prop() templateId?: string;
  @Prop() templateName?: string;
  /** Clave de aviso automático para no repetirlo: "cutoff-warning:INV-000123". */
  @Prop() dedupeKey?: string;

  @Prop({ type: [String], required: true }) to: string[];
  @Prop() subject?: string;
  @Prop({ required: true }) body: string;
  /** Enlaces de documentos incluidos (factura, estado de cuenta…). */
  @Prop({ type: [String], default: [] }) documentLinks: string[];

  @Prop() provider?: string;
  @Prop() providerMessageId?: string;
  @Prop() error?: string;
  @Prop({ default: 0 }) attempts: number;
  @Prop() sentAt?: Date;

  @Prop({ type: ActorSchema, required: true }) actor: Actor;
  createdAt: Date;
  updatedAt: Date;
}

export const MessageLogSchema = SchemaFactory.createForClass(MessageLog);
MessageLogSchema.index({ organizationId: 1, module: 1, recordId: 1, createdAt: -1 });
MessageLogSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });
MessageLogSchema.index({ organizationId: 1, channel: 1, status: 1, createdAt: -1 });
MessageLogSchema.index({ organizationId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
