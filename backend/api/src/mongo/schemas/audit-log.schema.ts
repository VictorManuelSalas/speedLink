import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Actor, ActorSchema } from './common';

export type AuditLogDocument = HydratedDocument<AuditLog>;

export const AUDIT_CATEGORIES = ['Acceso', 'Usuarios', 'Roles', 'Configuración', 'Red', 'Datos', 'Secretos'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/**
 * Bitácora de seguridad (Ajustes › Auditoría): inicios de sesión, cambios de
 * usuarios, roles, conexiones, routers, borrados y cada vez que alguien
 * revela una contraseña de equipo o WiFi. Solo se agrega; nunca se edita.
 */
@Schema({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true, enum: AUDIT_CATEGORIES }) category: AuditCategory;
  /** "Inicio de sesión", "Rol cambiado", "Credenciales reveladas"… */
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) target: string;
  @Prop() detail?: string;
  @Prop({ enum: ['info', 'warning', 'critical'], default: 'info' }) severity: 'info' | 'warning' | 'critical';

  @Prop() module?: string;
  @Prop() recordId?: string;
  /** Estado antes y después, sin secretos. */
  @Prop({ type: Object }) before?: Record<string, unknown>;
  @Prop({ type: Object }) after?: Record<string, unknown>;

  @Prop({ type: ActorSchema, required: true }) actor: Actor;
  @Prop() ip?: string;
  @Prop() userAgent?: string;
  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, category: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, 'actor.id': 1, createdAt: -1 });
