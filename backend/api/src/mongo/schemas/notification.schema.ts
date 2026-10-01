import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RecordRef, RecordRefSchema, RETENTION, days } from './common';

export type NotificationDocument = HydratedDocument<Notification>;

/** Campana del CRM: pago recibido, ticket asignado, factura vencida, falla del worker… */
@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true }) userId: string;
  /** payment.received, ticket.assigned, invoice.overdue, lead.assigned, job.failed… */
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) title: string;
  @Prop() message?: string;
  /** Ruta del CRM a abrir: "/invoices/ckx…". */
  @Prop() link?: string;
  @Prop({ type: RecordRefSchema }) source?: RecordRef;
  @Prop({ default: false }) isRead: boolean;
  @Prop() readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ organizationId: 1, userId: 1, isRead: 1, createdAt: -1 });
// Las leídas se borran solas (RETENTION.readNotifications días).
NotificationSchema.index({ readAt: 1 }, { expireAfterSeconds: days(RETENTION.readNotifications) });
