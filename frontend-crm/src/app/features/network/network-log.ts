import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NETWORK_ACTION_LABEL, NetworkLogEntry } from '../../core/network/mikrotik.model';

/** Bitácora de acciones de red con el comando RouterOS de cada una. */
@Component({
  selector: 'app-network-log',
  imports: [DatePipe, RouterLink],
  template: `
    <ul class="net-log">
      @for (entry of entries(); track entry.id) {
        <li>
          <div class="net-log__head">
            <b>{{ label(entry) }}</b>
            @if (showCustomer() && entry.customerId) {
              <a [routerLink]="['/customers', entry.customerId]" [queryParams]="{ tab: 'Red' }"
                >{{ entry.customerName }}</a
              >
            }
            <span class="net-log__status net-log__status--{{ entry.status }}">{{
              entry.status === 'simulated' ? 'Aplicado (demo)' : 'Ejecutar en el router'
            }}</span>
          </div>
          <small
            >{{ entry.summary }} · {{ entry.routerName }} · {{ entry.at | date: 'dd MMM, HH:mm' }} ·
            {{ entry.actor }}</small
          >
          @if (entry.commands.length) {
          <div class="net-log__cmd">
            <code>{{ entry.commands.join('\n') }}</code>
            <button type="button" (click)="copy(entry)">{{ copied() === entry.id ? 'Copiado' : 'Copiar' }}</button>
          </div>
          }
        </li>
      } @empty {
        <li class="net-log__empty">Sin acciones registradas.</li>
      }
    </ul>
  `,
  styleUrl: './network.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkLog {
  readonly entries = input.required<ReadonlyArray<NetworkLogEntry>>();
  readonly showCustomer = input(false);
  readonly copied = signal<string | null>(null);

  label(entry: NetworkLogEntry): string {
    return NETWORK_ACTION_LABEL[entry.action];
  }

  copy(entry: NetworkLogEntry): void {
    void navigator.clipboard?.writeText(entry.commands.join('\n')).then(() => {
      this.copied.set(entry.id);
      window.setTimeout(() => this.copied.set(null), 1800);
    });
  }
}
