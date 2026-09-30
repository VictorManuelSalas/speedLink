/**
 * Data Initializer Service
 * Bridges between OperationalDataService and OperationalStore
 * Initializes mock data and populates the operational modules
 */

import { Injectable, inject } from '@angular/core';
import { OperationalStore } from '../../../features/operations/operational-store';
import { OperationalDataService } from './operational-data.service';
import type { OperationalRecord } from '../../../features/operations/operational-modules.data';
import { OPERATIONAL_MODULES } from '../../../features/operations/operational-modules.data';
import { CUSTOMERS } from '../mock-crm-data';
import { DEMO_ASSIGNMENTS, DEMO_EQUIPMENT } from '../demo-fixtures';
import { mbpsIn } from '../../network/mikrotik.model';

/** Bajada/subida de un plan de internet a partir de su nombre; subida = 1/5. */
function internetSpeed(type: string, name: string): Partial<OperationalRecord> {
  const mbps = type === 'Internet' ? mbpsIn(name) : null;
  return mbps ? { downloadMbps: mbps, uploadMbps: Math.max(1, Math.round(mbps / 5)) } : {};
}

@Injectable({
  providedIn: 'root',
})
export class DataInitializerService {
  private operationalStore = inject(OperationalStore);
  private dataService = inject(OperationalDataService);

  /**
   * Initialize operational data in the store
   */
  async initializeOperationalData(): Promise<void> {
    try {
      // Initialize the data service with generated data
      await this.dataService.initialize({
        useGeneratedData: true,
        generationConfig: {
          leads: 15,
          equipment: 20,
          assignments: 12,
          contracts: 10,
          invoices: 40,
          payments: 50,
          expenses: 25,
        },
      });

      // Load data into operational store
      this.populateOperationalStore();

      console.log('✅ Operational data initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize operational data:', error);
      throw error;
    }
  }

  /**
   * Load data from service into operational store
   */
  private populateOperationalStore(): void {
    const recordsToLoad: Record<string, OperationalRecord[]> = {
      leads: this.mapLeadsToOperationalRecords(),
      services: this.mapServicesToOperationalRecords(),
      // Los registros fijos de demostración van primero y siempre existen.
      equipment: [...DEMO_EQUIPMENT, ...this.mapEquipmentToOperationalRecords()],
      assignments: [...DEMO_ASSIGNMENTS, ...this.mapAssignmentsToOperationalRecords()],
      contracts: this.mapContractsToOperationalRecords(),
      // Las facturas y pagos que cuelgan de cada cliente también son registros
      // de sus módulos: así el id que se ve en la ficha del cliente abre el
      // registro real en Facturas / Pagos.
      invoices: [
        ...this.mapCustomerInvoicesToOperationalRecords(),
        ...this.mapInvoicesToOperationalRecords(),
      ],
      payments: [
        ...this.mapCustomerPaymentsToOperationalRecords(),
        ...this.mapPaymentsToOperationalRecords(),
      ],
      expenses: this.mapExpensesToOperationalRecords(),
      customers: this.mapCustomersToOperationalRecords(),
    };

    // Update store with all records
    // Se mezcla y no se reemplaza: los registros de módulos personalizados
    // (cm_…) ya se cargaron del almacenamiento y no vienen en los datos demo.
    this.operationalStore.records.update((current) => ({ ...current, ...recordsToLoad }));
    this.operationalStore.dataReady.set(true);
  }

  /**
   * Map LeadRecord to OperationalRecord format
   */
  private mapLeadsToOperationalRecords(): OperationalRecord[] {
    return this.dataService.leads.getAllSync().map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      cellphone: lead.cellphone,
      type: lead.type,
      address: lead.address,
      latitude: lead.latitude,
      longitude: lead.longitude,
      source: lead.source,
      status: lead.status,
      owner: lead.owner ?? '',
      description: lead.description,
    } as OperationalRecord));
  }

  /**
   * Map ServiceRecord to OperationalRecord format
   */
  private mapServicesToOperationalRecords(): OperationalRecord[] {
    // Contratos que incluyen cada servicio e ingreso mensual que generan.
    // El ingreso sólo cuenta contratos ACTIVE: uno vencido ya no factura.
    const contractCount = new Map<string, number>();
    const monthlyRevenue = new Map<string, number>();
    for (const contract of this.dataService.contracts.getAllSync()) {
      for (const item of contract.items ?? []) {
        contractCount.set(item.serviceId, (contractCount.get(item.serviceId) ?? 0) + 1);
        if (contract.status === 'ACTIVE') {
          const amount = (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
          monthlyRevenue.set(item.serviceId, (monthlyRevenue.get(item.serviceId) ?? 0) + amount);
        }
      }
    }
    return this.dataService.services.getAllSync().map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      type: service.type,
      contracts: contractCount.get(service.id) ?? 0,
      monthlyRevenue: monthlyRevenue.get(service.id) ?? 0,
      // Los planes de internet traen la velocidad en el nombre («… 50 Mbps»).
      ...internetSpeed(service.type, service.name),
      status: service.status,
    } as OperationalRecord));
  }

  /**
   * Map EquipmentRecord to OperationalRecord format
   */
  private mapEquipmentToOperationalRecords(): OperationalRecord[] {
    return this.dataService.equipment.getAllSync().map((equipment) => ({
      id: equipment.id,
      name: equipment.name,
      brand: equipment.brand,
      model: equipment.model,
      serialNumber: equipment.serialNumber,
      macAddress: equipment.macAddress,
      status: equipment.status,
      purchaseCost: equipment.purchaseCost,
      purchaseDate: equipment.purchaseDate,
      assignedToId: equipment.assignedToId,
      assignedTo: equipment.assignedTo ?? '',
      description: equipment.description,
    } as OperationalRecord));
  }

  /**
   * Map AssignmentRecord to OperationalRecord format
   */
  private mapAssignmentsToOperationalRecords(): OperationalRecord[] {
    return this.dataService.assignments.getAllSync().map((assignment) => ({
      id: assignment.id,
      name: assignment.name,
      clientId: assignment.clientId,
      client: assignment.client,
      equipmentId: assignment.equipmentId,
      equipment: assignment.equipment,
      serial: assignment.serial,
      assignedAt: assignment.assignedAt,
      returnedAt: assignment.returnedAt,
      status: assignment.status,
      description: assignment.description,
    } as OperationalRecord));
  }

  /**
   * Map ContractRecord to OperationalRecord format
   */
  private mapContractsToOperationalRecords(): OperationalRecord[] {
    return this.dataService.contracts.getAllSync().map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      clientId: contract.clientId,
      client: contract.client,
      startDate: contract.startDate,
      endDate: contract.endDate,
      signedAt: contract.signedAt,
      totalMonthly: contract.totalMonthly,
      status: contract.status,
      items: JSON.stringify(contract.items),
      description: contract.description,
    } as OperationalRecord));
  }

  /**
   * Map InvoiceRecord to OperationalRecord format
   */
  /** Facturas anidadas en cada cliente, expuestas como registros de Facturas. */
  private mapCustomerInvoicesToOperationalRecords(): OperationalRecord[] {
    const status: Readonly<Record<string, string>> = {
      paid: 'PAID',
      pending: 'PENDING',
      overdue: 'OVERDUE',
    };
    return CUSTOMERS.flatMap((customer) =>
      customer.invoices.map(
        (invoice) =>
          ({
            id: invoice.id,
            folio: invoice.id,
            clientId: customer.id,
            client: customer.name,
            issueDate: invoice.issuedAt,
            dueDate: invoice.dueAt,
            total: invoice.total,
            status: status[invoice.status] ?? 'PENDING',
            description: `${customer.plan} · ${customer.speed}`,
          }) as OperationalRecord,
      ),
    );
  }

  /**
   * Pagos del cliente, tomados de las partidas de cada factura.
   *
   * No se usa `customer.payments` porque sus ids (`PAG-6100`) no coinciden con
   * los de las facturas (`PAG-6100-1`), así que ningún pago quedaba ligado a su
   * factura y las fichas se veían sin pagos.
   */
  private mapCustomerPaymentsToOperationalRecords(): OperationalRecord[] {
    const method: Readonly<Record<string, string>> = {
      Transferencia: 'BANK_TRANSFER',
      Efectivo: 'CASH',
      Tarjeta: 'CREDIT_CARD',
    };
    return CUSTOMERS.flatMap((customer) =>
      customer.invoices.flatMap((invoice) =>
        (invoice.payments ?? []).map(
          (payment) =>
            ({
              id: payment.id,
              clientId: customer.id,
              client: customer.name,
              invoiceId: invoice.id,
              invoice: invoice.id,
              amount: payment.amount,
              method: method[payment.method] ?? 'OTHER',
              reference: payment.reference,
              paidAt: payment.date,
            }) as OperationalRecord,
        ),
      ),
    );
  }

  private mapInvoicesToOperationalRecords(): OperationalRecord[] {
    return this.dataService.invoices.getAllSync().map((invoice) => ({
      id: invoice.id,
      folio: invoice.folio,
      clientId: invoice.clientId,
      client: invoice.client,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      status: invoice.status,
      description: invoice.description,
    } as OperationalRecord));
  }

  /**
   * Map PaymentRecord to OperationalRecord format
   */
  private mapPaymentsToOperationalRecords(): OperationalRecord[] {
    return this.dataService.payments.getAllSync().map((payment) => ({
      id: payment.id,
      clientId: payment.clientId,
      client: payment.client,
      invoiceId: payment.invoiceId,
      invoice: payment.invoice,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt,
      notes: payment.notes,
    } as OperationalRecord));
  }

  /**
   * Map ExpenseRecord to OperationalRecord format
   */
  private mapExpensesToOperationalRecords(): OperationalRecord[] {
    return this.dataService.expenses.getAllSync().map((expense) => ({
      id: expense.id,
      description: expense.description,
      vendor: expense.vendor,
      category: expense.category,
      amount: expense.amount,
      date: expense.date,
    } as OperationalRecord));
  }

  /**
   * Map CustomerRecord to OperationalRecord format
   */
  /**
   * Los clientes salen de `CUSTOMERS`, el mismo origen que muestra el módulo de
   * Clientes. Antes venían de una lista aparte en `operational-modules.data.ts`,
   * así que un mismo id era otra persona según el módulo que abrieras.
   */
  private mapCustomersToOperationalRecords(): OperationalRecord[] {
    const status: Readonly<Record<string, string>> = {
      active: 'ACTIVE',
      pending: 'ACTIVE',
      suspended: 'SUSPENDED',
      inactive: 'INACTIVE',
      cancelled: 'INACTIVE',
    };
    return CUSTOMERS.map(
      (customer) =>
        ({
          id: customer.id,
          name: customer.name,
          // El modelo del cliente no distingue hogar/negocio: se infiere del nombre.
          type: /s\.?a\.?|abarrotes|consultorio|distribuidora|caf[eé]|farmacia|negocio/i.test(
            customer.name,
          )
            ? 'Negocio'
            : 'Hogar',
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          status: status[customer.status] ?? 'ACTIVE',
        }) as OperationalRecord,
    );
  }
}
