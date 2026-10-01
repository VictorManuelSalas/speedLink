import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RETENTION, days } from './common';

export type WebhookDeliveryDocument = HydratedDocument<WebhookDelivery>;

/**
 * Cada intento de entrega de un webhook (Ajustes › Webhooks › Entregas).
 * El worker reintenta con backoff; aquí queda el último estado y cada intento.
 */
@Schema({ _id: false })
export class DeliveryAttempt {
  @Prop({ required: true }) at: Date;
  @Prop() statusCode?: number;
  @Prop() durationMs?: number;
  @Prop() error?: string;
}

@Schema({ collection: 'webhook_deliveries', timestamps: true })
export class WebhookDelivery {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true }) webhookId: string;
  @Prop({ required: true }) webhookName: string;
  /** "invoice.paid", "network.blocked"… */
  @Prop({ required: true }) event: string;
  /** Id único del evento: el receptor lo usa para ignorar duplicados. */
  @Prop({ required: true }) eventId: string;
  @Prop({ required: true }) url: string;
  /** { event, eventId, occurredAt, source: 'speedlink-crm', data }. */
  @Prop({ type: Object, required: true }) payload: Record<string, unknown>;

  @Prop({ required: true, enum: ['queued', 'sent', 'failed', 'dead'], default: 'queued' }) status: string;
  @Prop({ default: false }) test: boolean;
  @Prop({ type: [SchemaFactory.createForClass(DeliveryAttempt)], default: [] }) attempts: DeliveryAttempt[];
  @Prop() responseStatus?: number;
  /** Primeros 2 KB de la respuesta. */
  @Prop() responseBody?: string;
  @Prop() nextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const WebhookDeliverySchema = SchemaFactory.createForClass(WebhookDelivery);
WebhookDeliverySchema.index({ organizationId: 1, createdAt: -1 });
WebhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });
WebhookDeliverySchema.index({ eventId: 1, webhookId: 1 }, { unique: true });
WebhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: days(RETENTION.webhookDeliveries) });
