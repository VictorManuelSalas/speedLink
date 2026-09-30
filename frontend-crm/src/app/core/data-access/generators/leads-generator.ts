/**
 * Leads Generator
 * Generates realistic lead/prospect data
 */

import { BaseGenerator } from './base-generator';
import type { LeadRecord } from '../models/operational-records';
import { IdGenerator } from '../utils/id-generator';
import { FakerHelpers } from '../utils/faker-helpers';
import { SYSTEM_USERS } from '../system-users';

/** Los leads se reparten entre el equipo comercial y la administradora. */
const SALES_OWNER_IDS = SYSTEM_USERS.filter((user) =>
  ['Ventas', 'Administrador'].includes(user.role),
).map((user) => user.id);

export class LeadsGenerator extends BaseGenerator<LeadRecord> {
  private baseIds = ['SL-1050', 'SL-1051', 'SL-1052', 'SL-1053', 'SL-1054'];

  generate(index: number = 0): LeadRecord {
    const customerId = this.baseIds[index % this.baseIds.length];
    const fullName = FakerHelpers.randomFullName();
    const type = FakerHelpers.randomElement(['Hogar', 'Negocio'] as const);
    const source = FakerHelpers.randomElement([
      'Referido',
      'Redes sociales',
      'Sitio web',
      'Llamada',
    ] as const);

    // Vary status distribution: 60% new, 20% contacted, 15% qualified, 5% lost
    const status = FakerHelpers.weightedRandomElement(
      ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'] as const,
      [0.6, 0.2, 0.15, 0.05],
    );

    const [latitude, longitude] = FakerHelpers.randomGeoCoordinates();

    return this.createBaseRecord<LeadRecord>(`LD-${customerId}-${index}`, {
      name: fullName,
      email: FakerHelpers.randomEmail(fullName),
      phone: FakerHelpers.randomPhone(),
      cellphone: FakerHelpers.chance(0.7) ? FakerHelpers.randomMobilePhone() : undefined,
      type,
      address: FakerHelpers.randomAddress(),
      latitude: Math.round(latitude * 10000) / 10000,
      longitude: Math.round(longitude * 10000) / 10000,
      source,
      status,
      owner: FakerHelpers.randomElement(SALES_OWNER_IDS),
      description:
        status === 'LOST'
          ? 'Lead no mostró interés en el producto'
          : `Prospecto de ${type.toLowerCase()} interesado en Internet`,
    });
  }

  /**
   * Generate leads with specific status distribution
   */
  generateWithDistribution(
    counts: Partial<Record<'NEW' | 'CONTACTED' | 'QUALIFIED' | 'LOST' | 'CONVERTED', number>>,
  ): LeadRecord[] {
    const records: LeadRecord[] = [];
    let index = 0;

    for (const [status, count] of Object.entries(counts)) {
      if (count && count > 0) {
        for (let i = 0; i < count; i++) {
          const record = this.generate(index++);
          record.status = status as any;
          records.push(record);
        }
      }
    }

    return records;
  }

  /**
   * Generate conversion from lead to customer data
   */
  generateCustomerFromLead(lead: LeadRecord): Record<string, any> {
    return {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      cellphone: lead.cellphone,
      address: lead.address,
      latitude: lead.latitude,
      longitude: lead.longitude,
      community: 'Comunidad Central',
      status: 'active' as const,
      plan: FakerHelpers.randomPlan(),
      speed: FakerHelpers.randomSpeed(),
      monthlyFee: FakerHelpers.randomMonthlyFee(),
      billingDay: FakerHelpers.randomInt(1, 28),
      currentBalance: 0,
      technician: FakerHelpers.randomFullName(),
      lastActivity: new Date().toISOString().split('T')[0],
      installDate: FakerHelpers.randomDate(60),
      gpsLocation: `${lead.latitude},${lead.longitude}`,
      ipAddress: `10.20.${FakerHelpers.randomInt(0, 255)}.${FakerHelpers.randomInt(0, 255)}`,
    };
  }
}
