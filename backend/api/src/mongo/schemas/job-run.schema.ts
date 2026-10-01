import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RETENTION, days } from './common';

export type JobRunDocument = HydratedDocument<JobRun>;

/**
 * Historial de trabajos del worker (facturación del mes, cortes, recordatorios,
 * importaciones…). BullMQ guarda el estado vivo en Redis; esto es lo que el
 * CRM muestra y lo que queda después de que Redis limpia los trabajos.
 */
@Schema({ collection: 'job_runs', timestamps: true })
export class JobRun {
  @Prop() organizationId?: string;
  @Prop({ required: true }) queue: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) jobId: string;
  @Prop() scheduleId?: string;
  @Prop({ required: true, enum: ['running', 'completed', 'failed'] }) status: string;
  @Prop({ default: 1 }) attempt: number;
  @Prop({ required: true }) startedAt: Date;
  @Prop() finishedAt?: Date;
  @Prop() durationMs?: number;
  /** Resumen: { invoicesCreated: 120, skipped: 3 }. */
  @Prop({ type: Object }) result?: Record<string, unknown>;
  @Prop() error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const JobRunSchema = SchemaFactory.createForClass(JobRun);
JobRunSchema.index({ organizationId: 1, queue: 1, createdAt: -1 });
JobRunSchema.index({ jobId: 1, attempt: 1 }, { unique: true });
JobRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: days(RETENTION.jobRuns) });
