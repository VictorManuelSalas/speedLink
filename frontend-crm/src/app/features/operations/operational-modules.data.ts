import { SYSTEM_USER_IDS, SYSTEM_USER_LABELS } from '../../core/data-access/system-users';
import { currentTaxes } from '../../core/organization/organization.model';

export type NativeModuleKey =
  | 'leads'
  | 'services'
  | 'equipment'
  | 'assignments'
  | 'contracts'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'customers';

/** Nativo o personalizado (`cm_…`, creado en Ajustes > Módulos). */
export type OperationalModuleKey = NativeModuleKey | `cm_${string}`;

export type ColumnType = 'text' | 'identity' | 'status' | 'money' | 'date' | 'lookup';

export interface OperationalRecord {
  id: string;
  [key: string]: string | number | boolean;
}

export interface ModuleField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'status' | 'lookup' | 'user';
  options?: ReadonlyArray<string>;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  schemaKey?: string;
  optionLabels?: Readonly<Record<string, string>>;
  validateAs?: 'email' | 'phone' | 'number' | 'date' | 'text' | 'url';
  lookupModule?: string;
  /** Lo calcula el sistema (p. ej. impuestos y total): se muestra pero no se captura. */
  computed?: boolean;
  /** Varias líneas en el formulario (campo personalizado de texto largo). */
  multiline?: boolean;
  /** Campo personalizado agregado desde Ajustes > Módulos. */
  custom?: boolean;
  helpText?: string;
}

export interface OperationalModuleDefinition {
  key: OperationalModuleKey;
  eyebrow: string;
  title: string;
  description: string;
  singular: string;
  /** Sólo módulos personalizados; los nativos se deducen del sustantivo. */
  gender?: 'm' | 'f';
  idPrefix: string;
  accent: string;
  columns: ReadonlyArray<{ key: string; label: string; type: ColumnType }>;
  fields: ReadonlyArray<ModuleField>;
  metrics: ReadonlyArray<{ label: string; value: string; detail: string; tone: string }>;
  records: ReadonlyArray<OperationalRecord>;
}

export const OPERATIONAL_MODULES: Readonly<
  Record<NativeModuleKey, OperationalModuleDefinition>
> = {
  leads: {
    key: 'leads',
    eyebrow: 'VENTAS',
    title: 'Leads',
    description: 'Prospectos, oportunidades y seguimiento comercial.',
    singular: 'lead',
    idPrefix: 'LD',
    accent: '#8b5cf6',
    metrics: [
      { label: 'Nuevos', value: '18', detail: 'Esta semana', tone: 'violet' },
      { label: 'Contactados', value: '42', detail: 'En seguimiento', tone: 'blue' },
      { label: 'Calificados', value: '16', detail: 'Alta intención', tone: 'green' },
      { label: 'Conversión', value: '28%', detail: '+4.2% este mes', tone: 'amber' },
    ],
    columns: [
      { key: 'name', label: 'Prospecto', type: 'identity' },
      { key: 'source', label: 'Origen', type: 'text' },
      { key: 'status', label: 'Estado', type: 'status' },
      { key: 'phone', label: 'Teléfono', type: 'text' },
      { key: 'email', label: 'Correo', type: 'text' },
      { key: 'updatedAt', label: 'Actualizado', type: 'date' },
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true, minLength: 2, maxLength: 150 },
      { key: 'email', label: 'Correo', type: 'text', required: true, validateAs: 'email' },
      { key: 'phone', label: 'Teléfono', type: 'text', required: true, validateAs: 'phone' },
      { key: 'cellphone', label: 'Celular', type: 'text', validateAs: 'phone' },
      {
        key: 'type',
        label: 'Tipo de prospecto',
        type: 'select',
        options: ['Hogar', 'Negocio'],
      },
      { key: 'address', label: 'Dirección', type: 'text', minLength: 5, maxLength: 255 },
      { key: 'latitude', label: 'Latitud', type: 'number', min: -90, max: 90 },
      { key: 'longitude', label: 'Longitud', type: 'number', min: -180, max: 180 },
      {
        key: 'source',
        label: 'Origen',
        type: 'select',
        required: true,
        options: ['Referido', 'Redes sociales', 'Sitio web', 'Llamada'],
      },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        required: true,
        options: ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST', 'CONVERTED'],
      },
      {
        key: 'owner',
        label: 'Responsable',
        type: 'user',
        options: SYSTEM_USER_IDS,
        optionLabels: SYSTEM_USER_LABELS,
      },
      { key: 'description', label: 'Descripción', type: 'text', maxLength: 1000 },
    ],
    records: [
      {
        id: 'LD-1084',
        owner: 'usr-carlos-madero',
        name: 'Distribuidora Nova',
        email: 'contacto@nova.mx',
        phone: '55 8201 4490',
        type: 'Negocio',
        address: 'Av. Industria 420, Naucalpan, Estado de México',
        latitude: 19.478331,
        longitude: -99.238182,
        source: 'Sitio web',
        status: 'QUALIFIED',
        updatedAt: '2026-07-18T12:20:00-06:00',
      },
      {
        id: 'LD-1083',
        owner: 'usr-sofia-guzman',
        name: 'Roberto Sánchez',
        email: 'roberto@email.mx',
        phone: '55 6123 8801',
        type: 'Hogar',
        address: 'Calle Morelos 18, Zumpango, Estado de México',
        latitude: 19.796804,
        longitude: -99.099112,
        source: 'Referido',
        status: 'CONTACTED',
        updatedAt: '2026-07-18T10:05:00-06:00',
      },
      {
        id: 'LD-1082',
        owner: 'usr-andrea-torres',
        name: 'Café Horizonte',
        email: 'hola@horizonte.mx',
        phone: '55 9012 3387',
        type: 'Negocio',
        address: 'Paseo del Lago 32, Cuautitlán Izcalli, Estado de México',
        latitude: 19.652808,
        longitude: -99.208419,
        source: 'Redes sociales',
        status: 'NEW',
        updatedAt: '2026-07-17T16:42:00-06:00',
      },
    ],
  },
  services: {
    key: 'services',
    eyebrow: 'CATÁLOGO',
    title: 'Servicios',
    description: 'Planes de internet, complementos y precios comerciales.',
    singular: 'servicio',
    idPrefix: 'SRV',
    accent: '#2563eb',
    metrics: [
      { label: 'Servicios activos', value: '12', detail: 'Catálogo vigente', tone: 'blue' },
      { label: 'Planes de internet', value: '6', detail: '5 a 100 Mbps', tone: 'violet' },
      { label: 'Ingreso promedio', value: '$428', detail: 'Por contrato', tone: 'green' },
      { label: 'Complementos', value: '6', detail: 'Servicios adicionales', tone: 'amber' },
    ],
    columns: [
      { key: 'name', label: 'Servicio', type: 'identity' },
      { key: 'type', label: 'Tipo', type: 'text' },
      { key: 'price', label: 'Precio', type: 'money' },
      { key: 'contracts', label: 'Contratos', type: 'text' },
      { key: 'status', label: 'Estado', type: 'status' },
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true, minLength: 2, maxLength: 150 },
      { key: 'description', label: 'Descripción', type: 'text', maxLength: 500 },
      { key: 'price', label: 'Precio', type: 'number', required: true, min: 0, max: 999999 },
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        options: ['Internet', 'Streaming', 'Complemento'],
      },
      { key: 'status', label: 'Estado', type: 'select', options: ['ACTIVE', 'INACTIVE', 'ARCHIVED'] },
    ],
    records: [
      {
        id: 'SRV-INT-10',
        name: 'Intermedio 10 Mbps',
        description: 'Internet inalámbrico residencial de 10 Mbps',
        type: 'Internet',
        price: 350,
        contracts: 412,
        status: 'ACTIVE',
      },
      {
        id: 'SRV-100',
        name: 'Business Pro 50 Mbps',
        type: 'Internet',
        price: 850,
        contracts: 184,
        status: 'ACTIVE',
      },
      {
        id: 'SRV-090',
        name: 'Premium 30 Mbps',
        type: 'Internet',
        price: 620,
        contracts: 327,
        status: 'ACTIVE',
      },
      {
        id: 'SRV-ADD-4',
        name: 'IP pública estática',
        type: 'Complemento',
        price: 120,
        contracts: 96,
        status: 'ACTIVE',
      },
    ],
  },
  equipment: {
    key: 'equipment',
    eyebrow: 'INVENTARIO',
    title: 'Equipamiento',
    description: 'Control de dispositivos, números de serie y disponibilidad.',
    singular: 'equipo',
    idPrefix: 'EQ',
    accent: '#7c3aed',
    metrics: [
      { label: 'Disponibles', value: '74', detail: 'Listos para asignar', tone: 'green' },
      { label: 'Asignados', value: '1,284', detail: 'En clientes', tone: 'blue' },
      { label: 'En reparación', value: '11', detail: 'Servicio técnico', tone: 'amber' },
      { label: 'Dañados', value: '6', detail: 'Requieren baja', tone: 'red' },
    ],
    columns: [
      { key: 'name', label: 'Equipo', type: 'identity' },
      { key: 'brand', label: 'Marca / modelo', type: 'text' },
      { key: 'serialNumber', label: 'Serie', type: 'text' },
      { key: 'macAddress', label: 'MAC', type: 'text' },
      { key: 'status', label: 'Estado', type: 'status' },
      { key: 'purchaseCost', label: 'Costo', type: 'money' },
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true, minLength: 2, maxLength: 150 },
      { key: 'brand', label: 'Marca', type: 'text', minLength: 2, maxLength: 100 },
      { key: 'model', label: 'Modelo', type: 'text', minLength: 2, maxLength: 100 },
      { key: 'serialNumber', label: 'Número de serie', type: 'text', minLength: 2, maxLength: 100 },
      { key: 'macAddress', label: 'Dirección MAC', type: 'text', required: true, validateAs: 'text', minLength: 17, maxLength: 17 },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: ['AVAILABLE', 'ASSIGNED', 'DAMAGED', 'RETIRED', 'IN_REPAIR'],
      },
      { key: 'purchaseCost', label: 'Costo', type: 'number', min: 0, max: 9999999 },
      { key: 'purchaseDate', label: 'Fecha de compra', type: 'date' },
      {
        key: 'assignedTo',
        label: 'Asignado a',
        type: 'select',
        options: ['SL-1040', 'SL-1041', 'SL-1042', 'SL-1043', 'SL-1044'],
        optionLabels: {
          'SL-1040': 'José Luis Hernández',
          'SL-1041': 'Morgan Díaz',
          'SL-1042': 'Consultorio Dental Sonríe',
          'SL-1043': 'Distribuidora Nova',
          'SL-1044': 'Arbarrotes La Esperanza',
        },
        schemaKey: 'assignedToId',
        lookupModule: 'customers',
      },
      { key: 'description', label: 'Descripción', type: 'text', maxLength: 1000 },
    ],
    records: [
      {
        id: 'EQ-4092',
        name: 'Antena CPE',
        brand: 'Ubiquiti · LiteBeam 5AC',
        serialNumber: 'LBE5AC-4092',
        macAddress: 'DC:9F:DB:4A:2B:31',
        status: 'AVAILABLE',
        purchaseCost: 1850,
      },
      {
        id: 'EQ-4091',
        name: 'Router Wi-Fi',
        brand: 'TP-Link · Archer C6',
        serialNumber: 'ARCHC6-4091',
        macAddress: '84:D8:1B:92:7C:29',
        status: 'ASSIGNED',
        purchaseCost: 920,
      },
      {
        id: 'EQ-4088',
        name: 'Access Point',
        brand: 'MikroTik · cAP ac',
        serialNumber: 'CAPAC-4088',
        macAddress: '48:8F:5A:31:22:09',
        status: 'IN_REPAIR',
        purchaseCost: 1460,
      },
    ],
  },
  assignments: {
    key: 'assignments',
    eyebrow: 'RED',
    title: 'Asignaciones',
    description: 'Relación de equipos instalados con clientes y ubicaciones.',
    singular: 'asignación',
    idPrefix: 'ASG',
    accent: '#0891b2',
    metrics: [
      { label: 'Asignaciones activas', value: '1,284', detail: 'Equipos instalados', tone: 'blue' },
      { label: 'Realizadas hoy', value: '7', detail: 'Nuevas instalaciones', tone: 'green' },
      { label: 'Devoluciones', value: '4', detail: 'Esta semana', tone: 'amber' },
      { label: 'Sin validar', value: '3', detail: 'Requieren revisión', tone: 'red' },
    ],
    columns: [
      { key: 'name', label: 'Folio', type: 'identity' },
      { key: 'client', label: 'Cliente', type: 'text' },
      { key: 'equipment', label: 'Equipo', type: 'text' },
      { key: 'serial', label: 'Serie', type: 'text' },
      { key: 'assignedAt', label: 'Asignado', type: 'date' },
      { key: 'status', label: 'Estado', type: 'status' },
    ],
    fields: [
      {
        key: 'client',
        label: 'Cliente',
        type: 'lookup',
        options: ['SL-1040', 'SL-1041', 'SL-1042', 'SL-1043', 'SL-1044'],
        optionLabels: {
          'SL-1040': 'José Luis Hernández García',
          'SL-1041': 'María del Carmen López Rodríguez',
          'SL-1042': 'Francisco Javier Martínez López',
          'SL-1043': 'Rosa María González Sánchez',
          'SL-1044': 'Juan Carlos Pérez Morales',
        },
        schemaKey: 'clientId',
        required: true,
        lookupModule: 'customers',
      },
      {
        key: 'equipment',
        label: 'Equipo',
        type: 'lookup',
        options: ['EQ-1000', 'EQ-1001', 'EQ-1002', 'EQ-1003', 'EQ-1004', 'EQ-1005', 'EQ-1006', 'EQ-1007', 'EQ-1008', 'EQ-1009', 'EQ-1010', 'EQ-1011', 'EQ-1012', 'EQ-1013', 'EQ-1014', 'EQ-1015', 'EQ-1016', 'EQ-1017', 'EQ-1018', 'EQ-1019'],
        optionLabels: {
          'EQ-1000': 'CPE 5GHz Ubiquiti',
          'EQ-1001': 'Router TP-Link AC1200',
          'EQ-1002': 'Switch Cisco 24 puertos',
          'EQ-1003': 'Fuente PoE 48V 10A',
          'EQ-1004': 'Antena sectorial 5.8GHz',
          'EQ-1005': 'CPE 5GHz Ubiquiti (backup)',
          'EQ-1006': 'Router Mikrotik hAP',
          'EQ-1007': 'Switch TP-Link 16 puertos',
          'EQ-1008': 'Fuente alimentación redundante',
          'EQ-1009': 'Amplificador de señal',
          'EQ-1010': 'Modem DOCSIS 3.0',
          'EQ-1011': 'Router 4G LTE',
          'EQ-1012': 'UPS 1000VA',
          'EQ-1013': 'Servidor local NAS',
          'EQ-1014': 'Firewall Mikrotik',
          'EQ-1015': 'CPE 2.4GHz TP-Link',
          'EQ-1016': 'Antena omnidireccional',
          'EQ-1017': 'Repetidor Wi-Fi',
          'EQ-1018': 'Controlador de acceso',
          'EQ-1019': 'Cámara IP PoE',
        },
        schemaKey: 'equipmentId',
        required: true,
        lookupModule: 'equipment',
      },
      { key: 'assignedAt', label: 'Fecha de asignación', type: 'date', validateAs: 'date' },
      { key: 'returnedAt', label: 'Fecha de devolución', type: 'date', validateAs: 'date' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: ['ACTIVE', 'RETURNED', 'INACTIVE'],
        required: true,
      },
      { key: 'description', label: 'Descripción', type: 'text', maxLength: 1000 },
    ],
    records: [
      {
        id: 'ASG-7831',
        name: 'ASG-2026-0003',
        client: 'SL-1040',
        equipment: 'EQ-4092',
        serial: 'LBE5AC-4092',
        assignedAt: '2026-07-18',
        status: 'ACTIVE',
      },
      {
        id: 'ASG-7830',
        name: 'ASG-2026-0002',
        client: 'SL-1041',
        equipment: 'EQ-4091',
        serial: 'ARCHC6-4091',
        assignedAt: '2026-07-17',
        status: 'ACTIVE',
      },
      {
        id: 'ASG-7818',
        name: 'ASG-2026-0001',
        client: 'SL-1042',
        equipment: 'EQ-4088',
        serial: 'CAPAC-4088',
        assignedAt: '2026-07-11',
        returnedAt: '2026-07-16',
        status: 'RETURNED',
      },
    ],
  },
  contracts: {
    key: 'contracts',
    eyebrow: 'COMERCIAL',
    title: 'Contratos',
    description: 'Vigencias, servicios contratados y mensualidades acordadas.',
    singular: 'contrato',
    idPrefix: 'CTR',
    accent: '#4f46e5',
    metrics: [
      { label: 'Activos', value: '1,216', detail: 'Contratos vigentes', tone: 'green' },
      { label: 'Por firmar', value: '23', detail: 'Pendientes', tone: 'amber' },
      { label: 'Vencen este mes', value: '18', detail: 'Requieren renovación', tone: 'red' },
      { label: 'MRR contratado', value: '$438k', detail: 'Ingreso mensual', tone: 'blue' },
    ],
    columns: [
      { key: 'contractNumber', label: 'Contrato', type: 'identity' },
      { key: 'client', label: 'Cliente', type: 'text' },
      { key: 'status', label: 'Estado', type: 'status' },
      { key: 'startDate', label: 'Inicio', type: 'date' },
      { key: 'endDate', label: 'Vencimiento', type: 'date' },
      { key: 'totalMonthly', label: 'Mensualidad', type: 'money' },
    ],
    fields: [
      { key: 'contractNumber', label: 'Número de contrato', type: 'text', required: true, minLength: 2, maxLength: 50 },
      {
        key: 'client',
        label: 'Cliente',
        type: 'lookup',
        options: ['SL-1040', 'SL-1041', 'SL-1042', 'SL-1043', 'SL-1044'],
        optionLabels: {
          'SL-1040': 'José Luis Hernández García',
          'SL-1041': 'María del Carmen López Rodríguez',
          'SL-1042': 'Francisco Javier Martínez López',
          'SL-1043': 'Rosa María González Sánchez',
          'SL-1044': 'Juan Carlos Pérez Morales',
        },
        schemaKey: 'clientId',
        required: true,
        lookupModule: 'customers',
      },
      { key: 'startDate', label: 'Fecha de inicio', type: 'date', required: true, validateAs: 'date' },
      { key: 'endDate', label: 'Fecha final', type: 'date', validateAs: 'date' },
      { key: 'signedAt', label: 'Fecha de firma', type: 'date', validateAs: 'date' },
      { key: 'totalMonthly', label: 'Mensualidad', type: 'number', required: true, min: 0, max: 999999 },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: ['PENDING_SIGNATURE', 'ACTIVE', 'EXPIRED', 'CANCELLED'],
      },
      { key: 'description', label: 'Descripción', type: 'text', maxLength: 1000 },
    ],
    records: [
      {
        id: 'CTR-2026-817',
        contractNumber: 'SL-CTR-0817',
        client: 'SL-1044',
        clientId: 'SL-1044',
        status: 'ACTIVE',
        startDate: '2026-01-15',
        endDate: '2027-01-14',
        totalMonthly: 350,
        items: '[{"serviceId":"SRV-INT-10","quantity":1,"unitPrice":350}]',
      },
      {
        id: 'CTR-2026-816',
        contractNumber: 'SL-CTR-0816',
        client: 'SL-1043',
        clientId: 'SL-1043',
        status: 'PENDING_SIGNATURE',
        startDate: '2026-07-20',
        endDate: '2027-07-19',
        totalMonthly: 850,
        items: '[{"serviceId":"SRV-100","quantity":1,"unitPrice":850}]',
      },
      {
        id: 'CTR-2025-604',
        contractNumber: 'SL-CTR-0604',
        client: 'SL-1041',
        clientId: 'SL-1041',
        status: 'EXPIRED',
        startDate: '2025-06-01',
        endDate: '2026-05-31',
        totalMonthly: 420,
        items: '[{"serviceId":"SRV-090","quantity":1,"unitPrice":420}]',
      },
    ],
  },
  invoices: {
    key: 'invoices',
    eyebrow: 'FINANZAS',
    title: 'Facturas',
    description: 'Emisión, vencimientos y estado de cobranza.',
    singular: 'factura',
    idPrefix: 'INV',
    accent: '#2563eb',
    metrics: [
      { label: 'Pendientes', value: '86', detail: '$31,420 MXN', tone: 'amber' },
      { label: 'Vencidas', value: '23', detail: '$9,840 MXN', tone: 'red' },
      { label: 'Pagadas este mes', value: '1,104', detail: '$396,700 MXN', tone: 'green' },
      { label: 'Borradores', value: '12', detail: 'Sin emitir', tone: 'blue' },
    ],
    columns: [
      { key: 'folio', label: 'Factura', type: 'identity' },
      { key: 'client', label: 'Cliente', type: 'text' },
      { key: 'issueDate', label: 'Emisión', type: 'date' },
      { key: 'dueDate', label: 'Vencimiento', type: 'date' },
      { key: 'total', label: 'Total', type: 'money' },
      { key: 'status', label: 'Estado', type: 'status' },
    ],
    fields: [
      { key: 'folio', label: 'Folio', type: 'text', required: true, minLength: 2, maxLength: 50 },
      {
        key: 'client',
        label: 'Cliente',
        type: 'lookup',
        options: ['SL-1040', 'SL-1041', 'SL-1042', 'SL-1043', 'SL-1044'],
        optionLabels: {
          'SL-1040': 'José Luis Hernández García',
          'SL-1041': 'María del Carmen López Rodríguez',
          'SL-1042': 'Francisco Javier Martínez López',
          'SL-1043': 'Rosa María González Sánchez',
          'SL-1044': 'Juan Carlos Pérez Morales',
        },
        schemaKey: 'clientId',
        required: true,
        lookupModule: 'customers',
      },
      { key: 'issueDate', label: 'Fecha de emisión', type: 'date', validateAs: 'date' },
      { key: 'dueDate', label: 'Fecha de vencimiento', type: 'date', required: true, validateAs: 'date' },
      { key: 'subtotal', label: 'Subtotal', type: 'number', required: true, min: 0, max: 9999999 },
      {
        key: 'taxName',
        label: 'Impuesto',
        type: 'select',
        required: true,
        schemaKey: 'taxRateId',
        // Catálogo vivo de Ajustes > Impuestos: sólo las tasas activas.
        get options() {
          return currentTaxes()
            .filter((tax) => tax.active)
            .map((tax) => tax.id);
        },
        get optionLabels() {
          return Object.fromEntries(currentTaxes().map((tax) => [tax.id, tax.name]));
        },
      },
      { key: 'taxAmount', label: 'Impuestos', type: 'number', min: 0, max: 9999999, computed: true },
      { key: 'total', label: 'Total', type: 'number', min: 0, max: 9999999, computed: true },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: ['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED'],
      },
      { key: 'description', label: 'Descripción', type: 'text', maxLength: 1000 },
    ],
    records: [
      {
        id: 'INV-4485',
        folio: 'INV-4485',
        client: 'SL-1040',
        issueDate: '2026-07-01',
        dueDate: '2026-07-10',
        total: 350,
        status: 'PAID',
      },
      {
        id: 'INV-4484',
        folio: 'INV-4484',
        client: 'SL-1041',
        issueDate: '2026-07-01',
        dueDate: '2026-07-10',
        total: 420,
        status: 'PENDING',
      },
      {
        id: 'INV-4481',
        folio: 'INV-4481',
        client: 'SL-1042',
        issueDate: '2026-06-01',
        dueDate: '2026-06-10',
        total: 700,
        status: 'OVERDUE',
      },
    ],
  },
  payments: {
    key: 'payments',
    eyebrow: 'FINANZAS',
    title: 'Pagos',
    description: 'Cobros recibidos, conciliación y métodos de pago.',
    singular: 'pago',
    idPrefix: 'PAY',
    accent: '#059669',
    metrics: [
      { label: 'Recibido hoy', value: '$18,400', detail: '47 pagos', tone: 'green' },
      { label: 'Esta semana', value: '$94,850', detail: '218 pagos', tone: 'blue' },
      { label: 'Por conciliar', value: '9', detail: '$4,230 MXN', tone: 'amber' },
      { label: 'Ticket promedio', value: '$412', detail: '+2.4% mensual', tone: 'violet' },
    ],
    columns: [
      { key: 'reference', label: 'Referencia', type: 'identity' },
      { key: 'client', label: 'Cliente', type: 'text' },
      { key: 'invoice', label: 'Factura', type: 'text' },
      { key: 'paidAt', label: 'Fecha', type: 'date' },
      { key: 'method', label: 'Método', type: 'text' },
      { key: 'amount', label: 'Importe', type: 'money' },
    ],
    fields: [
      {
        key: 'client',
        label: 'Cliente',
        type: 'lookup',
        options: ['SL-1040', 'SL-1041', 'SL-1042', 'SL-1043', 'SL-1044'],
        optionLabels: {
          'SL-1040': 'José Luis Hernández García',
          'SL-1041': 'María del Carmen López Rodríguez',
          'SL-1042': 'Francisco Javier Martínez López',
          'SL-1043': 'Rosa María González Sánchez',
          'SL-1044': 'Juan Carlos Pérez Morales',
        },
        schemaKey: 'clientId',
        required: true,
        lookupModule: 'customers',
      },
      {
        key: 'invoice',
        label: 'Factura',
        type: 'lookup',
        options: ['INV-4480', 'INV-4481', 'INV-4482', 'INV-4483', 'INV-4484', 'INV-4485', 'INV-4486', 'INV-4487', 'INV-4488', 'INV-4489', 'INV-4490', 'INV-4491', 'INV-4492', 'INV-4493', 'INV-4494', 'INV-4495', 'INV-4496', 'INV-4497', 'INV-4498', 'INV-4499', 'INV-4500', 'INV-4501', 'INV-4502', 'INV-4503', 'INV-4504', 'INV-4505', 'INV-4506', 'INV-4507', 'INV-4508', 'INV-4509', 'INV-4510', 'INV-4511', 'INV-4512', 'INV-4513', 'INV-4514', 'INV-4515', 'INV-4516', 'INV-4517', 'INV-4518', 'INV-4519'],
        optionLabels: {
          'INV-4480': 'FAC-SL-1040-0', 'INV-4481': 'FAC-SL-1041-1', 'INV-4482': 'FAC-SL-1042-2', 'INV-4483': 'FAC-SL-1043-3', 'INV-4484': 'FAC-SL-1044-4',
          'INV-4485': 'FAC-SL-1040-5', 'INV-4486': 'FAC-SL-1041-6', 'INV-4487': 'FAC-SL-1042-7', 'INV-4488': 'FAC-SL-1043-8', 'INV-4489': 'FAC-SL-1044-9',
          'INV-4490': 'FAC-SL-1040-10', 'INV-4491': 'FAC-SL-1041-11', 'INV-4492': 'FAC-SL-1042-12', 'INV-4493': 'FAC-SL-1043-13', 'INV-4494': 'FAC-SL-1044-14',
          'INV-4495': 'FAC-SL-1040-15', 'INV-4496': 'FAC-SL-1041-16', 'INV-4497': 'FAC-SL-1042-17', 'INV-4498': 'FAC-SL-1043-18', 'INV-4499': 'FAC-SL-1044-19',
          'INV-4500': 'FAC-SL-1040-20', 'INV-4501': 'FAC-SL-1041-21', 'INV-4502': 'FAC-SL-1042-22', 'INV-4503': 'FAC-SL-1043-23', 'INV-4504': 'FAC-SL-1044-24',
          'INV-4505': 'FAC-SL-1040-25', 'INV-4506': 'FAC-SL-1041-26', 'INV-4507': 'FAC-SL-1042-27', 'INV-4508': 'FAC-SL-1043-28', 'INV-4509': 'FAC-SL-1044-29',
          'INV-4510': 'FAC-SL-1040-30', 'INV-4511': 'FAC-SL-1041-31', 'INV-4512': 'FAC-SL-1042-32', 'INV-4513': 'FAC-SL-1043-33', 'INV-4514': 'FAC-SL-1044-34',
          'INV-4515': 'FAC-SL-1040-35', 'INV-4516': 'FAC-SL-1041-36', 'INV-4517': 'FAC-SL-1042-37', 'INV-4518': 'FAC-SL-1043-38', 'INV-4519': 'FAC-SL-1044-39',
        },
        schemaKey: 'invoiceId',
        lookupModule: 'invoices',
      },
      { key: 'amount', label: 'Importe', type: 'number', required: true, min: 0.01, max: 9999999 },
      {
        key: 'method',
        label: 'Método',
        type: 'select',
        options: ['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'CHECK', 'OTHER'],
      },
      { key: 'reference', label: 'Referencia', type: 'text', minLength: 2, maxLength: 100 },
      { key: 'paidAt', label: 'Fecha de pago', type: 'date', validateAs: 'date' },
      { key: 'notes', label: 'Notas', type: 'text', maxLength: 1000 },
    ],
    records: [
      {
        id: 'PAY-74021',
        reference: 'ACH-4421A',
        client: 'SL-1040',
        invoice: 'INV-4485',
        paidAt: '2026-07-08T10:24:00-06:00',
        method: 'CREDIT_CARD',
        amount: 350,
      },
      {
        id: 'PAY-74020',
        reference: 'CASH-1048',
        client: 'SL-1041',
        invoice: 'INV-4484',
        paidAt: '2026-07-05T09:02:00-06:00',
        method: 'BANK_TRANSFER',
        amount: 200,
      },
      {
        id: 'PAY-74019',
        reference: 'VISA-4291',
        client: 'SL-1042',
        invoice: 'INV-4481',
        paidAt: '2026-06-08T16:41:00-06:00',
        method: 'CREDIT_CARD',
        amount: 350,
      },
      {
        id: 'PAY-74018',
        reference: 'CASH-2891',
        client: 'SL-1042',
        invoice: 'INV-4481',
        paidAt: '2026-06-15T14:20:00-06:00',
        method: 'CASH',
        amount: 350,
      },
    ],
  },
  expenses: {
    key: 'expenses',
    eyebrow: 'FINANZAS',
    title: 'Gastos',
    description: 'Egresos operativos, proveedores y comprobantes.',
    singular: 'gasto',
    idPrefix: 'EXP',
    accent: '#dc2626',
    metrics: [
      { label: 'Este mes', value: '$86,420', detail: '74 registros', tone: 'red' },
      { label: 'Equipamiento', value: '$42,800', detail: '49.5% del total', tone: 'violet' },
      { label: 'Operación', value: '$28,300', detail: 'Servicios y renta', tone: 'blue' },
      { label: 'Sin comprobante', value: '6', detail: '$3,120 MXN', tone: 'amber' },
    ],
    columns: [
      { key: 'description', label: 'Concepto', type: 'identity' },
      { key: 'vendor', label: 'Proveedor', type: 'text' },
      { key: 'category', label: 'Categoría', type: 'status' },
      { key: 'date', label: 'Fecha', type: 'date' },
      { key: 'receiptUrl', label: 'Comprobante', type: 'text' },
      { key: 'amount', label: 'Importe', type: 'money' },
    ],
    fields: [
      { key: 'description', label: 'Concepto', type: 'text', required: true, minLength: 5, maxLength: 255 },
      { key: 'vendor', label: 'Proveedor', type: 'text', minLength: 2, maxLength: 150 },
      {
        key: 'category',
        label: 'Categoría',
        type: 'select',
        options: [
          'ELECTRICITY',
          'INTERNET',
          'CABLE',
          'EQUIPMENT',
          'RENT',
          'SALARY',
          'MAINTENANCE',
          'OTHER',
        ],
      },
      { key: 'amount', label: 'Importe', type: 'number', required: true, min: 0.01, max: 9999999 },
      { key: 'date', label: 'Fecha', type: 'date', required: true, validateAs: 'date' },
    ],
    records: [
      {
        id: 'EXP-3104',
        description: 'Lote de routers TP-Link Archer C6',
        vendor: 'TecnoRed MX',
        category: 'EQUIPMENT',
        date: '2026-07-18',
        amount: 18400,
      },
      {
        id: 'EXP-3103',
        description: 'Energía eléctrica · Torre Norte',
        vendor: 'CFE',
        category: 'ELECTRICITY',
        date: '2026-07-16',
        amount: 6280,
      },
      {
        id: 'EXP-3102',
        description: 'Mantenimiento unidad técnica',
        vendor: 'Taller San Juan',
        category: 'MAINTENANCE',
        date: '2026-07-15',
        amount: 3850,
      },
    ],
  },
  customers: {
    key: 'customers',
    eyebrow: 'CLIENTES',
    title: 'Clientes',
    description: 'Gestión de clientes, contactos y relaciones comerciales.',
    singular: 'cliente',
    idPrefix: 'SL',
    accent: '#059669',
    metrics: [
      { label: 'Activos', value: '1,248', detail: 'Clientes vigentes', tone: 'green' },
      { label: 'Nuevos', value: '46', detail: 'Este mes', tone: 'blue' },
      { label: 'Por contactar', value: '23', detail: 'Requieren seguimiento', tone: 'amber' },
      { label: 'Ingresos MRR', value: '$438k', detail: 'Mensual recurrente', tone: 'violet' },
    ],
    columns: [
      { key: 'name', label: 'Cliente', type: 'identity' },
      { key: 'type', label: 'Tipo', type: 'text' },
      { key: 'email', label: 'Correo', type: 'text' },
      { key: 'phone', label: 'Teléfono', type: 'text' },
      { key: 'status', label: 'Estado', type: 'status' },
    ],
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true, minLength: 2, maxLength: 150 },
      { key: 'type', label: 'Tipo', type: 'select', options: ['Hogar', 'Negocio'] },
      { key: 'email', label: 'Correo', type: 'text', validateAs: 'email' },
      { key: 'phone', label: 'Teléfono', type: 'text', validateAs: 'phone' },
      { key: 'address', label: 'Dirección', type: 'text' },
      { key: 'status', label: 'Estado', type: 'select', options: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
      { key: 'notes', label: 'Notas', type: 'text', maxLength: 1000 },
    ],
    records: [
      {
        id: 'SL-1040',
        name: 'José Luis Hernández García',
        type: 'Negocio',
        email: 'jlhernandez@example.com',
        phone: '(555) 123-4567',
        status: 'ACTIVE',
      },
      {
        id: 'SL-1041',
        name: 'María del Carmen López Rodríguez',
        type: 'Hogar',
        email: 'mclopez@example.com',
        phone: '(555) 234-5678',
        status: 'ACTIVE',
      },
      {
        id: 'SL-1042',
        name: 'Francisco Javier Martínez López',
        type: 'Negocio',
        email: 'fjmartinez@example.com',
        phone: '(555) 345-6789',
        status: 'ACTIVE',
      },
      {
        id: 'SL-1043',
        name: 'Rosa María González Sánchez',
        type: 'Hogar',
        email: 'rmgonzalez@example.com',
        phone: '(555) 456-7890',
        status: 'ACTIVE',
      },
      {
        id: 'SL-1044',
        name: 'Juan Carlos Pérez Morales',
        type: 'Negocio',
        email: 'jcperez@example.com',
        phone: '(555) 567-8901',
        status: 'ACTIVE',
      },
    ],
  },
};
