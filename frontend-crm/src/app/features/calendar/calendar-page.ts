import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarEvent, CalendarEventType, CalendarStore } from './calendar-store';
import { InlineEditableDateField } from '../../shared/inline-editable-date-field';
import { PicklistOption, StyledPicklist } from '../../shared/styled-picklist';
import { lookupDisplayLabel, lookupPicklistOptions } from '../operations/lookup-options';
import { ModuleField } from '../operations/operational-modules.data';
import { OperationalStore } from '../operations/operational-store';

import { WhatsappMenu } from '../../shared/whatsapp-menu';
import { WhatsappSender } from '../../core/whatsapp/whatsapp-sender';
import { MessageContext } from '../../core/whatsapp/message-context';

@Component({
  selector: 'app-calendar-page',
  imports: [DatePipe, RouterLink, InlineEditableDateField, StyledPicklist, WhatsappMenu],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPage {
  private readonly calendarStore = inject(CalendarStore);
  private readonly operationalStore = inject(OperationalStore);
  readonly weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  readonly filters = [
    { label: 'Todos', value: 'ALL', tone: 'blue' },
    { label: 'Instalaciones', value: 'INSTALLATION', tone: 'green' },
    { label: 'Seguimientos', value: 'FOLLOW_UP', tone: 'violet' },
    { label: 'Pagos', value: 'PAYMENT', tone: 'amber' },
  ] as const;
  readonly eventTypeOptions: ReadonlyArray<PicklistOption> = [
    { value: 'INSTALLATION', label: 'Instalación' },
    { value: 'FOLLOW_UP', label: 'Seguimiento' },
    { value: 'PAYMENT', label: 'Pago' },
    { value: 'MAINTENANCE', label: 'Mantenimiento' },
  ];
  /** Lookup a Clientes, igual que en el resto de formularios del CRM. */
  private readonly clientField: ModuleField = {
    key: 'client',
    label: 'Cliente',
    type: 'lookup',
    lookupModule: 'customers',
  };
  /** Clientes en vivo; conserva el valor del evento que se está editando. */
  readonly clientOptions = computed(() =>
    lookupPicklistOptions(this.operationalStore, this.clientField, {
      currentValue: this.draft()['client'] || undefined,
    }),
  );
  readonly responsableOptions: ReadonlyArray<PicklistOption> = [
    { value: 'USR-001', label: 'Andrea Torres' },
    { value: 'USR-002', label: 'Carlos Mendoza' },
    { value: 'USR-003', label: 'María García' },
  ];
  /**
   * "Hoy" de la demo. Los eventos sembrados viven en julio de 2026, así que
   * anclar el botón a la fecha real del sistema abriría un mes vacío.
   */
  readonly todayIso = '2026-07-18';
  private readonly monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  /** Mes en pantalla; `month` es 0-based como en `Date`. */
  readonly viewMonth = signal(monthOf(this.todayIso));
  readonly monthLabel = computed(
    () => `${this.monthNames[this.viewMonth().month]} ${this.viewMonth().year}`,
  );
  /** Prefijo `YYYY-MM` del mes visible, para filtrar eventos por fecha ISO. */
  readonly monthKey = computed(
    () => `${this.viewMonth().year}-${String(this.viewMonth().month + 1).padStart(2, '0')}`,
  );
  readonly days = computed(() => {
    const { year, month } = this.viewMonth();
    const first = new Date(year, month, 1);
    // La rejilla empieza en lunes y `getDay()` da 0 para domingo.
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Filas completas: unos meses caben en 5 semanas y otros necesitan 6.
    const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: cells }, (_, index) => {
      const date = new Date(year, month, 1 - offset + index);
      return {
        day: date.getDate(),
        current: date.getMonth() === month,
        iso: isoDate(date),
      };
    });
  });
  readonly events = this.calendarStore.events;
  readonly activeFilter = signal<string>('ALL');
  readonly selectedEvent = signal<CalendarEvent | null>(null);
  private readonly whatsapp = inject(WhatsappSender);
  private readonly messageContext = inject(MessageContext);

  /** ¿El responsable de la cita tiene teléfono para mandarle la ubicación? */
  canSendToTechnician(event: CalendarEvent): boolean {
    return this.whatsapp.hasPhone(this.messageContext.assigneePhone(event.assignedTo));
  }
  /** Dirección, ubicación y teléfono del cliente, al WhatsApp del técnico. */
  sendLocationToTechnician(event: CalendarEvent): void {
    const context = this.messageContext.build('calendar', event as unknown as Record<string, unknown>);
    this.whatsapp.open({
      templateId: 'tpl-event-tech-location',
      module: 'calendar',
      record: context.data,
      phone: this.messageContext.assigneePhone(event.assignedTo),
      recordId: event.id,
      customerId: context.customerId,
      fallback: `${event.title}`,
    });
  }
  readonly createOpen = signal(false);
  readonly editingEventId = signal<string | null>(null);
  readonly draft = signal<Record<string, string>>({ type: 'INSTALLATION', assignedTo: 'USR-001' });
  readonly monthEvents = computed(() =>
    this.events().filter((event) => event.startsAt.startsWith(this.monthKey())),
  );
  readonly completedCount = computed(
    () => this.events().filter((event) => event.status === 'COMPLETED').length,
  );
  readonly installationCount = computed(
    () =>
      this.events().filter((event) => event.type === 'INSTALLATION' && event.status === 'SCHEDULED')
        .length,
  );
  readonly followUpCount = computed(
    () => this.events().filter((event) => event.type === 'FOLLOW_UP').length,
  );
  readonly upcomingEvents = computed(() =>
    this.events()
      .filter(
        (event) =>
          event.status === 'SCHEDULED' &&
          (this.activeFilter() === 'ALL' || event.type === this.activeFilter()),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  );
  /** Avanza o retrocede meses; `Date` ya maneja el salto de año. */
  shiftMonth(delta: number): void {
    this.viewMonth.update(({ year, month }) => {
      const moved = new Date(year, month + delta, 1);
      return { year: moved.getFullYear(), month: moved.getMonth() };
    });
  }
  goToToday(): void {
    this.viewMonth.set(monthOf(this.todayIso));
  }
  eventsFor(day: string): ReadonlyArray<CalendarEvent> {
    return this.events().filter(
      (event) =>
        event.startsAt.startsWith(day) &&
        (this.activeFilter() === 'ALL' || event.type === this.activeFilter()),
    );
  }
  toneFor(type: CalendarEventType): string {
    return { INSTALLATION: 'green', FOLLOW_UP: 'violet', PAYMENT: 'amber', MAINTENANCE: 'blue' }[
      type
    ];
  }
  symbolFor(type: CalendarEventType): string {
    return { INSTALLATION: '⌁', FOLLOW_UP: '◎', PAYMENT: '$', MAINTENANCE: '◇' }[type];
  }
  labelFor(type: CalendarEventType): string {
    return {
      INSTALLATION: 'INSTALACIÓN',
      FOLLOW_UP: 'SEGUIMIENTO',
      PAYMENT: 'PAGO',
      MAINTENANCE: 'MANTENIMIENTO',
    }[type];
  }
  statusLabel(status: CalendarEvent['status']): string {
    return { SCHEDULED: 'Programado', COMPLETED: 'Completado', CANCELLED: 'Cancelado' }[status];
  }
  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  getClientName(clientId: string): string {
    return lookupDisplayLabel(this.operationalStore, this.clientField, clientId);
  }
  getClientRoute(clientId: string): string | null {
    const id = this.customerIdOf(clientId);
    return id ? `/customers/${id}` : null;
  }
  /** Id del cliente si el valor es uno real (no p. ej. "Operación interna"). */
  private customerIdOf(value: string | undefined): string | undefined {
    const id = value?.trim();
    return id && this.operationalStore.recordsFor('customers').some((record) => record.id === id)
      ? id
      : undefined;
  }
  getResponsableName(userId: string): string {
    const userMap: Record<string, string> = {
      'USR-001': 'Andrea Torres',
      'USR-002': 'Carlos Mendoza',
      'USR-003': 'María García',
    };
    return userMap[userId] || userId;
  }
  getResponsableRoute(userId: string): string | null {
    return userId ? `/settings/users/${userId}` : null;
  }
  setDraft(key: string, value: string): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }
  canCreate(): boolean {
    const draft = this.draft();
    return Boolean(
      draft['title']?.trim() &&
      draft['startsAt'] &&
      draft['endsAt'] &&
      draft['type'] &&
      draft['client'] &&
      new Date(draft['endsAt']).getTime() >= new Date(draft['startsAt']).getTime(),
    );
  }
  createEvent(): void {
    if (!this.canCreate()) return;
    const draft = this.draft();
    const eventId = this.editingEventId();

    if (eventId) {
      const event = this.calendarStore.update(eventId, {
        title: draft['title'],
        description: draft['description'] || 'Sin descripción.',
        startsAt: draft['startsAt'],
        endsAt: draft['endsAt'],
        type: (draft['type'] || 'INSTALLATION') as CalendarEventType,
        client: draft['client']?.trim() || 'Sin registro relacionado',
        clientId: this.customerIdOf(draft['client']),
        assignedTo: draft['assignedTo'] || 'USR-001',
      });
      this.editingEventId.set(null);
      this.draft.set({ type: 'INSTALLATION', assignedTo: 'USR-001' });
      this.createOpen.set(false);
      if (event) this.selectedEvent.set(event);
    } else {
      const event = this.calendarStore.add({
        title: draft['title'],
        description: draft['description'] || 'Sin descripción.',
        startsAt: draft['startsAt'],
        endsAt: draft['endsAt'],
        type: (draft['type'] || 'INSTALLATION') as CalendarEventType,
        status: 'SCHEDULED',
        client: draft['client']?.trim() || 'Sin registro relacionado',
        clientId: this.customerIdOf(draft['client']),
        assignedTo: draft['assignedTo'] || 'USR-001',
        allDay: false,
      });
      this.draft.set({ type: 'INSTALLATION', assignedTo: 'USR-001' });
      this.createOpen.set(false);
      this.selectedEvent.set(event);
    }
  }
  completeEvent(id: string): void {
    this.calendarStore.complete(id);
    this.selectedEvent.update((event) =>
      event?.id === id ? { ...event, status: 'COMPLETED' } : event,
    );
  }
}

/** `YYYY-MM-DD` en hora local: `toISOString()` desplazaría el día por la zona. */
function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function monthOf(iso: string): { year: number; month: number } {
  const [year, month] = iso.split('-').map(Number);
  return { year, month: month - 1 };
}
