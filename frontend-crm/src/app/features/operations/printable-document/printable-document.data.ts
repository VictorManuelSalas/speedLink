/**
 * Documentos imprimibles de los registros operativos.
 *
 * Un "reporte" genérico por registro no significa nada; lo que sí es un
 * entregable real es el documento del registro: la factura que recibe el
 * cliente, el acuse que firma en la instalación. Aquí se define qué módulos
 * tienen documento y cómo se arma.
 */

import { OperationalModuleKey, OperationalRecord } from '../operational-modules.data';
import { ORGANIZATION } from '../../../core/organization/organization.model';

export interface DocumentRow {
  readonly label: string;
  readonly value: string;
  /** Resalta el renglón (totales, folio). */
  readonly strong?: boolean;
}

export interface DocumentSection {
  readonly title: string;
  readonly rows: ReadonlyArray<DocumentRow>;
}

/** Tabla del documento: para listados (facturas de un periodo, pagos aplicados). */
export interface DocumentTable {
  readonly title: string;
  readonly columns: ReadonlyArray<{ label: string; align?: 'left' | 'right' }>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
  /** Texto cuando no hay renglones. */
  readonly empty?: string;
}

export interface PrintableDocument {
  /** Encabezado grande del documento. */
  readonly title: string;
  /** Folio o identificador visible. */
  readonly reference: string;
  readonly issuedAt: string;
  readonly sections: ReadonlyArray<DocumentSection>;
  /** Listados que van debajo de las secciones. */
  readonly tables?: ReadonlyArray<DocumentTable>;
  /** Renglón de total destacado; sólo documentos con importe. */
  readonly total?: DocumentRow;
  readonly notes?: string;
  /** Pie con línea de firma (acuses de entrega). */
  readonly signatureLabel?: string;
  readonly disclaimer?: string;
}

/** Módulos que hoy tienen documento imprimible. */
export const MODULES_WITH_DOCUMENT: ReadonlyArray<OperationalModuleKey> = [
  'invoices',
  'assignments',
  'payments',
  'contracts',
];

export const DOCUMENT_ACTION_LABEL: Partial<Record<OperationalModuleKey, string>> = {
  invoices: '⇩ Descargar factura',
  assignments: '⇩ Descargar acuse de entrega',
  payments: '⇩ Descargar comprobante',
  contracts: '⇩ Descargar contrato',
};

/** Perfil vivo de Ajustes > Organización (antes era una constante fija). */
export { ORGANIZATION };

export interface DocumentContext {
  readonly record: OperationalRecord;
  readonly formatMoney: (value: unknown) => string;
  readonly formatDate: (value: unknown) => string;
  readonly statusLabel: (value: unknown) => string;
  /** Pagos aplicados a la factura, si el módulo los tiene. */
  readonly payments?: ReadonlyArray<OperationalRecord>;
  /** Partidas del contrato, ya resueltas contra el catálogo de servicios. */
  readonly contractItems?: ReadonlyArray<{ name: string; quantity: number; unitPrice: number }>;
  /** Redes WiFi del equipo entregado (sólo nombre y banda; nunca contraseñas). */
  readonly wifiNetworks?: ReadonlyArray<{ ssid: string; band: string }>;
}

function text(value: unknown, fallback = '—'): string {
  const raw = String(value ?? '').trim();
  return raw || fallback;
}

function buildInvoice(context: DocumentContext): PrintableDocument {
  const { record, formatMoney, formatDate, statusLabel } = context;
  const payments = context.payments ?? [];
  const paid = payments.reduce((sum, payment) => sum + (Number(payment['amount']) || 0), 0);
  const total = Number(record['total']) || 0;
  const balance = Math.max(0, total - paid);

  return {
    title: 'Factura',
    reference: text(record['folio'] ?? record.id),
    issuedAt: formatDate(record['issueDate'] ?? record['issuedAt']),
    sections: [
      {
        title: 'Cliente',
        rows: [
          { label: 'Nombre', value: text(record['client']) },
          { label: 'Clave de cliente', value: text(record['clientId']) },
        ],
      },
      {
        title: 'Periodo',
        rows: [
          { label: 'Fecha de emisión', value: formatDate(record['issueDate'] ?? record['issuedAt']) },
          { label: 'Fecha de vencimiento', value: formatDate(record['dueDate'] ?? record['dueAt']) },
          { label: 'Estado', value: statusLabel(record['status']) },
        ],
      },
      {
        title: 'Importes',
        rows: [
          // Subtotal e impuestos sólo si el registro los desglosa; si no,
          // mostrarlos en cero daría una lectura falsa del documento.
          ...(record['subtotal'] != null
            ? ([{ label: 'Subtotal', value: formatMoney(record['subtotal']) }] as DocumentRow[])
            : []),
          ...(record['taxAmount'] != null
            ? ([
                {
                  // La factura guarda el nombre de la tasa con la que se emitió.
                  label: record['taxName'] ? String(record['taxName']) : 'Impuestos',
                  value: formatMoney(record['taxAmount']),
                },
              ] as DocumentRow[])
            : []),
          { label: 'Total', value: formatMoney(total), strong: true },
          ...(payments.length
            ? ([
                { label: 'Pagos aplicados', value: formatMoney(paid) },
              ] as DocumentRow[])
            : []),
        ],
      },
    ],
    total: {
      label: balance > 0 ? 'Saldo pendiente' : 'Saldo',
      value: formatMoney(balance),
      strong: true,
    },
    notes: text(record['description'] ?? record['notes'], ''),
    disclaimer:
      'Documento informativo emitido por el CRM. No es un comprobante fiscal digital (CFDI).',
  };
}

function buildAssignment(context: DocumentContext): PrintableDocument {
  const { record, formatDate, statusLabel } = context;

  return {
    title: 'Acuse de entrega de equipo',
    reference: text(record['name'] ?? record.id),
    issuedAt: formatDate(record['assignedAt']),
    sections: [
      {
        title: 'Cliente',
        rows: [
          { label: 'Nombre', value: text(record['client']) },
          { label: 'Clave de cliente', value: text(record['clientId']) },
        ],
      },
      {
        title: 'Equipo entregado',
        rows: [
          { label: 'Equipo', value: text(record['equipment']), strong: true },
          { label: 'Número de serie', value: text(record['serial']) },
          { label: 'Clave de inventario', value: text(record['equipmentId']) },
        ],
      },
      // El WiFi es del cliente: se le entrega su red. La contraseña va por
      // separado y el acceso de administración nunca se imprime.
      ...(context.wifiNetworks?.length
        ? [
            {
              title: 'Tu red WiFi',
              rows: [
                ...context.wifiNetworks.map((network) => ({
                  label: `Red ${network.band}`,
                  value: network.ssid,
                  strong: true,
                })),
                { label: 'Contraseña', value: 'Se entrega por separado' },
              ],
            },
          ]
        : []),
      {
        title: 'Instalación',
        rows: [
          { label: 'Fecha de asignación', value: formatDate(record['assignedAt']) },
          { label: 'Fecha de devolución', value: formatDate(record['returnedAt']) },
          { label: 'Estado', value: statusLabel(record['status']) },
        ],
      },
    ],
    notes: text(record['description'], ''),
    signatureLabel: 'Nombre y firma de quien recibe',
    disclaimer:
      'El equipo descrito es propiedad de ' +
      ORGANIZATION.name +
      ' y deberá ser devuelto al término del servicio.',
  };
}

function buildPayment(context: DocumentContext): PrintableDocument {
  const { record, formatMoney, formatDate } = context;

  return {
    title: 'Comprobante de pago',
    reference: text(record['reference'] ?? record.id),
    issuedAt: formatDate(record['paidAt'] ?? record['date']),
    sections: [
      {
        title: 'Cliente',
        rows: [
          { label: 'Nombre', value: text(record['client']) },
          { label: 'Clave de cliente', value: text(record['clientId']) },
        ],
      },
      {
        title: 'Pago',
        rows: [
          { label: 'Fecha de pago', value: formatDate(record['paidAt'] ?? record['date']) },
          { label: 'Método', value: text(record['method']) },
          { label: 'Referencia', value: text(record['reference']) },
        ],
      },
      {
        title: 'Factura',
        rows: [
          { label: 'Folio', value: text(record['invoice'] ?? record['invoiceId']) },
          { label: 'Registro', value: text(record.id) },
        ],
      },
    ],
    total: { label: 'Importe recibido', value: formatMoney(record['amount']), strong: true },
    notes: text(record['notes'], ''),
    disclaimer:
      'Comprobante de recepción de pago emitido por ' +
      ORGANIZATION.name +
      '. No es un comprobante fiscal digital (CFDI).',
  };
}

function buildContract(context: DocumentContext): PrintableDocument {
  const { record, formatMoney, formatDate, statusLabel } = context;
  const items = context.contractItems ?? [];

  return {
    title: 'Contrato de servicio',
    reference: text(record['contractNumber'] ?? record.id),
    issuedAt: formatDate(record['startDate']),
    sections: [
      {
        title: 'Cliente',
        rows: [
          { label: 'Nombre', value: text(record['client']), strong: true },
          { label: 'Clave de cliente', value: text(record['clientId']) },
        ],
      },
      {
        title: 'Vigencia',
        rows: [
          { label: 'Inicio', value: formatDate(record['startDate']) },
          { label: 'Vencimiento', value: formatDate(record['endDate']) },
          { label: 'Fecha de firma', value: formatDate(record['signedAt']) },
          { label: 'Estado', value: statusLabel(record['status']) },
        ],
      },
    ],
    tables: [
      {
        title: 'Servicios contratados',
        columns: [
          { label: 'Servicio' },
          { label: 'Cantidad', align: 'right' },
          { label: 'Precio unitario', align: 'right' },
          { label: 'Subtotal', align: 'right' },
        ],
        rows: items.map((item) => [
          item.name,
          String(item.quantity),
          formatMoney(item.unitPrice),
          formatMoney(item.quantity * item.unitPrice),
        ]),
        empty: 'Sin servicios registrados.',
      },
    ],
    total: {
      label: 'Mensualidad total',
      value: formatMoney(record['totalMonthly']),
      strong: true,
    },
    notes: text(record['description'], ''),
    signatureLabel: 'Nombre y firma del cliente',
    disclaimer:
      'Al firmar, el cliente acepta las condiciones del servicio contratado con ' +
      ORGANIZATION.name +
      '. Documento informativo emitido por el CRM; no es un comprobante fiscal digital (CFDI).',
  };
}

const BUILDERS: Partial<Record<OperationalModuleKey, (context: DocumentContext) => PrintableDocument>> =
  {
    invoices: buildInvoice,
    assignments: buildAssignment,
    payments: buildPayment,
    contracts: buildContract,
  };

export function buildPrintableDocument(
  module: OperationalModuleKey,
  context: DocumentContext,
): PrintableDocument | null {
  return BUILDERS[module]?.(context) ?? null;
}
