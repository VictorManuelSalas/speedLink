import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LanguageService } from '../core/i18n/language.service';
import { FloatingPanel } from './floating-panel';

interface CalendarDay {
  readonly key: string;
  readonly day: number;
  readonly inCurrentMonth: boolean;
  readonly selected: boolean;
  readonly today: boolean;
}

let activeDateField: InlineEditableDateField | null = null;

@Component({
  selector: 'app-inline-editable-date-field',
  imports: [FloatingPanel],
  templateUrl: './inline-editable-date-field.html',
  styleUrl: './inline-editable-date-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineEditableDateField {
  private readonly i18n = inject(LanguageService);
  readonly label = input('Fecha de instalación');
  readonly value = input.required<string>();
  readonly includeTime = input(false);
  readonly placeholder = input('Seleccionar fecha');
  readonly alwaysShowEdit = input(false);
  readonly compact = input(false);
  readonly valueSaved = output<string>();
  readonly editing = signal(false);
  readonly selected = signal('');
  readonly selectedTime = signal('09:00');
  readonly visibleMonth = signal(this.firstDayOfMonth(new Date()));
  readonly weekdays = computed(() =>
    this.i18n.language() === 'en'
      ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
      : ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'],
  );

  readonly formattedValue = computed(() => this.formatDate(this.value()));
  readonly monthTitle = computed(() =>
    new Intl.DateTimeFormat(this.i18n.locale(), { month: 'long', year: 'numeric' }).format(
      this.visibleMonth(),
    ),
  );
  readonly calendarDays = computed<CalendarDay[]>(() => {
    const month = this.visibleMonth();
    const firstWeekday = (month.getDay() + 6) % 7;
    const firstCell = new Date(month.getFullYear(), month.getMonth(), 1 - firstWeekday);
    const today = this.toKey(new Date());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        firstCell.getFullYear(),
        firstCell.getMonth(),
        firstCell.getDate() + index,
      );
      const key = this.toKey(date);
      return {
        key,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === month.getMonth(),
        selected: key === this.selected(),
        today: key === today,
      };
    });
  });

  openCalendar(): void {
    if (activeDateField && activeDateField !== this) activeDateField.cancel();
    activeDateField = this;
    const date = this.parseDate(this.value()) ?? new Date();
    this.selected.set(this.toKey(date));
    this.visibleMonth.set(this.firstDayOfMonth(date));
    this.selectedTime.set(this.value().slice(11, 16) || '09:00');
    this.editing.set(true);
  }

  changeMonth(change: number): void {
    const current = this.visibleMonth();
    this.visibleMonth.set(new Date(current.getFullYear(), current.getMonth() + change, 1));
  }

  selectDate(key: string): void {
    this.selected.set(key);
    const date = this.parseDate(key);
    if (date) this.visibleMonth.set(this.firstDayOfMonth(date));
  }

  selectToday(): void {
    const today = new Date();
    this.selected.set(this.toKey(today));
    this.visibleMonth.set(this.firstDayOfMonth(today));
  }

  cancel(): void {
    this.editing.set(false);
    if (activeDateField === this) activeDateField = null;
  }

  save(): void {
    const nextValue = this.includeTime()
      ? `${this.selected()}T${this.selectedTime() || '09:00'}`
      : this.selected();
    if (this.selected() && nextValue !== this.value().slice(0, this.includeTime() ? 16 : 10))
      this.valueSaved.emit(nextValue);
    this.cancel();
  }

  private parseDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatDate(value: string): string {
    const date = this.parseDate(value);
    if (!date) return value;
    const formatted = new Intl.DateTimeFormat(this.i18n.locale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
    return this.includeTime() && value.slice(11, 16)
      ? `${formatted}, ${value.slice(11, 16)}`
      : formatted;
  }

  private firstDayOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private toKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
