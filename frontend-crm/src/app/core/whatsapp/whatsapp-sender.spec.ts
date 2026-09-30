import { TestBed } from '@angular/core/testing';
import { documentLink, documentToken, isValidDocumentToken } from '../documents/shared-documents';
import { WhatsappSender } from './whatsapp-sender';
import { MessageContext } from './message-context';
import { TemplateStore } from '../data-access/templates/template-store';
import { OperationalStore } from '../../features/operations/operational-store';

describe('Enlaces de documentos', () => {
  it('builds a public link with a token that only matches its own document', () => {
    const link = documentLink('invoice', 'INV-4484');
    expect(link).toContain('/d/invoice/INV-4484?t=');
    expect(isValidDocumentToken('invoice', 'INV-4484', documentToken('invoice', 'INV-4484'))).toBe(true);
    // Cambiar el folio o el tipo invalida el enlace.
    expect(isValidDocumentToken('invoice', 'INV-4485', documentToken('invoice', 'INV-4484'))).toBe(false);
    expect(isValidDocumentToken('payment', 'INV-4484', documentToken('invoice', 'INV-4484'))).toBe(false);
    expect(isValidDocumentToken('otro', 'INV-4484', 'x')).toBe(false);
  });
});

describe('WhatsappSender', () => {
  let sender: WhatsappSender;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    sender = TestBed.inject(WhatsappSender);
  });

  it('renders the invoice template with the download link', () => {
    const text = sender.text({
      templateId: 'tpl-invoice-whatsapp',
      module: 'invoices',
      record: { folio: 'FAC-1', client: 'Luis', total: 350, dueDate: '2026-10-10', documentUrl: 'https://x/d/invoice/FAC-1?t=abc' },
      phone: '8715084696',
      recordId: 'FAC-1',
      fallback: '',
    });
    expect(text).toContain('*FAC-1*');
    expect(text).toContain('https://x/d/invoice/FAC-1?t=abc');
    expect(text).not.toContain('${');
  });

  it('lists the WhatsApp templates of a module plus the general ones, without action-only ones', () => {
    const templates = TestBed.inject(TemplateStore);
    const invoices = templates.whatsappFor('invoices').map((template) => template.id);
    expect(invoices).toContain('tpl-invoice-reminder-whatsapp');
    expect(invoices).not.toContain('tpl-payment-received');
    const customers = templates.whatsappFor('customers').map((template) => template.id);
    expect(customers).not.toContain('tpl-customer-portal-whatsapp');
    // Una plantilla nueva de WhatsApp para el módulo aparece sola en el menú.
    templates.save({
      id: 'tpl-x',
      name: 'Promoción de octubre',
      channel: 'whatsapp',
      module: 'invoices',
      format: 'text',
      subject: '',
      body: 'Hola ${invoice.client}',
      status: 'ACTIVE',
      updatedAt: '',
    });
    expect(templates.whatsappFor('invoices').map((template) => template.id)).toContain('tpl-x');
    expect(templates.remove('tpl-x').ok).toBe(true);
  });

  it('evaluates the record state and attaches the document link when the template asks for it', () => {
    const ops = TestBed.inject(OperationalStore);
    const due = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
    ops.records.update((records) => ({
      ...records,
      customers: [{ id: 'SL-9', name: 'Ana', phone: '8715084696' }],
      invoices: [{ id: 'INV-9', folio: 'FAC-9', clientId: 'SL-9', client: 'Ana', status: 'PENDING', dueDate: due, total: 500 }],
      payments: [],
    }));
    const context = TestBed.inject(MessageContext).build('invoices', ops.find('invoices', 'INV-9')!);
    // Pendiente pero ya vencida y con saldo: cuenta como «Vencida».
    expect(context.state).toBe('OVERDUE');
    // 9 o 10 según la hora: el vencimiento cuenta desde el mediodía de ese día.
    expect([9, 10]).toContain(context.data['daysOverdue']);
    expect(context.phone).toBe('8715084696');
    const message = sender.fromRecord('invoices', ops.find('invoices', 'INV-9')!, 'tpl-invoice-reminder-whatsapp');
    // Aunque la plantilla editada no traiga el enlace, se agrega al final.
    TestBed.inject(TemplateStore).save({
      ...TestBed.inject(TemplateStore).find('tpl-invoice-reminder-whatsapp')!,
      body: 'Hola ${invoice.client}, tu factura venció.',
    });
    const text = sender.text(message);
    expect(text).toContain('Descarga tu factura: ');
    expect(text).toContain('/d/invoice/INV-9?t=');
  });

  it('opens wa.me with the country code and logs the send', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    sender.open({
      templateId: 'tpl-ticket-received',
      module: 'tickets',
      record: { id: 'TK-1', subject: 'Sin internet', clientName: 'Luis' },
      phone: '8715084696',
      recordId: 'TK-1',
      customerId: 'SL-1044',
      fallback: '',
    });
    expect(String(open.mock.calls[0][0])).toContain('https://wa.me/528715084696?text=');
    expect(sender.last('TK-1')?.templateId).toBe('tpl-ticket-received');
    expect(sender.last('SL-1044')?.recordId).toBe('TK-1');
    expect(sender.hasPhone('123')).toBe(false);
    open.mockRestore();
  });
});
