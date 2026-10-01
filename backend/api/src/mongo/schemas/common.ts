import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Quién hizo la acción. Se guarda el nombre para que el historial no cambie si el usuario se borra. */
@Schema({ _id: false })
export class Actor {
  /** id del usuario; null para el sistema, el worker o el cliente del portal. */
  @Prop({ type: String, default: null }) id: string | null;
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['user', 'system', 'worker', 'client'], default: 'user' }) kind: 'user' | 'system' | 'worker' | 'client';
}
export const ActorSchema = SchemaFactory.createForClass(Actor);

/** Referencia a un registro de Postgres (módulo nativo o cm_*). */
@Schema({ _id: false })
export class RecordRef {
  @Prop({ required: true }) module: string;
  @Prop({ required: true }) recordId: string;
}
export const RecordRefSchema = SchemaFactory.createForClass(RecordRef);

/** Días a conservar las colecciones de bitácora antes de que Mongo las borre (TTL). */
export const RETENTION = {
  webhookDeliveries: 90,
  jobRuns: 30,
  networkCommands: 365,
  trafficSamples: 90,
  readNotifications: 60,
} as const;

export const days = (n: number) => n * 24 * 60 * 60;
