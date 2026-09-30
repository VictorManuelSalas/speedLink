import { signal } from '@angular/core';

/** Datos de la empresa: aparecen en documentos, plantillas y correos. */
export interface OrganizationProfile {
  readonly code: string;
  readonly tradeName: string;
  readonly legalName: string;
  readonly rfc: string;
  readonly taxRegime: string;
  readonly fiscalPostalCode: string;
  readonly email: string;
  readonly phone: string;
  readonly website: string;
  readonly street: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  /** Imagen en data URL (PNG o JPG), o vacío. */
  readonly logo: string;
  /** Prefijo del folio de factura, p. ej. `FAC` → FAC-000124. */
  readonly invoiceSeries: string;
  readonly nextInvoiceNumber: number;
  /** Días entre la emisión y el vencimiento de una factura. */
  readonly paymentTermsDays: number;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

/** Regímenes fiscales del SAT (catálogo c_RegimenFiscal) más comunes. */
export const TAX_REGIMES: ReadonlyArray<{ code: string; label: string }> = [
  { code: '601', label: '601 · General de Ley Personas Morales' },
  { code: '603', label: '603 · Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 · Sueldos y Salarios' },
  { code: '606', label: '606 · Arrendamiento' },
  { code: '612', label: '612 · Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '621', label: '621 · Incorporación Fiscal' },
  { code: '625', label: '625 · Actividades Empresariales con ingresos a través de Plataformas' },
  { code: '626', label: '626 · Régimen Simplificado de Confianza (RESICO)' },
];

export const MX_STATES: ReadonlyArray<string> = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

export const SEED_ORGANIZATION: OrganizationProfile = {
  code: 'SL-MX-01',
  tradeName: 'SpeedLink Telecom',
  legalName: 'SpeedLink Telecomunicaciones S.A. de C.V.',
  rfc: 'STE200115AB3',
  taxRegime: '601',
  fiscalPostalCode: '55600',
  email: 'contacto@speedlink.mx',
  phone: '+52 55 4100 2200',
  website: 'https://speedlink.mx',
  street: 'Av. Hidalgo 120, Centro',
  city: 'Zumpango',
  state: 'Estado de México',
  postalCode: '55600',
  logo: '',
  invoiceSeries: 'FAC',
  nextInvoiceNumber: 1,
  paymentTermsDays: 10,
  updatedAt: '2026-01-12T09:30:00-06:00',
  updatedBy: 'Andrea Torres',
};

/** Dirección en una línea, como se imprime en documentos. */
export function formatAddress(profile: OrganizationProfile): string {
  const cityLine = [profile.city, profile.state].filter(Boolean).join(', ');
  return [profile.street, cityLine, profile.postalCode && `C.P. ${profile.postalCode}`]
    .filter(Boolean)
    .join(', ');
}

/**
 * RFC mexicano: 3 letras (moral) o 4 (física), fecha AAMMDD y homoclave de 3.
 * Sólo valida el formato; la existencia la confirma el SAT al timbrar.
 */
export function isValidRfc(rfc: string): boolean {
  const match = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{3})$/.exec(rfc.trim().toUpperCase());
  if (!match) return false;
  const month = Number(match[3]);
  const day = Number(match[4]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

// ------------------------------------------------------------ Vista en vivo

const liveProfile = signal<OrganizationProfile>(SEED_ORGANIZATION);

export function setLiveOrganization(profile: OrganizationProfile): void {
  liveProfile.set(profile);
}

export function currentOrganization(): OrganizationProfile {
  return liveProfile();
}

/**
 * Forma breve que ya usaban documentos y plantillas. Son getters: cada lectura
 * toma el perfil vigente, así lo que se edite en Ajustes aparece sin cambiar
 * a quienes lo consumen.
 */
export const ORGANIZATION = {
  get name(): string {
    return liveProfile().tradeName;
  },
  get legalName(): string {
    return liveProfile().legalName;
  },
  get rfc(): string {
    return liveProfile().rfc;
  },
  get code(): string {
    return liveProfile().code;
  },
  get email(): string {
    return liveProfile().email;
  },
  get phone(): string {
    return liveProfile().phone;
  },
  get website(): string {
    return liveProfile().website;
  },
  get address(): string {
    return formatAddress(liveProfile());
  },
  get logo(): string {
    return liveProfile().logo;
  },
};

// ------------------------------------------------------------------ Impuestos

/** `rate`: tasa porcentual; `exempt`: exento (no causa impuesto, distinto de tasa 0%). */
export type TaxFactor = 'rate' | 'exempt';

export interface TaxRate {
  readonly id: string;
  readonly name: string;
  readonly factor: TaxFactor;
  /** Porcentaje, p. ej. 16 para 16%. Siempre 0 si es exento. */
  readonly rate: number;
  readonly description: string;
  readonly active: boolean;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const TAX_SEED_DATE = '2026-01-12T09:30:00-06:00';

export const SEED_TAXES: ReadonlyArray<TaxRate> = [
  {
    id: 'tax-iva-16',
    name: 'IVA 16%',
    factor: 'rate',
    rate: 16,
    description: 'Tasa general de IVA.',
    active: true,
    isDefault: true,
    createdAt: TAX_SEED_DATE,
    updatedAt: TAX_SEED_DATE,
  },
  {
    id: 'tax-iva-8',
    name: 'IVA 8% frontera',
    factor: 'rate',
    rate: 8,
    description: 'Estímulo fiscal para la región fronteriza norte y sur.',
    active: true,
    isDefault: false,
    createdAt: TAX_SEED_DATE,
    updatedAt: TAX_SEED_DATE,
  },
  {
    id: 'tax-iva-0',
    name: 'IVA 0%',
    factor: 'rate',
    rate: 0,
    description: 'Tasa 0%: causa IVA pero a tasa cero.',
    active: false,
    isDefault: false,
    createdAt: TAX_SEED_DATE,
    updatedAt: TAX_SEED_DATE,
  },
  {
    id: 'tax-exempt',
    name: 'Exento',
    factor: 'exempt',
    rate: 0,
    description: 'Actos exentos de IVA.',
    active: false,
    isDefault: false,
    createdAt: TAX_SEED_DATE,
    updatedAt: TAX_SEED_DATE,
  },
];

export interface TaxBreakdown {
  readonly subtotal: number;
  readonly taxAmount: number;
  readonly total: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Impuesto y total a partir del subtotal, redondeados a centavos. */
export function computeTax(subtotal: number, tax: Pick<TaxRate, 'factor' | 'rate'> | undefined): TaxBreakdown {
  const base = round2(Math.max(0, subtotal) || 0);
  const taxAmount = tax && tax.factor === 'rate' ? round2((base * tax.rate) / 100) : 0;
  return { subtotal: base, taxAmount, total: round2(base + taxAmount) };
}

export function taxLabel(tax: Pick<TaxRate, 'factor' | 'rate'>): string {
  return tax.factor === 'exempt' ? 'Exento' : `${tax.rate}%`;
}

const liveTaxes = signal<ReadonlyArray<TaxRate>>(SEED_TAXES);

export function setLiveTaxes(taxes: ReadonlyArray<TaxRate>): void {
  liveTaxes.set(taxes);
}

/** Catálogo vigente, para formularios que no inyectan el store (definiciones de módulo). */
export function currentTaxes(): ReadonlyArray<TaxRate> {
  return liveTaxes();
}

export function defaultTax(): TaxRate | undefined {
  return liveTaxes().find((tax) => tax.isDefault && tax.active) ?? liveTaxes().find((t) => t.active);
}
