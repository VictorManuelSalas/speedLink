import { runtimeConfig } from '../runtime-config';

/*
 * Enlaces de descarga para mandar documentos por WhatsApp (wa.me no adjunta
 * archivos).
 *
 * - Con servidor: apuntan a su endpoint, que genera el PDF (como hacía el
 *   admin anterior con `/payments/pdf?invoice_id=`).
 * - Sin servidor (demo): apuntan a la página pública `/d/:tipo/:id` del CRM,
 *   que arma el PDF en el navegador.
 *
 * El token evita que alguien recorra folios cambiando el número del enlace.
 * No es una firma segura: esa la pone el servidor con enlaces firmados.
 */

export type SharedDocumentKind = 'invoice' | 'payment' | 'contract' | 'statement' | 'assignment';

export const SHARED_DOCUMENT_LABEL: Readonly<Record<SharedDocumentKind, string>> = {
  invoice: 'Factura',
  payment: 'Comprobante de pago',
  contract: 'Contrato',
  statement: 'Estado de cuenta',
  assignment: 'Acuse de entrega',
};

/** Módulo del CRM del que sale cada tipo de documento. */
export const SHARED_DOCUMENT_MODULE: Readonly<Record<SharedDocumentKind, string>> = {
  invoice: 'invoices',
  payment: 'payments',
  contract: 'contracts',
  statement: 'customers',
  assignment: 'assignments',
};

/** Documento descargable de cada módulo (el que se manda por WhatsApp). */
export const DOCUMENT_KIND_BY_MODULE: Readonly<Record<string, SharedDocumentKind>> = {
  invoices: 'invoice',
  payments: 'payment',
  contracts: 'contract',
  customers: 'statement',
  assignments: 'assignment',
};

/** Texto con el que se agrega el enlace si la plantilla no lo trae. */
export const DOCUMENT_LINK_LABEL: Readonly<Record<SharedDocumentKind, string>> = {
  invoice: 'Descarga tu factura',
  payment: 'Descarga tu comprobante',
  contract: 'Descarga tu contrato',
  statement: 'Tu estado de cuenta',
  assignment: 'Tu acuse de entrega',
};

const SALT = 'speedlink-doc-v1';

function hash(text: string): string {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}

export function documentToken(kind: SharedDocumentKind, id: string): string {
  return hash(`${kind}:${id}:${SALT}`) + hash(`${SALT}:${id}:${kind}`);
}

export function isValidDocumentToken(kind: string, id: string, token: string | null): boolean {
  return isDocumentKind(kind) && !!token && token === documentToken(kind, id);
}

export function isDocumentKind(kind: string): kind is SharedDocumentKind {
  return kind in SHARED_DOCUMENT_LABEL;
}

export function documentLink(kind: SharedDocumentKind, id: string): string {
  const token = documentToken(kind, id);
  const base = runtimeConfig().apiBaseUrl?.trim();
  return base
    ? `${base}/api/v1/documents/${kind}/${encodeURIComponent(id)}.pdf?t=${token}`
    : `${window.location.origin}/d/${kind}/${encodeURIComponent(id)}?t=${token}`;
}
