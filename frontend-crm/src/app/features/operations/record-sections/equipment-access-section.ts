import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionContext } from '../../../core/auth/session-context';
import { CredentialVault } from '../../../core/equipment/credential-vault';
import {
  WIFI_BANDS,
  WIFI_SECURITY,
  WifiNetwork,
  modelKeyOf,
  modelLabelOf,
} from '../../../core/equipment/device-access.model';
import { DeviceAccessStore, WifiInput } from '../../../core/equipment/device-access.store';
import { OperationalRecord } from '../operational-modules.data';
import { SecretField } from './secret-field';

const EMPTY_WIFI: WifiInput = { ssid: '', band: '2.4', security: 'WPA2', enabled: true };

/**
 * Acceso de administración y redes WiFi de una unidad de Equipamiento. Los
 * datos que no son secretos se editan aquí; las contraseñas se piden al
 * servidor (SecretField) y nunca se guardan en el navegador.
 */
@Component({
  selector: 'app-equipment-access-section',
  imports: [DatePipe, FormsModule, SecretField],
  templateUrl: './equipment-access-section.html',
  styleUrl: './equipment-access-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentAccessSection {
  readonly store = inject(DeviceAccessStore);
  readonly vault = inject(CredentialVault);
  private readonly session = inject(SessionContext);
  readonly record = input.required<OperationalRecord>();
  readonly bands = WIFI_BANDS;
  readonly securities = WIFI_SECURITY;

  readonly equipmentId = computed(() => this.record().id);
  readonly access = computed(() => this.store.access(this.equipmentId()));
  readonly modelKey = computed(() => modelKeyOf(this.record()));
  readonly modelLabel = computed(() => modelLabelOf(this.record()));
  readonly defaults = computed(() => this.store.modelDefaults(this.modelKey()));
  readonly canEdit = computed(() => this.session.hasPermission('equipment.update'));
  readonly canSeeCredentials = computed(() => this.session.hasPermission('equipment.credentials'));
  readonly canSeeWifi = computed(() => this.session.hasPermission('equipment.wifi'));
  readonly installed = computed(() => !!this.record()['assignedToId'] || this.record()['status'] === 'ASSIGNED');

  // Acceso de administración (borrador)
  readonly ip = signal('');
  readonly port = signal('');
  readonly username = signal('');
  readonly firmware = signal('');
  readonly adminError = signal('');
  readonly adminDirty = computed(() => {
    const access = this.access();
    return (
      this.ip() !== access.managementIp ||
      this.port() !== (access.managementPort?.toString() ?? '') ||
      this.username() !== access.username ||
      this.firmware() !== access.firmware
    );
  });
  /** Aviso inmediato: otra unidad ya usa esta IP. */
  readonly ipConflict = computed(() => this.store.ipConflict(this.ip(), this.equipmentId()));

  // Valores de fábrica del modelo
  readonly editingDefaults = signal(false);
  readonly defaultsUser = signal('');
  readonly defaultsIp = signal('');
  readonly defaultsNote = signal('');
  readonly defaultsError = signal('');

  // Redes WiFi
  readonly wifiEditor = signal<{ id: string | null } | null>(null);
  readonly wifiDraft = signal<WifiInput>({ ...EMPTY_WIFI });
  readonly wifiError = signal('');
  readonly removing = signal<WifiNetwork | null>(null);
  readonly toast = signal('');

  constructor() {
    // Al cambiar de equipo o guardar, el borrador toma los valores vigentes.
    effect(() => {
      const access = this.access();
      this.ip.set(access.managementIp);
      this.port.set(access.managementPort?.toString() ?? '');
      this.username.set(access.username);
      this.firmware.set(access.firmware);
    });
  }

  private actor(): string {
    return this.session.user()?.name ?? 'Sistema';
  }

  // ------------------------------------------------------ Administración

  saveAdmin(): void {
    const port = this.port().trim();
    const result = this.store.saveAdmin(
      this.equipmentId(),
      {
        managementIp: this.ip(),
        managementPort: port ? Number(port) : null,
        username: this.username(),
        firmware: this.firmware(),
      },
      this.actor(),
    );
    if (!result.ok) return this.adminError.set(result.error);
    this.adminError.set('');
    this.notify('Acceso de administración guardado');
  }

  resetAdmin(): void {
    const access = this.access();
    this.ip.set(access.managementIp);
    this.port.set(access.managementPort?.toString() ?? '');
    this.username.set(access.username);
    this.firmware.set(access.firmware);
    this.adminError.set('');
  }

  /** Llena usuario e IP con los de fábrica; se guardan al confirmar. */
  useFactoryValues(): void {
    const defaults = this.defaults();
    if (!defaults) return;
    this.username.set(defaults.username);
    if (!this.ip()) this.ip.set(defaults.ip);
  }

  setFactoryChanged(changed: boolean): void {
    this.store.setFactoryPasswordChanged(this.equipmentId(), changed, this.actor());
    this.notify(changed ? 'Marcado: la contraseña de fábrica ya se cambió' : 'Marcado: sigue con la contraseña de fábrica');
  }

  confirmRotation(): void {
    this.store.clearRotation(this.equipmentId(), this.actor());
    this.notify('Credenciales marcadas como cambiadas');
  }

  confirmWifiReset(): void {
    this.store.clearWifiReset(this.equipmentId(), this.actor());
    this.notify('WiFi marcado como restablecido');
  }

  // ------------------------------------------------ Valores de fábrica

  openDefaults(): void {
    const defaults = this.defaults();
    this.defaultsUser.set(defaults?.username ?? '');
    this.defaultsIp.set(defaults?.ip ?? '');
    this.defaultsNote.set(defaults?.note ?? '');
    this.defaultsError.set('');
    this.editingDefaults.set(true);
  }

  saveDefaults(): void {
    const result = this.store.saveDefaults({
      modelKey: this.modelKey(),
      username: this.defaultsUser(),
      ip: this.defaultsIp(),
      note: this.defaultsNote(),
    });
    if (!result.ok) return this.defaultsError.set(result.error);
    this.editingDefaults.set(false);
    this.notify('Valores de fábrica del modelo guardados');
  }

  // ---------------------------------------------------------------- WiFi

  bandLabel(band: string): string {
    return WIFI_BANDS.find((item) => item.value === band)?.label ?? band;
  }

  securityLabel(security: string): string {
    return WIFI_SECURITY.find((item) => item.value === security)?.label ?? security;
  }

  ssidBytes(): number {
    return new TextEncoder().encode(this.wifiDraft().ssid).length;
  }

  openWifi(network?: WifiNetwork): void {
    this.wifiDraft.set(
      network
        ? { ssid: network.ssid, band: network.band, security: network.security, enabled: network.enabled }
        : { ...EMPTY_WIFI },
    );
    this.wifiError.set('');
    this.wifiEditor.set({ id: network?.id ?? null });
  }

  setWifi<K extends keyof WifiInput>(key: K, value: WifiInput[K]): void {
    this.wifiDraft.update((draft) => ({ ...draft, [key]: value }));
    this.wifiError.set('');
  }

  saveWifi(event: Event): void {
    event.preventDefault();
    const editor = this.wifiEditor();
    if (!editor) return;
    const result = this.store.saveNetwork(this.equipmentId(), this.wifiDraft(), this.actor(), editor.id ?? undefined);
    if (!result.ok) return this.wifiError.set(result.error);
    this.wifiEditor.set(null);
    this.notify(editor.id ? 'Red actualizada' : `Red «${result.value.ssid}» agregada`);
  }

  confirmRemove(): void {
    const network = this.removing();
    if (!network) return;
    this.store.removeNetwork(this.equipmentId(), network.id, this.actor());
    this.removing.set(null);
    this.notify(`Red «${network.ssid}» eliminada`);
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
