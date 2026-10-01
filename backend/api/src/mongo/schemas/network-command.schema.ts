import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Actor, ActorSchema, RETENTION, days } from './common';

export type NetworkCommandDocument = HydratedDocument<NetworkCommand>;

/**
 * Bitácora de la red (MikroTik): crear cola, cambiar velocidad, bloquear,
 * desbloquear, cambiar IP… con los comandos RouterOS que se mandaron y lo
 * que respondió el router.
 */
@Schema({ collection: 'network_commands', timestamps: true })
export class NetworkCommand {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true }) routerId: string;
  @Prop({ required: true }) routerName: string;
  @Prop() clientId?: string;
  @Prop() clientName?: string;

  @Prop({ required: true, enum: ['provision', 'speed', 'block', 'unblock', 'remove', 'reset', 'ip', 'router', 'plan'] })
  action: string;
  @Prop({ required: true }) summary: string;
  @Prop({ type: [String], default: [] }) commands: string[];

  /**
   * simulated = router demo; manual = el usuario debe ejecutarlos (sin acceso);
   * queued/applied/failed = los ejecutó el worker contra el router.
   */
  @Prop({ required: true, enum: ['simulated', 'manual', 'queued', 'applied', 'failed'] }) status: string;
  @Prop() output?: string;
  @Prop() error?: string;
  /** Lo disparó el corte automático y no una persona. */
  @Prop({ default: false }) automatic: boolean;

  @Prop({ type: ActorSchema, required: true }) actor: Actor;
  createdAt: Date;
  updatedAt: Date;
}

export const NetworkCommandSchema = SchemaFactory.createForClass(NetworkCommand);
NetworkCommandSchema.index({ organizationId: 1, createdAt: -1 });
NetworkCommandSchema.index({ organizationId: 1, clientId: 1, createdAt: -1 });
NetworkCommandSchema.index({ routerId: 1, status: 1 });
NetworkCommandSchema.index({ createdAt: 1 }, { expireAfterSeconds: days(RETENTION.networkCommands) });
