/**
 * Other Modules Generator
 * Generates data for Contracts, Assignments, and Expenses
 */

import { BaseGenerator } from './base-generator';
import type { ContractRecord, ContractItem, AssignmentRecord, ExpenseRecord } from '../models/operational-records';
import { assignmentFolio } from '../models/operational-records';
import { IdGenerator } from '../utils/id-generator';
import { FakerHelpers } from '../utils/faker-helpers';
import { LookupMapper } from '../utils/lookup-mapper';

// ============================================================================
// CONTRACTS GENERATOR
// ============================================================================

export class ContractsGenerator extends BaseGenerator<ContractRecord> {
  private customerIds = LookupMapper.getAllCustomerIds();
  /** Catálogo real de servicios; se inyecta antes de generar. */
  private internetPlans: ReadonlyArray<{ id: string; price: number }> = [];
  private addOns: ReadonlyArray<{ id: string; price: number }> = [];

  /**
   * Los contratos deben referenciar servicios que existen. Sin este catálogo,
   * `IdGenerator` (contador compartido por prefijo) inventaría ids `SRV-*`
   * fuera del catálogo y ningún servicio mostraría sus contratos.
   */
  setServiceCatalog(
    services: ReadonlyArray<{ id: string; type: string; price: number }>,
  ): void {
    this.internetPlans = services.filter((service) => service.type === 'Internet');
    this.addOns = services.filter((service) => service.type !== 'Internet');
  }

  generate(index: number = 0): ContractRecord {
    const customerId = this.customerIds[index % this.customerIds.length];
    const startDate = FakerHelpers.randomDate(120);

    // Contract items: 1 internet service + optional add-ons
    const plan = this.internetPlans.length
      ? this.internetPlans[index % this.internetPlans.length]
      : null;
    const items: ContractItem[] = [
      {
        serviceId: plan?.id ?? IdGenerator.generate('SRV', 5000 + (index % 5)),
        quantity: 1,
        unitPrice: plan?.price ?? FakerHelpers.randomAmount(399, 1599),
        locked: true, // Internet services are locked
      },
    ];

    // 50% chance to add an add-on service
    if (FakerHelpers.chance(0.5)) {
      const addOn = this.addOns.length
        ? FakerHelpers.randomElement(this.addOns)
        : null;
      items.push({
        serviceId: addOn?.id ?? IdGenerator.generate('SRV', 5100),
        quantity: 1,
        unitPrice: addOn?.price ?? FakerHelpers.randomAmount(49, 149),
      } as ContractItem);
    }

    const totalMonthly = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    const status = FakerHelpers.weightedRandomElement(
      ['ACTIVE', 'PENDING_SIGNATURE', 'EXPIRED', 'CANCELLED'] as const,
      [0.7, 0.1, 0.15, 0.05],
    );

    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1); // 1-year contract term

    return this.createBaseRecord<ContractRecord>(
      IdGenerator.generate('CTR', 3000 + index),
      {
        contractNumber: `CTR-${new Date().getFullYear()}-${String(3000 + index).padStart(4, '0')}`,
        clientId: customerId,
        client: LookupMapper.getCustomerName(customerId),
        startDate: startDate,
        endDate: endDate.toISOString().split('T')[0],
        signedAt: status !== 'PENDING_SIGNATURE' ? startDate : undefined,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        status: status,
        items: items,
        description: `Contrato de ${status === 'ACTIVE' ? 'servicio activo' : 'servicio'}`,
      },
    );
  }

  /**
   * Generate contract for customer with specific services
   */
  generateForCustomer(
    customerId: string,
    internetServiceId: string,
    internetPrice: number,
    addOns?: Array<{ serviceId: string; price: number }>,
  ): ContractRecord {
    const startDate = FakerHelpers.randomDate(120);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    const items: ContractItem[] = [
      {
        serviceId: internetServiceId,
        quantity: 1,
        unitPrice: internetPrice,
        locked: true,
      },
    ];

    if (addOns) {
      items.push(...addOns.map((addon) => ({
        serviceId: addon.serviceId,
        unitPrice: addon.price,
        quantity: 1
      })));
    }

    const totalMonthly = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return this.createBaseRecord<ContractRecord>(
      IdGenerator.generate('CTR', 3000),
      {
        contractNumber: `CTR-${new Date().getFullYear()}-${FakerHelpers.randomInt(1000, 9999)}`,
        clientId: customerId,
        client: LookupMapper.getCustomerName(customerId),
        startDate: startDate,
        endDate: endDate.toISOString().split('T')[0],
        signedAt: startDate,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        status: 'ACTIVE' as const,
        items: items,
        description: 'Contrato de servicio de Internet',
      },
    );
  }
}

// ============================================================================
// ASSIGNMENTS GENERATOR
// ============================================================================

export class AssignmentsGenerator extends BaseGenerator<AssignmentRecord> {
  private customerIds = LookupMapper.getAllCustomerIds();
  /** Equipo real del inventario; se inyecta antes de generar. */
  private equipmentPool: ReadonlyArray<{ id: string; name: string; serialNumber?: string }> = [];

  /**
   * Las asignaciones deben apuntar a equipo que existe. Sin este pool,
   * `IdGenerator` (contador compartido por prefijo) inventaría ids nuevos.
   */
  setEquipmentPool(
    equipment: ReadonlyArray<{ id: string; name: string; serialNumber?: string }>,
  ): void {
    this.equipmentPool = equipment;
  }

  generate(index: number = 0): AssignmentRecord {
    const customerId = this.customerIds[index % this.customerIds.length];
    const unit = this.equipmentPool.length
      ? this.equipmentPool[index % this.equipmentPool.length]
      : null;
    const equipmentId = unit?.id ?? IdGenerator.generate('EQ', 1000 + index);
    const equipmentLabel = unit?.name ?? LookupMapper.getEquipmentName(equipmentId);
    const assignedAt = FakerHelpers.randomDate(90);

    // 70% active, 30% returned
    const status = FakerHelpers.weightedRandomElement(['ACTIVE', 'RETURNED'] as const, [0.7, 0.3]);

    const returnedAt =
      status === 'RETURNED'
        ? new Date(assignedAt).toISOString().split('T')[0]
        : undefined;

    return this.createBaseRecord<AssignmentRecord>(
      IdGenerator.generate('ASG', 2000 + index),
      {
        name: assignmentFolio(index + 1, new Date(assignedAt).getFullYear()),
        clientId: customerId,
        client: LookupMapper.getCustomerName(customerId),
        equipmentId: equipmentId,
        equipment: equipmentLabel,
        serial: unit?.serialNumber,
        assignedAt: assignedAt,
        returnedAt: returnedAt,
        status: status,
        description: `Asignación de equipo a cliente ${customerId}`,
      },
    );
  }

  /**
   * Generate assignment for specific equipment and customer
   */
  generateForEquipmentAndCustomer(
    equipmentId: string,
    customerId: string,
  ): AssignmentRecord {
    const assignedAt = FakerHelpers.randomDate(90);

    return this.createBaseRecord<AssignmentRecord>(
      IdGenerator.generate('ASG', 2000),
      {
        name: assignmentFolio(1, new Date(assignedAt).getFullYear()),
        clientId: customerId,
        client: LookupMapper.getCustomerName(customerId),
        equipmentId: equipmentId,
        equipment: LookupMapper.getEquipmentName(equipmentId),
        assignedAt: assignedAt,
        status: 'ACTIVE' as const,
        description: `Asignación de ${equipmentId} a ${customerId}`,
      },
    );
  }
}

// ============================================================================
// EXPENSES GENERATOR
// ============================================================================

export class ExpensesGenerator extends BaseGenerator<ExpenseRecord> {
  private vendors = [
    'Ubiquiti Networks',
    'TP-Link',
    'Cisco Systems',
    'Netgear',
    'Mikrotik',
    'Proveedor Local A',
    'Proveedor Local B',
  ];

  private descriptions = [
    'Antena CPE 5GHz',
    'Router Wi-Fi N300',
    'Switch de 24 puertos',
    'Fuente de poder PoE',
    'Cable de red Cat6',
    'Conectores SMA',
    'Herramientas de instalación',
    'Servicio de mantenimiento',
    'Renta de equipo',
    'Capacitación técnica',
  ];

  generate(index: number = 0): ExpenseRecord {
    const categories = [
      'ELECTRICITY',
      'INTERNET',
      'CABLE',
      'EQUIPMENT',
      'RENT',
      'SALARY',
      'MAINTENANCE',
      'OTHER',
    ] as const;

    const category = FakerHelpers.randomElement(categories);
    const vendor = FakerHelpers.randomElement(this.vendors);
    const description = FakerHelpers.randomElement(this.descriptions);

    let amount = 0;
    switch (category) {
      case 'ELECTRICITY':
        amount = FakerHelpers.randomAmount(2000, 5000);
        break;
      case 'INTERNET':
        amount = FakerHelpers.randomAmount(5000, 15000);
        break;
      case 'CABLE':
        amount = FakerHelpers.randomAmount(1000, 3000);
        break;
      case 'EQUIPMENT':
        amount = FakerHelpers.randomAmount(5000, 25000);
        break;
      case 'RENT':
        amount = FakerHelpers.randomAmount(15000, 40000);
        break;
      case 'SALARY':
        amount = FakerHelpers.randomAmount(30000, 100000);
        break;
      case 'MAINTENANCE':
        amount = FakerHelpers.randomAmount(2000, 10000);
        break;
      default:
        amount = FakerHelpers.randomAmount(500, 5000);
    }

    return this.createBaseRecord<ExpenseRecord>(
      IdGenerator.generate('EXP', 6000 + index),
      {
        description: description,
        vendor: vendor,
        category: category,
        amount: Math.round(amount * 100) / 100,
        date: FakerHelpers.randomDate(60),
      },
    );
  }

  /**
   * Generate expenses by category
   */
  generateByCategory(
    category: string,
    count: number,
  ): ExpenseRecord[] {
    return Array.from({ length: count }, (_, i) => {
      const record = this.generate(i);
      record.category = category as any;
      return record;
    });
  }
}
