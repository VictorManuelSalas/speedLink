import { Injectable, Provider } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import { Customer, DashboardSummary } from '../models/customer';
import { CRM_DATA, CrmDataAccess } from './crm-data';

const ORG_ID = 'speedlink-mx-01';
const now = '2026-07-14T10:00:00-06:00';
const ADMIN_USER = {
  fullName: 'Andrea Torres',
  email: 'andrea.torres@speedlink.mx',
  initials: 'AT',
};
const STAFF_USERS = [
  { fullName: 'Carlos Mendoza', email: 'carlos.mendoza@speedlink.mx', initials: 'CM' },
  { fullName: 'Ana Torres', email: 'ana.torres@speedlink.mx', initials: 'AT' },
] as const;
const seedAuthor = (offset: number): string => STAFF_USERS[offset % STAFF_USERS.length].fullName;

const detail = (id: string, offset: number) => ({
  equipment: [
    {
      id: `EQ-CPE-${1040 + offset}`,
      name: 'Antena CPE',
      model: offset % 2 ? 'Ubiquiti LiteBeam 5AC' : 'Ubiquiti NanoStation 5AC',
      serial: `SL-CPE-${1040 + offset}`,
      mac: `DC:9F:DB:4A:2B:${(30 + offset).toString(16).toUpperCase()}`,
      ipAddress: `10.20.4.${20 + offset}`,
      status: 'online' as const,
    },
    {
      id: `EQ-RTR-${2090 + offset}`,
      name: 'Router Wi-Fi',
      model: 'TP-Link Archer C6',
      serial: `SL-RTR-${2090 + offset}`,
      mac: `84:D8:1B:92:7C:${(40 + offset).toString(16).toUpperCase()}`,
      ipAddress: '192.168.1.1',
      status: offset === 3 ? ('warning' as const) : ('online' as const),
    },
  ],
  invoices: [
    {
      id: `FAC-${id}-07`,
      issuedAt: '2026-07-01',
      dueAt: '2026-07-10',
      total: 350,
      status: offset === 3 ? ('overdue' as const) : ('paid' as const),
      payments: offset === 3
        ? [
          {
            id: `PAG-${6100 + offset}-1`,
            date: '2026-07-05',
            amount: 200,
            method: 'Tarjeta' as const,
            reference: `SL${74018 + offset}`,
          },
          {
            id: `PAG-${6100 + offset}-2`,
            date: '2026-07-08',
            amount: 150,
            method: 'Transferencia' as const,
            reference: `SL${74019 + offset}`,
          },
        ]
        : [
          {
            id: `PAG-${6100 + offset}-1`,
            date: '2026-07-08',
            amount: 350,
            method: offset % 2 ? ('Transferencia' as const) : ('Efectivo' as const),
            reference: `SL${74018 + offset}`,
          },
        ],
    },
    {
      id: `FAC-${id}-06`,
      issuedAt: '2026-06-01',
      dueAt: '2026-06-10',
      total: 350,
      status: 'paid' as const,
      payments: [
        {
          id: `PAG-${6000 + offset}-1`,
          date: '2026-06-08',
          amount: 175,
          method: 'Tarjeta' as const,
          reference: `SL${74000 + offset}`,
        },
        {
          id: `PAG-${6000 + offset}-2`,
          date: '2026-06-15',
          amount: 175,
          method: 'Transferencia' as const,
          reference: `SL${74001 + offset}`,
        },
      ],
    },
  ],
  payments: [
    {
      id: `PAG-${6100 + offset}`,
      date: '2026-07-08',
      amount: 350,
      method: offset % 2 ? ('Transferencia' as const) : ('Efectivo' as const),
      reference: `SL${74018 + offset}`,
    },
  ],
  tickets: [
    {
      id: `TK-${2290 + offset}`,
      clientId: id,
      subject: 'Intermitencia y pérdida de paquetes',
      description:
        'El cliente reporta cortes breves durante videollamadas. Solicita revisión de señal, alineación y saturación del sector.',
      category: 'Conectividad' as const,
      priority: 'high' as const,
      status: 'in_progress' as const,
      channel: 'WhatsApp' as const,
      assignedTo: seedAuthor(offset),
      assignedToId: `usr-${offset + 1}`,
      createdById: 'usr-andrea-torres',
      createdAt: '2026-07-14T09:41:00-06:00',
      updatedAt: '2026-07-14T11:20:00-06:00',
      slaDueAt: '2026-07-14T17:41:00-06:00',
      requester: 'Contacto principal',
      comments: [
        {
          id: `comment-${offset}-1`,
          message: 'Se validó conectividad y se programó revisión remota del enlace.',
          author: ADMIN_USER,
          isInternal: false,
          createdAt: '2026-07-14T10:02:00-06:00',
          attachments: [],
        },
      ],
      attachments: [],
    },
    {
      id: `TK-${2184 + offset}`,
      clientId: id,
      subject: 'Validar configuración de IP estática',
      description:
        'Se requiere confirmar gateway, máscara y DNS configurados en el router del cliente.',
      category: 'Conectividad' as const,
      priority: 'medium' as const,
      status: 'waiting' as const,
      channel: 'Correo' as const,
      assignedTo: STAFF_USERS[(offset + 1) % STAFF_USERS.length].fullName,
      assignedToId: `usr-${offset + 2}`,
      createdById: 'usr-andrea-torres',
      createdAt: '2026-06-28T10:15:00-06:00',
      updatedAt: '2026-06-28T13:32:00-06:00',
      slaDueAt: '2026-06-29T10:15:00-06:00',
      requester: 'Contacto principal',
      comments: [],
      attachments: [],
    },
    {
      id: `TK-${1901 + offset}`,
      clientId: id,
      subject: 'Cambio de contraseña Wi-Fi',
      description:
        'Se actualizó la contraseña de la red y se verificó la conexión de los dispositivos principales.',
      category: 'Equipo' as const,
      priority: 'low' as const,
      status: 'resolved' as const,
      channel: 'Teléfono' as const,
      assignedTo: seedAuthor(offset + 2),
      assignedToId: `usr-${offset + 3}`,
      createdById: 'usr-andrea-torres',
      resolvedAt: '2026-04-09T16:42:00-06:00',
      createdAt: '2026-04-09T16:05:00-06:00',
      updatedAt: '2026-04-09T16:42:00-06:00',
      slaDueAt: '2026-04-11T16:05:00-06:00',
      requester: 'Contacto principal',
      comments: [],
      attachments: [],
    },
  ],
  notes: [
    {
      id: `note-${offset}-1`,
      content:
        'Cliente confirmó continuidad del servicio. Revisar posibilidad de actualización de plan en el próximo trimestre.',
      createdAt: '2026-06-10T11:20:00-06:00',
      author: ADMIN_USER,
      pinned: true,
    },
    {
      id: `note-${offset}-2`,
      content:
        'Firmware de los equipos actualizado. La conectividad quedó estable después de las pruebas de latencia y pérdida de paquetes.',
      createdAt: '2026-04-22T16:45:00-06:00',
      author: STAFF_USERS[offset % STAFF_USERS.length],
      pinned: false,
    },
    {
      id: `note-${offset}-3`,
      content: 'Instalación completada y datos de contacto validados con el cliente.',
      createdAt: '2025-01-15T16:40:00-06:00',
      author: ADMIN_USER,
      pinned: false,
    },
  ],
  timeline: [
    {
      id: `t-${offset}-1`,
      title: 'Ticket abierto — Configuración de IP',
      detail: 'El cliente solicitó apoyo para validar la configuración de la IP estática.',
      date: '2026-07-14T09:41:00-06:00',
      type: 'ticket' as const,
      author: seedAuthor(offset),
    },
    {
      id: `t-${offset}-2`,
      title: 'Pago recibido — $350',
      detail: 'Factura mensual liquidada correctamente y conciliada en el sistema.',
      date: '2026-07-08T12:18:00-06:00',
      type: 'payment' as const,
      author: 'Sistema de pagos',
    },
    {
      id: `t-${offset}-3`,
      title: 'Factura generada',
      detail: 'Se generó la factura mensual del servicio contratado.',
      date: '2026-07-01T08:00:00-06:00',
      type: 'invoice' as const,
      author: 'Sistema',
    },
    {
      id: `t-${offset}-4`,
      title: 'Llamada de seguimiento',
      detail: 'Se confirmó que el servicio opera correctamente y no presenta intermitencias.',
      date: '2026-06-18T15:25:00-06:00',
      type: 'call' as const,
      author: seedAuthor(offset + 1),
    },
    {
      id: `t-${offset}-5`,
      title: 'Servicio instalado',
      detail: 'Equipo configurado y señal validada en el domicilio del cliente.',
      date: '2025-01-15T16:40:00-06:00',
      type: 'service' as const,
      author: seedAuthor(offset),
    },
  ],
});

/**
 * Coordenadas de la antena emisora. Todos los clientes cuelgan de este enlace,
 * así que sus coordenadas viven dentro de su radio de cobertura (~2 km): un
 * cliente lejos de la antena no tendría servicio y falsearía el mapa.
 */
export const ANTENNA_LOCATION = { latitude: 25.791999, longitude: -103.621043 } as const;

// Cada seed termina con su latitud y longitud: sin ellas el mapa de clientes
// apilaría todos los pines sobre un mismo punto.
const seeds = [
  [
    'SL-1042',
    'Rubi Nuñez Salas',
    'RN',
    'rubi.nunez@email.mx',
    '4493969735',
    'Calle de los Olivos 18',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Basico',
    '5 Mbps',
    300,
    4,
    0,
    'Carlos Mendoza',
    'Hace 35 min',
    25.790158, -103.617856

  ],
  [
    'SL-1043',
    'Herson Cervantes Alcantar',
    'HC',
    'cervantesalcantarh@gmail.com',
    '8715084696',
    'Av. del Trabajo 205',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Custom',
    '15 Mbps',
    400,
    12,
    0,
    'Diego Ramírez',
    'Hace 2 h',
    25.789743, -103.620865

  ],
  [
    'SL-1044',
    'Luis Nuñez Salas',
    'LN',
    'luis.nunez@email.mx',
    '8715720209',
    'Calle Primaria Norte 27',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    7,
    0,
    'Ana Torres',
    'Hace 42 min',
    25.792220, -103.621505

  ],
  [
    'SL-1045',
    'Viti Salas Hernandez',
    'VSH',
    'viti.salas@email.mx',
    '8141448826',
    'Calle Los Pinos 14',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Custom',
    '15 Mbps',
    400,
    10,
    0,
    'Carlos Mendoza',
    'Hace 18 min',
    25.791693, -103.620935


  ],
  [
    'SL-1046',
    'Lupercia Garcia',
    'LG',
    'lupercia.garcia@email.mx',
    '8717363317',
    'Calle Benito Juárez 32',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    6,
    0,
    'Ana Torres',
    'Ayer',
    25.788503, -103.620904

  ],
  [
    'SL-1047',
    'Naila Cervantes',
    'NC',
    'morabenjamin826@gmail.com',
    '8712188926',
    'Cerrada de los Cedros 16',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Custom',
    '15 Mbps',
    400,
    15,
    0,
    'Carlos Mendoza',
    'Hace 3 h',
    25.792074, -103.621427

  ],
  [
    'SL-1048',
    'Norma Pulido',
    'NP',
    'norma.pulido@email.mx',
    '8714018882',
    'Paseo de los Pinos 42',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    8,
    0,
    'Diego Ramírez',
    'Hace 5 h',
    25.790531, -103.621469

  ],
  [
    'SL-1049',
    'Cristina Estrada',
    'CE',
    'cristina.estrada@email.mx',
    '8711137002',
    'Calle Primaria Norte 41',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    5,
    0,
    'Ana Torres',
    'Hace 1 h',
    25.792176, -103.621124

  ],
  [
    'SL-1050',
    'Martina Tovar',
    'MT',
    'martina.tovar@email.mx',
    '8717363317',
    'Av. Hidalgo 109',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Basico',
    '5 Mbps',
    300,
    3,
    0,
    'Carlos Mendoza',
    'Hace 6 h',
    25.792110, -103.619248

  ],
  [
    'SL-1051',
    'Luis Alfonso Martínez Núñez',
    'LAMN',
    'luisponcho2509@gmail.com',
    '8714676589',
    'Calle Reforma 28',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    9,
    0,
    'Diego Ramírez',
    'Hace 4 h',
    25.789745, -103.621721
  ],
  [
    'SL-1052',
    'Carmen Nuñez Salas',
    'CNS',
    'carmen.nunez@email.mx',
    '8715811847',
    'Calle Morelos 17',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    11,
    0,
    'Ana Torres',
    'Ayer',
    25.793057, -103.621870

  ],
  [
    'SL-1053',
    'Gabriel Salas Aguilera',
    'GSA',
    'RociioMaciasSalas91@gmail.com',
    '8715015518',
    'Calle Independencia 54',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    6,
    0,
    'Carlos Mendoza',
    'Hace 8 h',
    25.792220, -103.622220
  ],
  [
    'SL-1054',
    'Tania Karime Valles',
    'TKV',
    'tvalles1995@gmail.com',
    '6183026798',
    'Calle Juárez 63',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    12,
    0,
    'Ana Torres',
    'Hace 5 h',
    25.791428, -103.624084

  ],
  [
    'SL-1055',
    'Jose - Liz',
    'JL',
    'josenunezsalas871@gmail.com',
    '8713984964',
    'Calle Allende 22',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Basico',
    '5 Mbps',
    300,
    4,
    0,
    'Diego Ramírez',
    'Hace 2 días',
    25.791938, -103.621046

  ],
  [
    'SL-1056',
    'Miriam Guerrero Nuñez',
    'MGN',
    'miriamguerrero2792@gmail.com',
    '8717955077',
    'Calle Las Palmas 31',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Custom',
    '15 Mbps',
    400,
    14,
    0,
    'Carlos Mendoza',
    'Hace 3 h',
    25.790595, -103.620447
  ],
  [
    'SL-1057',
    'Raul Guerrero Cital',
    'RGC',
    'raul.guerrero@email.mx',
    '8712317044',
    'Av. Constitución 77',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'suspended',
    'Intermedio',
    '10 Mbps',
    350,
    0,
    700,
    'Diego Ramírez',
    'Hace 8 días',
    25.790842, -103.620590

  ],
  [
    'SL-1058',
    'Alondra Castañeda Nuñez',
    'ACN',
    'alondra0909c@gmail.com',
    '8711490851',
    'Calle San Luis 12',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    9,
    0,
    'Ana Torres',
    'Hace 1 h',
    25.790113, -103.621371

  ],
  [
    'SL-1059',
    'Receptor',
    'RN',
    'victorsalasnz@gmail.com',
    '8141448826',
    'Calle del Nogal 8',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'inactive',
    'Basico',
    '10 Mbps',
    300,
    0,
    0,
    'Carlos Mendoza',
    'Hace 12 días',
    25.791943, -103.621049

  ],
  [
    'SL-1060',
    'Beatriz Adriana Nuñez Guerrero',
    'BANG',
    'romerohernandeza31@gmail.com',
    '8713607188',
    'Calle Francisco Villa 45',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    13,
    0,
    'Diego Ramírez',
    'Hace 2 h',
    25.789331, -103.621960

  ],
  [
    'SL-1061',
    'Jose Marcelino Cortez Camacho',
    'JMCC',
    'estradadulce253@gmail.com',
    '8715842767',
    'Calle Zaragoza 19',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    7,
    0,
    'Ana Torres',
    'Hace 7 h',
    25.789991, -103.617625

  ],
  [
    'SL-1062',
    'Sofia Leos Reyes',
    'SLR',
    'sofia.leos@email.mx',
    '8714745291',
    'Calle Las Flores 26',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    10,
    0,
    'Carlos Mendoza',
    'Hace 2 h',
    25.790026, -103.623399
  ],
  [
    'SL-1064',
    'Tere Leos Reyes',
    'TLR',
    'tereleosleos046@gmail.com',
    '8714761807',
    'Plaza Juárez Local 4',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    8,
    0,
    'Diego Ramírez',
    'Hace 3 días',
    25.792725, -103.622430

  ],
  [
    'SL-1065',
    'Paulina Nuñez Lopez',
    'PNL',
    'Paao.nunez.22@gmail.com',
    '8714757474',
    'Cerrada Los Encinos 11',
    'Ejido Martha, Mapimi, Dgo. 35200, México',
    'active',
    'Intermedio',
    '10 Mbps',
    350,
    12,
    0,
    'Ana Torres',
    'Hace 4 h',
    25.789736, -103.622552

  ]
] as const;

/**
 * Día N contado desde el 1 de enero de 2025. Antes se armaba «2025-01-34» para
 * los últimos clientes: una fecha inválida que tiraba su ficha.
 */
function demoDay(day: number): string {
  return new Date(Date.UTC(2025, 0, day)).toISOString().slice(0, 10);
}

export const CUSTOMERS: ReadonlyArray<Customer> = seeds.map((seed, index) => ({
  id: seed[0],
  organizationId: ORG_ID,
  createdAt: `${demoDay(10 + index)}T09:30:00-06:00`,
  createdBy: ADMIN_USER,
  updatedAt: now,
  updatedBy: STAFF_USERS[index % STAFF_USERS.length],
  name: seed[1],
  initials: seed[2],
  email: seed[3],
  phone: seed[4],
  address: seed[5],
  community: seed[6],
  status: seed[7],
  plan: seed[8],
  speed: seed[9],
  monthlyFee: seed[10],
  billingDay: seed[11],
  currentBalance: seed[12],
  technician: seed[13],
  lastActivity: seed[14],
  installDate: `${demoDay(15 + index)}T16:40:00-06:00`,
  latitude: seed[15],
  longitude: seed[16],
  gpsLocation: `${seed[15]}, ${seed[16]}`,
  ipAddress: `10.20.4.${20 + index}`,
  ...detail(seed[0], index),
}));

const DASHBOARD: DashboardSummary = {
  activeCustomers: 1248,
  monthlyRecurringRevenue: 438750,
  pendingInvoices: 86,
  overdueInvoices: 23,
  paymentsToday: 18400,
  scheduledInstallations: 12,
  availableEquipment: 74,
  openTickets: 9,
  revenue: [
    { month: 'Ago', value: 351 },
    { month: 'Sep', value: 366 },
    { month: 'Oct', value: 371 },
    { month: 'Nov', value: 389 },
    { month: 'Dic', value: 397 },
    { month: 'Ene', value: 405 },
    { month: 'Feb', value: 414 },
    { month: 'Mar', value: 421 },
    { month: 'Abr', value: 425 },
    { month: 'May', value: 431 },
    { month: 'Jun', value: 435 },
    { month: 'Jul', value: 439 },
  ],
  planDistribution: [
    { name: 'Intermedio · 10 Mbps', customers: 548, color: '#2563eb' },
    { name: 'Básico · 5 Mbps', customers: 421, color: '#06b6d4' },
    { name: 'Custom · 15 Mbps', customers: 279, color: '#8b5cf6' },
  ],
  recentActivity: [
    {
      title: 'Pago recibido',
      detail: 'María Fernanda López · $350 MXN',
      time: 'Hace 18 min',
      tone: 'green',
    },
    {
      title: 'Instalación programada',
      detail: 'Luis Alberto Romero · Tepotzotlán',
      time: 'Hace 42 min',
      tone: 'blue',
    },
    {
      title: 'Factura vencida',
      detail: 'Papelería El Faro · $700 MXN',
      time: 'Hace 1 h',
      tone: 'amber',
    },
    {
      title: 'Servicio activado',
      detail: 'Abarrotes La Esperanza · 15 Mbps',
      time: 'Hace 2 h',
      tone: 'blue',
    },
  ],
};

@Injectable()
export class MockCrmDataAccess implements CrmDataAccess {
  private readonly customers = [...CUSTOMERS];

  getDashboard(): Observable<DashboardSummary> {
    // Retornar datos estáticos por ahora
    // En una implementación más avanzada, esto podría conectarse con OperationalStore
    // a través de un servicio de intermediario para evitar problemas de inyección circular
    return of(DASHBOARD).pipe(delay(250));
  }
  getCustomers(): Observable<ReadonlyArray<Customer>> {
    return of(this.customers).pipe(delay(250));
  }
  getCustomer(id: string): Observable<Customer | undefined> {
    return of(this.customers.find((customer) => customer.id === id)).pipe(delay(200));
  }
  createCustomer(customer: Customer): void {
    if (!this.customers.some((current) => current.id === customer.id))
      this.customers.unshift(customer);
  }
}

export function provideMockDataAccess(): Provider[] {
  return [{ provide: CRM_DATA, useClass: MockCrmDataAccess }];
}
