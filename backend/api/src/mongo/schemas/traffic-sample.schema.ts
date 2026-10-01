import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RETENTION, days } from './common';

export type TrafficSampleDocument = HydratedDocument<TrafficSample>;

@Schema({ _id: false })
export class TrafficMeta {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true }) clientId: string;
  @Prop({ required: true }) routerId: string;
}

/**
 * Lectura periódica de la cola de cada cliente (el worker la toma del router
 * cada 5 min). Colección time-series: consumo del mes, horas pico, uso por
 * plan. Se crea como time-series la primera vez que Mongoose la crea; si ya
 * existe como colección normal hay que borrarla antes.
 */
@Schema({
  collection: 'traffic_samples',
  timeseries: { timeField: 'ts', metaField: 'meta', granularity: 'minutes' },
  expireAfterSeconds: days(RETENTION.trafficSamples),
  versionKey: false,
})
export class TrafficSample {
  @Prop({ required: true }) ts: Date;
  @Prop({ type: SchemaFactory.createForClass(TrafficMeta), required: true }) meta: TrafficMeta;
  /** Bytes acumulados del contador de la cola (bajada / subida). */
  @Prop({ required: true }) rxBytes: number;
  @Prop({ required: true }) txBytes: number;
  /** Velocidad instantánea en bits/s. */
  @Prop() rxRate?: number;
  @Prop() txRate?: number;
  @Prop() online?: boolean;
}

export const TrafficSampleSchema = SchemaFactory.createForClass(TrafficSample);
