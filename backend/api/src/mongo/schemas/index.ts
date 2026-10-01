import { ModelDefinition } from '@nestjs/mongoose';
import { ActivityEvent, ActivityEventSchema } from './activity-event.schema';
import { AuditLog, AuditLogSchema } from './audit-log.schema';
import { JobRun, JobRunSchema } from './job-run.schema';
import { MessageLog, MessageLogSchema } from './message-log.schema';
import { NetworkCommand, NetworkCommandSchema } from './network-command.schema';
import { Notification, NotificationSchema } from './notification.schema';
import { TrafficSample, TrafficSampleSchema } from './traffic-sample.schema';
import { WebhookDelivery, WebhookDeliverySchema } from './webhook-delivery.schema';

export * from './common';
export * from './activity-event.schema';
export * from './audit-log.schema';
export * from './job-run.schema';
export * from './message-log.schema';
export * from './network-command.schema';
export * from './notification.schema';
export * from './traffic-sample.schema';
export * from './webhook-delivery.schema';

export const MONGO_MODELS: ModelDefinition[] = [
  { name: ActivityEvent.name, schema: ActivityEventSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
  { name: MessageLog.name, schema: MessageLogSchema },
  { name: WebhookDelivery.name, schema: WebhookDeliverySchema },
  { name: NetworkCommand.name, schema: NetworkCommandSchema },
  { name: TrafficSample.name, schema: TrafficSampleSchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: JobRun.name, schema: JobRunSchema },
];
