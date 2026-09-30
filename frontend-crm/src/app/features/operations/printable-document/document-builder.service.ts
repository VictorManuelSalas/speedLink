import { Injectable, inject } from '@angular/core';
import { CUSTOMERS } from '../../../core/data-access/mock-crm-data';
import { DeviceAccessStore } from '../../../core/equipment/device-access.store';
import { WIFI_BANDS } from '../../../core/equipment/device-access.model';
import { LanguageService } from '../../../core/i18n/language.service';
import { buildAccountStatement } from '../../customers/customer-detail-page/account-statement';
import type { OperationalModuleKey, OperationalRecord } from '../operational-modules.data';
import { OperationalStore } from '../operational-store';
import { PrintableDocument, buildPrintableDocument } from './printable-document.data';

const INVOICE_STATUS: Readonly<Record<string, string>> = {
  paid: 'Pagada',
  pending: 'Pendiente',
  overdue: 'Vencida',
};

/**
 * Arma el documento imprimible de un registro. Lo usan la ficha (descargar,
 * adjuntar al correo) y la página pública de descarga que se manda por
 * WhatsApp, así ambos entregan exactamente el mismo PDF.
 */
@Injectable({ providedIn: 'root' })
export class DocumentBuilder {
  private readonly store = inject(OperationalStore);
  private readonly deviceAccess = inject(DeviceAccessStore);
  private readonly i18n = inject(LanguageService);

  build(module: OperationalModuleKey, record: OperationalRecord): PrintableDocument | null {
    return buildPrintableDocument(module, {
      record,
      wifiNetworks:
        module === 'assignments'
          ? this.deviceAccess
              .access(String(record['equipmentId'] ?? ''))
              .wifi.filter((network) => network.enabled)
              .map((network) => ({
                ssid: network.ssid,
                band: WIFI_BANDS.find((band) => band.value === network.band)?.label ?? network.band,
              }))
          : undefined,
      formatMoney: (value) => this.formatMoney(value),
      formatDate: (value) => this.formatDate(value),
      statusLabel: (value) => this.statusLabel(value),
      contractItems:
        module === 'contracts'
          ? this.contractItems(record).map((item) => ({
              name: String(this.store.find('services', item.serviceId)?.['name'] ?? item.serviceId),
              quantity: Number(item.quantity) || 1,
              unitPrice: Number(item.unitPrice) || 0,
            }))
          : undefined,
      // `invoiceId` es el enlace estable: `invoice` guarda a veces el folio
      // y a veces el id, según cómo se haya generado el pago.
      payments: module === 'invoices' ? this.paymentsOf(record) : undefined,
    });
  }

  /** Estado de cuenta del cliente (saldo, facturas y pagos). */
  statement(customerId: string): PrintableDocument | null {
    const customer = CUSTOMERS.find((item) => item.id === customerId);
    return customer
      ? buildAccountStatement(customer, {
          formatMoney: (value) => this.formatMoney(value),
          formatDate: (value) => this.formatDate(value),
          invoiceStatusLabel: (status) => INVOICE_STATUS[status] ?? status,
        })
      : null;
  }

  paymentsOf(invoice: OperationalRecord): OperationalRecord[] {
    return this.store
      .recordsFor('payments')
      .filter(
        (payment) =>
          payment['invoiceId'] === invoice.id ||
          payment['invoice'] === invoice.id ||
          (!!invoice['folio'] && payment['invoice'] === invoice['folio']),
      );
  }

  formatMoney(value: unknown): string {
    return new Intl.NumberFormat(this.i18n.locale(), {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  formatDate(value: unknown): string {
    const date = new Date(String(value ?? ''));
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(this.i18n.locale(), { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  }

  private statusLabel(value: unknown): string {
    return String(value ?? '')
      .replaceAll('_', ' ')
      .toLocaleLowerCase()
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  private contractItems(record: OperationalRecord): ReadonlyArray<{ serviceId: string; quantity: number; unitPrice: number }> {
    try {
      const parsed = JSON.parse(String(record['items'] ?? '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
