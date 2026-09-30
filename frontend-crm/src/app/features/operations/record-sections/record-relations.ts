import { Injectable, inject } from '@angular/core';
import { TicketStore } from '../../../core/data-access/ticket-store';
import { OperationalStore } from '../operational-store';
import type { OperationalRecord } from '../operational-modules.data';

export interface RelatedRecord {
  readonly id: string;
  readonly label: string;
  readonly route: ReadonlyArray<string>;
}

const LABEL: Readonly<Record<string, string>> = {
  invoices: 'Factura',
  payments: 'Pago',
  contracts: 'Contrato',
  assignments: 'Asignación',
  equipment: 'Equipo',
};

/**
 * Registros ligados a otro, para que su historial muestre también lo que pasó
 * en ellos: el cliente ve los envíos de sus facturas, la factura sus pagos…
 */
@Injectable({ providedIn: 'root' })
export class RecordRelations {
  private readonly ops = inject(OperationalStore);
  private readonly tickets = inject(TicketStore);

  related(module: string, id: string): ReadonlyArray<RelatedRecord> {
    switch (module) {
      case 'customers':
        return [
          ...(['contracts', 'invoices', 'payments', 'assignments'] as const).flatMap((key) =>
            this.ops
              .recordsFor(key)
              .filter((record) => record['clientId'] === id)
              .map((record) => this.entry(key, record)),
          ),
          ...this.ops
            .recordsFor('equipment')
            .filter((record) => record['assignedToId'] === id)
            .map((record) => this.entry('equipment', record)),
          ...this.tickets.forClient(id).map((ticket) => ({
            id: ticket.id,
            label: `Ticket ${ticket.id}`,
            route: ['/tickets', ticket.id],
          })),
        ];
      case 'invoices': {
        const invoice = this.ops.find('invoices', id);
        return this.ops
          .recordsFor('payments')
          .filter(
            (payment) =>
              payment['invoiceId'] === id ||
              payment['invoice'] === id ||
              (!!invoice?.['folio'] && payment['invoice'] === invoice['folio']),
          )
          .map((payment) => this.entry('payments', payment));
      }
      case 'payments': {
        const payment = this.ops.find('payments', id);
        const key = String(payment?.['invoiceId'] ?? payment?.['invoice'] ?? '');
        const invoice =
          this.ops.find('invoices', key) ?? this.ops.recordsFor('invoices').find((item) => item['folio'] === key);
        return invoice ? [this.entry('invoices', invoice)] : [];
      }
      case 'equipment':
        return this.ops
          .recordsFor('assignments')
          .filter((record) => record['equipmentId'] === id)
          .map((record) => this.entry('assignments', record));
      case 'assignments': {
        const equipmentId = String(this.ops.find('assignments', id)?.['equipmentId'] ?? '');
        const equipment = this.ops.find('equipment', equipmentId);
        return equipment ? [this.entry('equipment', equipment)] : [];
      }
      default:
        return [];
    }
  }

  /** Eventos del registro más los de sus relacionados (lo que muestra la pestaña Actividad). */
  activityCount(module: string, id: string): number {
    return (
      this.ops.activityFor(id).length +
      this.related(module, id).reduce((sum, relation) => sum + (this.ops.activity()[relation.id]?.length ?? 0), 0)
    );
  }

  private entry(module: string, record: OperationalRecord): RelatedRecord {
    const reference = String(record['folio'] ?? record['contractNumber'] ?? record['name'] ?? record.id);
    return { id: record.id, label: `${LABEL[module] ?? module} ${reference}`, route: [`/${module}`, record.id] };
  }
}
