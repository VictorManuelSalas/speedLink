import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { DocumentTable, ORGANIZATION, PrintableDocument } from './printable-document.data';
import { CrmAttachment } from '../../../core/models/customer';

/** Márgenes y medidas de la hoja, en milímetros. */
const PAGE = {
  marginX: 18,
  marginTop: 18,
  marginBottom: 18,
  width: 210,
  height: 297,
} as const;

const COLOR = {
  ink: [15, 23, 42] as const,
  muted: [71, 85, 105] as const,
  line: [203, 213, 225] as const,
  panel: [241, 245, 249] as const,
};

/**
 * Genera y descarga el PDF de un documento.
 *
 * Se dibuja a partir de la estructura de `PrintableDocument` (no de HTML), así
 * el texto queda seleccionable y el archivo pesa poco. El navegador lo guarda
 * directamente, sin pasar por el diálogo de impresión.
 */
@Injectable({ providedIn: 'root' })
export class DocumentPdfService {
  download(document: PrintableDocument, fileName?: string): void {
    const pdf = this.render(document);
    pdf.save(fileName ?? this.fileNameFor(document));
  }

  /** El mismo PDF como adjunto de correo, sin pasar por el disco. */
  toAttachment(document: PrintableDocument, fileName?: string): CrmAttachment {
    const blob = this.render(document).output('blob') as Blob;
    const name = fileName ?? this.fileNameFor(document);
    return {
      id: `doc-${name}`,
      fileName: name,
      mimeType: 'application/pdf',
      size: blob.size,
      url: URL.createObjectURL(blob),
      createdAt: new Date().toISOString(),
    };
  }

  private render(document: PrintableDocument): jsPDF {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const contentWidth = PAGE.width - PAGE.marginX * 2;
    let y: number = PAGE.marginTop;

    // --- Encabezado: emisor a la izquierda, documento a la derecha ---
    // Con logo, los datos del emisor se recorren a su derecha.
    let issuerX: number = PAGE.marginX;
    const logo = ORGANIZATION.logo;
    if (logo) {
      try {
        const format = logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(logo, format, PAGE.marginX, y - 5, 14, 14, undefined, 'FAST');
        issuerX += 18;
      } catch {
        // Un logo dañado no debe impedir generar el documento.
      }
    }
    pdf.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...COLOR.ink);
    pdf.text(ORGANIZATION.name, issuerX, y);
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...COLOR.muted);
    pdf.text(`${ORGANIZATION.legalName} · RFC ${ORGANIZATION.rfc}`, issuerX, y + 5);
    pdf.text(ORGANIZATION.address, issuerX, y + 9);
    pdf.text(`${ORGANIZATION.phone} · ${ORGANIZATION.email}`, issuerX, y + 13);

    const right = PAGE.width - PAGE.marginX;
    pdf.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...COLOR.ink);
    pdf.text(document.title.toUpperCase(), right, y, { align: 'right' });
    pdf.setFontSize(11);
    pdf.text(document.reference, right, y + 6.5, { align: 'right' });
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...COLOR.muted);
    pdf.text(document.issuedAt, right, y + 11.5, { align: 'right' });

    y += 19;
    pdf.setDrawColor(...COLOR.ink).setLineWidth(0.5);
    pdf.line(PAGE.marginX, y, right, y);
    y += 10;

    // --- Secciones ---
    for (const section of document.sections) {
      y = this.ensureSpace(pdf, y, 10 + section.rows.length * 6);
      pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...COLOR.muted);
      pdf.text(section.title.toUpperCase(), PAGE.marginX, y);
      y += 2;
      pdf.setDrawColor(...COLOR.line).setLineWidth(0.2);
      pdf.line(PAGE.marginX, y, right, y);
      y += 5;

      for (const row of section.rows) {
        pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...COLOR.muted);
        pdf.text(row.label, PAGE.marginX, y);
        pdf.setFont('helvetica', row.strong ? 'bold' : 'normal').setTextColor(...COLOR.ink);
        // El valor puede ser largo (direcciones, URLs): se corta a la mitad derecha.
        const value = pdf.splitTextToSize(row.value, contentWidth / 2);
        pdf.text(value, right, y, { align: 'right' });
        y += Math.max(6, value.length * 4.6);
        y = this.ensureSpace(pdf, y, 8);
      }
      y += 5;
    }

    // --- Tablas (listados) ---
    for (const table of document.tables ?? []) {
      y = this.ensureSpace(pdf, y, 22);
      pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...COLOR.muted);
      pdf.text(table.title.toUpperCase(), PAGE.marginX, y);
      y += 5;
      y = this.drawTableHeader(pdf, table, y);

      if (!table.rows.length) {
        pdf.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...COLOR.muted);
        pdf.text(table.empty ?? 'Sin registros', PAGE.marginX, y + 1);
        y += 8;
      }

      for (const row of table.rows) {
        if (y + 7 > PAGE.height - PAGE.marginBottom - 12) {
          pdf.addPage();
          y = PAGE.marginTop;
          y = this.drawTableHeader(pdf, table, y);
        }
        pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...COLOR.ink);
        this.drawRow(pdf, table, row, y);
        y += 5.5;
        pdf.setDrawColor(...COLOR.line).setLineWidth(0.1);
        pdf.line(PAGE.marginX, y - 1.5, right, y - 1.5);
      }
      y += 6;
    }

    // --- Total destacado ---
    if (document.total) {
      y = this.ensureSpace(pdf, y, 20);
      pdf.setFillColor(...COLOR.panel);
      pdf.roundedRect(PAGE.marginX, y - 1, contentWidth, 13, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...COLOR.ink);
      pdf.text(document.total.label.toUpperCase(), PAGE.marginX + 5, y + 7.5);
      pdf.setFontSize(13);
      pdf.text(document.total.value, right - 5, y + 7.5, { align: 'right' });
      y += 20;
    }

    // --- Notas ---
    if (document.notes) {
      const notes = pdf.splitTextToSize(document.notes, contentWidth);
      y = this.ensureSpace(pdf, y, 10 + notes.length * 4.5);
      pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...COLOR.muted);
      pdf.text('NOTAS', PAGE.marginX, y);
      y += 5;
      pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...COLOR.ink);
      pdf.text(notes, PAGE.marginX, y);
      y += notes.length * 4.5 + 6;
    }

    // --- Línea de firma ---
    if (document.signatureLabel) {
      y = this.ensureSpace(pdf, y + 18, 20);
      const lineWidth = 70;
      const start = (PAGE.width - lineWidth) / 2;
      pdf.setDrawColor(...COLOR.ink).setLineWidth(0.3);
      pdf.line(start, y, start + lineWidth, y);
      pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...COLOR.muted);
      pdf.text(document.signatureLabel, PAGE.width / 2, y + 5, { align: 'center' });
      y += 14;
    }

    // --- Aviso legal, al pie de la última página ---
    if (document.disclaimer) {
      const disclaimer = pdf.splitTextToSize(document.disclaimer, contentWidth);
      const footerY = PAGE.height - PAGE.marginBottom - disclaimer.length * 3.5;
      pdf.setDrawColor(...COLOR.line).setLineWidth(0.2);
      pdf.line(PAGE.marginX, footerY - 4, right, footerY - 4);
      pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...COLOR.muted);
      pdf.text(disclaimer, PAGE.marginX, footerY);
    }

    return pdf;
  }

  /** Reparte el ancho útil entre las columnas y devuelve la x de cada una. */
  private columnAnchors(table: DocumentTable): number[] {
    const usable = PAGE.width - PAGE.marginX * 2;
    const step = usable / table.columns.length;
    return table.columns.map((column, index) =>
      column.align === 'right' ? PAGE.marginX + step * (index + 1) : PAGE.marginX + step * index,
    );
  }

  private drawTableHeader(pdf: jsPDF, table: DocumentTable, y: number): number {
    const anchors = this.columnAnchors(table);
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...COLOR.muted);
    table.columns.forEach((column, index) => {
      pdf.text(column.label.toUpperCase(), anchors[index], y, {
        align: column.align === 'right' ? 'right' : 'left',
      });
    });
    y += 2;
    pdf.setDrawColor(...COLOR.line).setLineWidth(0.25);
    pdf.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
    return y + 5;
  }

  private drawRow(
    pdf: jsPDF,
    table: DocumentTable,
    row: ReadonlyArray<string>,
    y: number,
  ): void {
    const anchors = this.columnAnchors(table);
    table.columns.forEach((column, index) => {
      const align = column.align === 'right' ? 'right' : 'left';
      pdf.text(String(row[index] ?? ''), anchors[index], y, { align });
    });
  }

  /** Salta de página si el bloque que sigue no cabe. */
  private ensureSpace(pdf: jsPDF, y: number, needed: number): number {
    if (y + needed <= PAGE.height - PAGE.marginBottom - 12) return y;
    pdf.addPage();
    return PAGE.marginTop;
  }

  private fileNameFor(document: PrintableDocument): string {
    const slug = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
    return `${slug(document.title)}-${slug(document.reference)}.pdf`;
  }
}
