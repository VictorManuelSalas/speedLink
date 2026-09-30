import { Injectable, inject } from '@angular/core';
import { MessageContext } from './message-context';
import { WhatsappSender } from './whatsapp-sender';

/** Plantillas de WhatsApp que disparan acciones concretas (Red, cortes). */
export type CustomerMessage =
  | 'tpl-customer-welcome-whatsapp'
  | 'tpl-customer-statement-whatsapp'
  | 'tpl-customer-reminder-whatsapp'
  | 'tpl-customer-cutoff-warning'
  | 'tpl-network-suspended'
  | 'tpl-network-reactivated';

/**
 * Avisos al cliente ligados a una acción (bloquear, reactivar, avisar de un
 * corte). Los demás mensajes salen del menú «WhatsApp» de cada ficha.
 */
@Injectable({ providedIn: 'root' })
export class CustomerMessages {
  private readonly sender = inject(WhatsappSender);
  private readonly context = inject(MessageContext);

  phone(customerId: string): unknown {
    return this.context.customerPhone(customerId);
  }

  canSend(customerId: string): boolean {
    return this.sender.hasPhone(this.phone(customerId));
  }

  cutoffDate(customerId: string): string {
    return this.context.cutoffDate(customerId);
  }

  send(customerId: string, templateId: CustomerMessage): void {
    this.sender.open(this.sender.fromRecord('customers', { id: customerId }, templateId));
  }

  last(customerId: string, templateId?: CustomerMessage) {
    return this.sender.last(customerId, templateId);
  }
}
