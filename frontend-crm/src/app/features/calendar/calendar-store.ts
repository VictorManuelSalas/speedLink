import { Injectable, inject, signal } from '@angular/core';
import { OperationalStore } from '../operations/operational-store';
import { LanguageService } from '../../core/i18n/language.service';

export type CalendarEventType = 'INSTALLATION' | 'FOLLOW_UP' | 'PAYMENT' | 'MAINTENANCE';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  type: CalendarEventType;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  client: string;
  assignedTo: string;
  allDay: boolean;
  leadId?: string;
  clientId?: string;
}

@Injectable({ providedIn: 'root' })
export class CalendarStore {
  private readonly i18n = inject(LanguageService);
  private readonly activityStore = inject(OperationalStore);
  readonly events = signal<ReadonlyArray<CalendarEvent>>([
    {
      id: 'EV-2401',
      title: 'Instalación · José Hernández',
      description: 'Instalación de CPE y router para el plan Intermedio.',
      startsAt: '2026-07-18T09:00:00-06:00',
      endsAt: '2026-07-18T11:00:00-06:00',
      type: 'INSTALLATION',
      status: 'SCHEDULED',
      client: 'SL-1044',
      assignedTo: 'Carlos Mendoza',
      allDay: false,
      clientId: 'SL-1044',
    },
    {
      id: 'EV-2402',
      title: 'Seguimiento comercial',
      description: 'Confirmar cobertura y propuesta con Distribuidora Nova.',
      startsAt: '2026-07-18T13:30:00-06:00',
      endsAt: '2026-07-18T14:00:00-06:00',
      type: 'FOLLOW_UP',
      status: 'SCHEDULED',
      client: 'Distribuidora Nova',
      assignedTo: 'Andrea Torres',
      allDay: false,
      leadId: 'LD-1084',
    },
    {
      id: 'EV-2403',
      title: 'Cobro domiciliado',
      description: 'Validar conciliación del pago mensual.',
      startsAt: '2026-07-21T08:00:00-06:00',
      endsAt: '2026-07-21T08:30:00-06:00',
      type: 'PAYMENT',
      status: 'SCHEDULED',
      client: 'SL-1041',
      assignedTo: 'Ana Torres',
      allDay: false,
    },
    {
      id: 'EV-2404',
      title: 'Mantenimiento Torre Norte',
      description: 'Inspección preventiva de radio y energía.',
      startsAt: '2026-07-23T10:00:00-06:00',
      endsAt: '2026-07-23T13:00:00-06:00',
      type: 'MAINTENANCE',
      status: 'SCHEDULED',
      client: 'Operación interna',
      assignedTo: 'Carlos Mendoza',
      allDay: false,
    },
    {
      id: 'EV-2398',
      title: 'Instalación · Consultorio Sonríe',
      description: 'Activación completada.',
      startsAt: '2026-07-14T09:30:00-06:00',
      endsAt: '2026-07-14T11:30:00-06:00',
      type: 'INSTALLATION',
      status: 'COMPLETED',
      client: 'SL-1047',
      assignedTo: 'Carlos Mendoza',
      allDay: false,
      clientId: 'SL-1047',
    },
  ]);

  add(event: Omit<CalendarEvent, 'id'>): CalendarEvent {
    const created = { ...event, id: `EV-${2400 + this.events().length + 1}` };
    this.events.update((events) => [...events, created]);
    this.logRecordActivity(created, 'CREATE');
    return created;
  }

  complete(id: string): void {
    this.update(id, { status: 'COMPLETED' });
  }

  update(id: string, changes: Partial<Omit<CalendarEvent, 'id'>>): CalendarEvent | undefined {
    this.events.update((events) =>
      events.map((event) => (event.id === id ? { ...event, ...changes } : event)),
    );
    const updated = this.events().find((event) => event.id === id);
    if (updated) this.logRecordActivity(updated, 'EDIT');
    return updated;
  }

  delete(id: string): void {
    const event = this.events().find((item) => item.id === id);
    this.events.update((events) => events.filter((event) => event.id !== id));
    if (event) this.logRecordActivity(event, 'DELETE');
  }

  private logRecordActivity(event: CalendarEvent, actionType: 'CREATE' | 'EDIT' | 'DELETE'): void {
    const recordId = event.leadId ?? event.clientId;
    if (!recordId) return;
    const title = {
      CREATE: 'Evento añadido',
      EDIT: 'Evento actualizado',
      DELETE: 'Evento eliminado',
    }[actionType];
    const formatter = new Intl.DateTimeFormat(this.i18n.locale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    this.activityStore.logActivity(
      recordId,
      title,
      `${event.title} · ${formatter.format(new Date(event.startsAt))} – ${formatter.format(new Date(event.endsAt))}`,
      actionType === 'DELETE' ? 'amber' : actionType === 'EDIT' ? 'blue' : 'green',
      'Calendario',
      actionType,
    );
  }
}
