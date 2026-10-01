import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Actor, ActorSchema, RecordRef, RecordRefSchema } from './common';

export type ActivityEventDocument = HydratedDocument<ActivityEvent>;

/**
 * Pestaña «Actividad» de cada registro: cambios, notas, correos, WhatsApp,
 * acciones de red, calendario… `related` permite que la ficha del cliente
 * muestre también lo que pasó en sus facturas, pagos, contratos y tickets
 * con una sola consulta.
 */
@Schema({ collection: 'activity_events', timestamps: { createdAt: true, updatedAt: false } })
export class ActivityEvent {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true }) module: string;
  @Prop({ required: true }) recordId: string;
  /** Registros relacionados donde también debe aparecer (p. ej. el cliente de una factura). */
  @Prop({ type: [RecordRefSchema], default: [] }) related: RecordRef[];

  @Prop({ required: true, enum: ['CREATE', 'EDIT', 'DELETE'] }) actionType: 'CREATE' | 'EDIT' | 'DELETE';
  /** Origen de la acción: Notas, Correos, Red, WhatsApp, Calendario, Portal… */
  @Prop({ required: true }) source: string;
  @Prop({ required: true }) title: string;
  @Prop() detail?: string;
  @Prop({ enum: ['blue', 'green', 'amber', 'violet'], default: 'blue' }) tone: string;

  /** Cambios de campos: { status: { from: 'PENDING', to: 'PAID' } }. */
  @Prop({ type: Object }) changes?: Record<string, { from: unknown; to: unknown }>;

  /** Envíos por mensaje: canal, texto y número. */
  @Prop({ enum: ['whatsapp', 'email', 'sms'] }) channel?: string;
  @Prop() message?: string;
  @Prop() phone?: string;
  @Prop() templateId?: string;

  @Prop({ type: ActorSchema, required: true }) actor: Actor;
  createdAt: Date;
}

export const ActivityEventSchema = SchemaFactory.createForClass(ActivityEvent);
ActivityEventSchema.index({ organizationId: 1, module: 1, recordId: 1, createdAt: -1 });
ActivityEventSchema.index({ organizationId: 1, 'related.module': 1, 'related.recordId': 1, createdAt: -1 });
ActivityEventSchema.index({ organizationId: 1, createdAt: -1 });
