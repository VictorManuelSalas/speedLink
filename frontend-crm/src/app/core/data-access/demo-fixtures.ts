/**
 * Datos de demostración FIJOS (no aleatorios) para mostrar el acceso a equipos
 * y el WiFi del cliente. El resto del inventario se genera al azar en cada
 * carga, así que estos registros tienen ids propios (EQ-09xx / ASG-09xx) que
 * no chocan con los generados y siempre existen.
 *
 * Cliente de demostración: SL-1044, el mismo de la cuenta de prueba del portal.
 */

import type { OperationalRecord } from '../../features/operations/operational-modules.data';
import type { DeviceAccess } from '../equipment/device-access.model';
import { CUSTOMERS } from './mock-crm-data';

export const DEMO_CUSTOMER_ID = 'SL-1044';
const DEMO_CUSTOMER_NAME =
  CUSTOMERS.find((customer) => customer.id === DEMO_CUSTOMER_ID)?.name ?? 'Cliente de demostración';
const PREVIOUS_CUSTOMER_ID = 'SL-1043';
const PREVIOUS_CUSTOMER_NAME =
  CUSTOMERS.find((customer) => customer.id === PREVIOUS_CUSTOMER_ID)?.name ?? 'Cliente anterior';

export const DEMO_EQUIPMENT: ReadonlyArray<OperationalRecord> = [
  {
    id: 'EQ-0901',
    name: 'Router Wi-Fi',
    brand: 'TP-Link',
    model: 'Archer C6',
    serialNumber: 'ARCHC6-DEMO01',
    macAddress: 'B0:BE:76:4A:10:44',
    status: 'ASSIGNED',
    purchaseCost: 961,
    purchaseDate: '2026-02-10',
    assignedToId: DEMO_CUSTOMER_ID,
    assignedTo: DEMO_CUSTOMER_NAME,
    description: 'Router del cliente de demostración: acceso verificado y WiFi registrado.',
  },
  {
    id: 'EQ-0902',
    name: 'Antena CPE',
    brand: 'Ubiquiti',
    model: 'LiteBeam 5AC',
    serialNumber: 'LBE5AC-DEMO02',
    macAddress: '74:83:C2:5E:10:44',
    status: 'ASSIGNED',
    purchaseCost: 1621,
    purchaseDate: '2026-02-10',
    assignedToId: DEMO_CUSTOMER_ID,
    assignedTo: DEMO_CUSTOMER_NAME,
    description: 'Ejemplo de riesgo: sigue con la contraseña de fábrica.',
  },
  {
    id: 'EQ-0903',
    name: 'Router Wi-Fi',
    brand: 'MikroTik',
    model: 'cAP ac',
    serialNumber: 'CAPAC-DEMO03',
    macAddress: '48:A9:8A:2C:10:43',
    status: 'AVAILABLE',
    purchaseCost: 1180,
    purchaseDate: '2025-11-03',
    assignedToId: '',
    assignedTo: '',
    description: 'Ejemplo de devolución: hay que cambiar credenciales y restablecer el WiFi.',
  },
];

export const DEMO_ASSIGNMENTS: ReadonlyArray<OperationalRecord> = [
  {
    id: 'ASG-0901',
    name: 'ASG-2026-0901',
    clientId: DEMO_CUSTOMER_ID,
    client: DEMO_CUSTOMER_NAME,
    equipmentId: 'EQ-0901',
    equipment: 'Router Wi-Fi',
    serial: 'ARCHC6-DEMO01',
    assignedAt: '2026-02-12',
    returnedAt: '',
    status: 'ACTIVE',
    description: 'Instalación inicial del servicio.',
  },
  {
    id: 'ASG-0902',
    name: 'ASG-2026-0902',
    clientId: DEMO_CUSTOMER_ID,
    client: DEMO_CUSTOMER_NAME,
    equipmentId: 'EQ-0902',
    equipment: 'Antena CPE',
    serial: 'LBE5AC-DEMO02',
    assignedAt: '2026-02-12',
    returnedAt: '',
    status: 'ACTIVE',
    description: 'Enlace inalámbrico hacia la torre.',
  },
  {
    id: 'ASG-0903',
    name: 'ASG-2025-0903',
    clientId: PREVIOUS_CUSTOMER_ID,
    client: PREVIOUS_CUSTOMER_NAME,
    equipmentId: 'EQ-0903',
    equipment: 'Router Wi-Fi',
    serial: 'CAPAC-DEMO03',
    assignedAt: '2025-11-05',
    returnedAt: '2026-08-30',
    status: 'RETURNED',
    description: 'Devuelto por cambio de domicilio.',
  },
];

const SEED_DATE = '2026-02-12T11:30:00-06:00';

/** Acceso y WiFi de los equipos de demostración (sin contraseñas: esas van al servidor). */
export const DEMO_DEVICE_ACCESS: Readonly<Record<string, DeviceAccess>> = {
  'EQ-0901': {
    equipmentId: 'EQ-0901',
    managementIp: '10.20.44.1',
    managementPort: 443,
    username: 'soporte_sl',
    firmware: '1.13.8 Build 20250310',
    factoryPasswordChanged: true,
    passwordChangedAt: SEED_DATE,
    credentialsNeedRotation: false,
    wifiNeedsReset: false,
    wifi: [
      { id: 'wifi-demo-0901-a', ssid: 'SpeedLink_Nunez', band: '2.4', security: 'WPA2', enabled: true, passwordChangedAt: SEED_DATE },
      { id: 'wifi-demo-0901-b', ssid: 'SpeedLink_Nunez_5G', band: '5', security: 'WPA2/WPA3', enabled: true, passwordChangedAt: SEED_DATE },
      { id: 'wifi-demo-0901-c', ssid: 'Nunez_Invitados', band: 'guest', security: 'WPA2', enabled: false },
    ],
    updatedAt: SEED_DATE,
    updatedBy: 'Luis Ramírez',
  },
  'EQ-0902': {
    equipmentId: 'EQ-0902',
    managementIp: '10.20.44.2',
    managementPort: 443,
    username: 'ubnt',
    firmware: 'WA 8.7.11',
    factoryPasswordChanged: false,
    credentialsNeedRotation: false,
    wifiNeedsReset: false,
    wifi: [],
    updatedAt: SEED_DATE,
    updatedBy: 'Luis Ramírez',
  },
  'EQ-0903': {
    equipmentId: 'EQ-0903',
    managementIp: '10.20.43.1',
    managementPort: 80,
    username: 'admin_sl',
    firmware: 'RouterOS 7.14.2',
    factoryPasswordChanged: true,
    passwordChangedAt: '2025-11-05T10:00:00-06:00',
    credentialsNeedRotation: true,
    wifiNeedsReset: true,
    wifi: [{ id: 'wifi-demo-0903-a', ssid: 'Casa_Cervantes', band: 'dual', security: 'WPA2', enabled: true }],
    updatedAt: '2026-08-30T17:00:00-06:00',
    updatedBy: 'Sistema (devolución)',
  },
};
