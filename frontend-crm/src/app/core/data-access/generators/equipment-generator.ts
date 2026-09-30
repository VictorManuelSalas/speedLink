/**
 * Equipment Generator
 * Generates network equipment and hardware data
 */

import { BaseGenerator } from './base-generator';
import type { EquipmentRecord } from '../models/operational-records';
import { IdGenerator } from '../utils/id-generator';
import { FakerHelpers } from '../utils/faker-helpers';
import { LookupMapper } from '../utils/lookup-mapper';

export class EquipmentGenerator extends BaseGenerator<EquipmentRecord> {
  /**
   * Cada modelo lleva su marca. Antes la marca se sorteaba aparte con
   * `FakerHelpers.randomBrand()` y salían combinaciones imposibles, como
   * marca "Mikrotik" con modelo "Ubiquiti LiteBeam 5AC".
   */
  private equipmentTypes = [
    {
      name: 'Antena CPE',
      models: [
        { brand: 'Ubiquiti', model: 'LiteBeam 5AC' },
        { brand: 'Ubiquiti', model: 'NanoStation 5AC' },
        { brand: 'Mikrotik', model: 'LHG 5' },
      ],
      cost: 1200,
    },
    {
      name: 'Router Wi-Fi',
      models: [
        { brand: 'TP-Link', model: 'Archer C6' },
        { brand: 'TP-Link', model: 'C3150' },
        { brand: 'Netgear', model: 'Nighthawk' },
      ],
      cost: 800,
    },
    {
      name: 'Switch de Red',
      models: [
        { brand: 'Cisco', model: 'Catalyst 2950' },
        { brand: 'TP-Link', model: 'LS105G' },
        { brand: 'Netgear', model: 'GS105' },
      ],
      cost: 400,
    },
    {
      name: 'Fuente de Poder',
      models: [
        { brand: 'Ubiquiti', model: 'PoE Injector 48V' },
        { brand: 'Mikrotik', model: 'Fuente 12V 2A' },
        { brand: 'Cisco', model: 'Fuente 24V 1A' },
      ],
      cost: 150,
    },
  ];

  generate(index: number = 0): EquipmentRecord {
    const typeIndex = index % this.equipmentTypes.length;
    const type = this.equipmentTypes[typeIndex];
    const unit = type.models[Math.floor(index / this.equipmentTypes.length) % type.models.length];

    const status = FakerHelpers.weightedRandomElement(
      ['AVAILABLE', 'ASSIGNED', 'DAMAGED', 'RETIRED'] as const,
      [0.6, 0.25, 0.1, 0.05],
    );

    const purchaseDate = FakerHelpers.randomDate(180);

    // Sólo clientes que existen en el catálogo real.
    const customerIds = LookupMapper.getAllCustomerIds();
    const assignedToId =
      status === 'ASSIGNED' ? customerIds[index % customerIds.length] : undefined;

    return this.createBaseRecord<EquipmentRecord>(
      IdGenerator.generate('EQ', 1000 + index),
      {
        name: type.name,
        brand: unit.brand,
        model: `${unit.brand} ${unit.model}`,
        serialNumber: FakerHelpers.randomSerialNumber(),
        macAddress: IdGenerator.generateMacAddress(),
        status,
        purchaseCost: type.cost + FakerHelpers.randomInt(0, 499),
        purchaseDate: purchaseDate,
        assignedToId: assignedToId,
        // Etiqueta del cliente, para no tener que resolver el id en cada vista.
        assignedTo: assignedToId ? LookupMapper.getCustomerName(assignedToId) : undefined,
        description: `Equipo de ${type.name.toLowerCase()} modelo ${unit.brand} ${unit.model}`,
      },
    );
  }

  /**
   * Generate with specific customer assignments
   */
  generateWithAssignments(
    count: number,
    customerIds: string[],
  ): EquipmentRecord[] {
    const records: EquipmentRecord[] = [];

    for (let i = 0; i < count; i++) {
      const record = this.generate(i);

      // Assign 60% of equipment
      if (FakerHelpers.chance(0.6)) {
        record.status = 'ASSIGNED';
        record.assignedToId = customerIds[i % customerIds.length];
        record.assignedTo = LookupMapper.getCustomerName(record.assignedToId);
      }

      records.push(record);
    }

    return records;
  }
}
