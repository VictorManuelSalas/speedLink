/**
 * Faker Helpers Utility
 * Generate realistic test data with seeded randomness
 */

export class FakerHelpers {
  private static readonly seed = 12345;
  private static rng = this.seededRandom(this.seed);

  static reset(seed: number = 12345): void {
    this.rng = this.seededRandom(seed);
  }

  private static seededRandom(seed: number) {
    return function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  // ========================================================================
  // PERSONS & NAMES
  // ========================================================================

  private static readonly firstNames = [
    'José Luis', 'María Carmen', 'Juan', 'Pedro', 'Carlos',
    'Ana', 'Fernando', 'Rosa', 'Miguel', 'Patricia',
    'López', 'García', 'Martínez', 'Rodríguez', 'Hernández',
    'González', 'Díaz', 'Morales', 'Reyes', 'Santos',
  ];

  private static readonly lastNames = [
    'Hernández', 'García', 'López', 'Martínez', 'Rodríguez',
    'Díaz', 'Morales', 'Santos', 'Reyes', 'Torres',
    'Vargas', 'Castillo', 'Jiménez', 'Ramos', 'Flores',
  ];

  private static readonly companyNames = [
    'Consultorio Dental Sonríe',
    'Tienda del Barrio',
    'Taller de Reparaciones',
    'Oficina Administrativa',
    'Centro Médico',
    'Salón de Belleza',
    'Farmacia Central',
    'Pastelería Don Carlos',
    'Oficina Contable',
    'Estudio Jurídico',
  ];

  static randomFirstName(): string {
    return this.firstNames[Math.floor(this.rng() * this.firstNames.length)];
  }

  static randomLastName(): string {
    return this.lastNames[Math.floor(this.rng() * this.lastNames.length)];
  }

  static randomFullName(): string {
    return `${this.randomFirstName()} ${this.randomLastName()}`;
  }

  static randomCompanyName(): string {
    return this.companyNames[Math.floor(this.rng() * this.companyNames.length)];
  }

  // ========================================================================
  // CONTACT INFORMATION
  // ========================================================================

  static randomEmail(name: string): string {
    const sanitized = name.toLowerCase().replace(/\s+/g, '.');
    return `${sanitized}@speedlink.mx`;
  }

  static randomPhone(): string {
    const areaCode = String(Math.floor(this.rng() * 900) + 100).slice(0, 3);
    const exchange = String(Math.floor(this.rng() * 900) + 100).slice(0, 3);
    const lineNumber = String(Math.floor(this.rng() * 9000) + 1000);
    return `(${areaCode}) ${exchange}-${lineNumber}`;
  }

  static randomMobilePhone(): string {
    const areaCode = String(Math.floor(this.rng() * 9) + 5);
    const number = String(Math.floor(this.rng() * 10000000)).padStart(7, '0');
    return `+52${areaCode}${number}`;
  }

  // ========================================================================
  // ADDRESSES
  // ========================================================================

  private static readonly streets = [
    'Avenida Constitución',
    'Calle Principal',
    'Paseo de la República',
    'Avenida Libertad',
    'Calle Allende',
    'Avenida México',
    'Calle Benito Juárez',
    'Avenida Reforma',
    'Calle Hidalgo',
    'Avenida Madero',
  ];

  private static readonly neighborhoods = [
    'Centro',
    'Zona Comercial',
    'Residencial',
    'Suburbano',
    'Industrial',
    'Villa Nueva',
    'El Dorado',
    'Bosques',
    'Colinas',
    'Jardines',
  ];

  static randomAddress(): string {
    const street = this.streets[Math.floor(this.rng() * this.streets.length)];
    const number = Math.floor(this.rng() * 999) + 1;
    const neighborhood = this.neighborhoods[Math.floor(this.rng() * this.neighborhoods.length)];
    return `${street} ${number}, ${neighborhood}`;
  }

  static randomGeoCoordinates(): [number, number] {
    const latitude = 25.6866 + (this.rng() - 0.5) * 0.5; // Around Monterrey, Mexico
    const longitude = -100.3161 + (this.rng() - 0.5) * 0.5;
    return [latitude, longitude];
  }

  // ========================================================================
  // BUSINESS DATA
  // ========================================================================

  static randomAmount(min: number = 100, max: number = 5000): number {
    return Math.round((this.rng() * (max - min) + min) * 100) / 100;
  }

  static randomDate(daysAgo: number = 30): string {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(this.rng() * daysAgo));
    return date.toISOString().split('T')[0];
  }

  static randomDateRange(startDaysAgo: number, endDaysAgo: number): [string, string] {
    const start = Math.max(startDaysAgo, endDaysAgo);
    const end = Math.min(startDaysAgo, endDaysAgo);
    return [
      this.randomDate(start),
      this.randomDate(end),
    ];
  }

  static randomInvoiceNumber(): string {
    return `INV-${Math.floor(this.rng() * 9000) + 1000}`;
  }

  static randomSerialNumber(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 8 })
      .map(() => chars[Math.floor(this.rng() * chars.length)])
      .join('');
  }

  // ========================================================================
  // PLANS & SERVICES
  // ========================================================================

  static readonly plans = ['Basic', 'Standard', 'Premium', 'Elite'];
  static readonly speeds = ['10 Mbps', '20 Mbps', '50 Mbps', '100 Mbps', '150 Mbps'];

  static randomPlan(): string {
    return this.plans[Math.floor(this.rng() * this.plans.length)];
  }

  static randomSpeed(): string {
    return this.speeds[Math.floor(this.rng() * this.speeds.length)];
  }

  static randomMonthlyFee(): number {
    return this.randomAmount(299, 1299);
  }

  // ========================================================================
  // STATUSES & SELECTIONS
  // ========================================================================

  /**
   * Azar sembrado. Los generadores no deben usar Math.random(): si una rama
   * depende de él y consume `rng`, la secuencia cambia en cada carga y los
   * datos demo (contratos, estados, asignaciones) dejan de ser estables.
   */
  static chance(probability: number): boolean {
    return this.rng() < probability;
  }

  static randomInt(min: number, max: number): number {
    return min + Math.floor(this.rng() * (max - min + 1));
  }

  static randomElement<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length)];
  }

  static weightedRandomElement<T>(
    items: readonly T[],
    weights: readonly number[],
  ): T {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = this.rng() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // ========================================================================
  // EQUIPMENT DATA
  // ========================================================================

  static readonly equipmentBrands = ['Ubiquiti', 'TP-Link', 'Cisco', 'Mikrotik', 'Netgear'];
  static readonly equipmentModels = [
    'LiteBeam 5AC',
    'NanoStation 5AC',
    'Archer C6',
    'C3150',
    'RB2011UiAS',
    'WNDR3700',
    'RB951Ui-2nD',
  ];

  static randomBrand(): string {
    return this.equipmentBrands[Math.floor(this.rng() * this.equipmentBrands.length)];
  }

  static randomModel(): string {
    return this.equipmentModels[Math.floor(this.rng() * this.equipmentModels.length)];
  }

  // ========================================================================
  // PAYMENT METHODS & REFERENCES
  // ========================================================================

  static readonly paymentMethods = ['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD'];

  static randomPaymentMethod(): string {
    return this.paymentMethods[Math.floor(this.rng() * this.paymentMethods.length)];
  }

  static randomPaymentReference(): string {
    const prefix = ['CHK', 'TRANS', 'CARD', 'CASH'];
    const p = prefix[Math.floor(this.rng() * prefix.length)];
    const number = Math.floor(this.rng() * 999999);
    return `${p}-${number}`;
  }
}
