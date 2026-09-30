import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import {
  CfdiInput,
  ConnectionErrors,
  ConnectionsStore,
  PaymentsInput,
} from '../../../core/connections/connections-store';
import {
  CFDI_PROVIDERS,
  ConnectionKey,
  ConnectionStatus,
  PAYMENT_PROVIDERS,
  whatsappNumber,
} from '../../../core/connections/connections.model';
import { TAX_REGIMES, currentOrganization } from '../../../core/organization/organization.model';

interface ConnectionCard {
  readonly key: ConnectionKey;
  readonly name: string;
  readonly provider: string;
  readonly mark: string;
  readonly tone: string;
  readonly description: string;
  readonly usedIn: ReadonlyArray<string>;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}

interface ConnectionGroup {
  readonly name: string;
  readonly cards: ReadonlyArray<ConnectionCard>;
}

export const STATUS_LABEL: Readonly<Record<ConnectionStatus, string>> = {
  active: 'Funcionando',
  demo: 'Modo demostración',
  'pending-server': 'Espera al servidor',
  incomplete: 'Incompleta',
  disabled: 'Sin configurar',
};

const STATUS_TONE: Readonly<Record<ConnectionStatus, string>> = {
  active: 'active',
  demo: 'pending',
  'pending-server': 'pending',
  incomplete: 'danger',
  disabled: 'inactive',
};

@Component({
  selector: 'app-settings-connections-page',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './settings-connections-page.html',
  styleUrls: [
    '../settings-pages.scss',
    '../settings-channel.scss',
    './settings-connections-page.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsConnectionsPage {
  readonly store = inject(ConnectionsStore);
  private readonly session = inject(SessionContext);
  readonly paymentProviders = PAYMENT_PROVIDERS;
  readonly cfdiProviders = CFDI_PROVIDERS;

  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));

  readonly groups = computed<ReadonlyArray<ConnectionGroup>>(() => {
    const state = this.store.state();
    const payments = PAYMENT_PROVIDERS.find((item) => item.value === state.payments.provider);
    const cfdi = CFDI_PROVIDERS.find((item) => item.value === state.cfdi.provider);
    return [
      {
        name: 'Plataforma',
        cards: [
          {
            key: 'speedlink-api',
            name: 'Servidor SpeedLink',
            provider: this.store.apiBaseUrl || 'Sin servidor',
            mark: 'API',
            tone: 'slate',
            description: 'Guarda los datos, envía correos y SMS, y resguarda contraseñas de equipos.',
            usedIn: ['Tickets', 'Correo y SMS', 'Credenciales de equipos', 'Pagos y CFDI'],
          },
        ],
      },
      {
        name: 'Mapas y mensajería',
        cards: [
          {
            key: 'google-maps',
            name: 'Google Maps',
            provider: state.maps.apiKey ? 'Llave capturada en Ajustes' : 'Llave del despliegue',
            mark: 'G',
            tone: 'blue',
            description: 'Mapa interactivo de clientes y selector de ubicación GPS.',
            usedIn: ['Mapa del Dashboard', 'Ubicación de clientes y leads'],
            updatedAt: state.maps.apiKey ? state.maps.updatedAt : undefined,
            updatedBy: state.maps.updatedBy,
          },
          {
            key: 'whatsapp',
            name: 'WhatsApp',
            provider: `Enlaces wa.me · lada +${state.whatsapp.countryCode}`,
            mark: 'W',
            tone: 'green',
            description: 'Abre WhatsApp con el mensaje listo; tú eliges el chat y lo envías.',
            usedIn: ['Botón de WhatsApp en registros', 'Contratos', 'Invitación al portal'],
            updatedAt: state.whatsapp.updatedAt,
            updatedBy: state.whatsapp.updatedBy,
          },
        ],
      },
      {
        name: 'Cobranza y facturación',
        cards: [
          {
            key: 'payments',
            name: 'Pagos en línea',
            provider: `${payments?.label ?? ''} · ${state.payments.mode === 'sandbox' ? 'pruebas' : 'producción'}`,
            mark: '$',
            tone: 'violet',
            description: 'Cobro con tarjeta, OXXO o SPEI desde un enlace de pago.',
            usedIn: ['Facturas', 'Portal de clientes'],
            updatedAt: state.payments.enabled || state.payments.secretTail ? state.payments.updatedAt : undefined,
            updatedBy: state.payments.updatedBy,
          },
          {
            key: 'cfdi',
            name: 'Timbrado CFDI',
            provider: `${cfdi?.label ?? ''} · ${state.cfdi.mode === 'sandbox' ? 'pruebas' : 'producción'}`,
            mark: 'SAT',
            tone: 'amber',
            description: 'Timbra las facturas ante el SAT (CFDI 4.0) a través de un PAC.',
            usedIn: ['Facturas'],
            updatedAt: state.cfdi.enabled || state.cfdi.secretTail ? state.cfdi.updatedAt : undefined,
            updatedBy: state.cfdi.updatedBy,
          },
        ],
      },
    ];
  });

  readonly summary = computed(() => {
    const values = Object.values(this.store.statuses());
    return {
      working: values.filter((status) => status === 'active').length,
      waiting: values.filter((status) => status === 'demo' || status === 'pending-server').length,
      attention: values.filter((status) => status === 'incomplete').length,
      off: values.filter((status) => status === 'disabled').length,
    };
  });

  // ─────────────────────────────────────────────────────────── Diálogo

  readonly open = signal<ConnectionKey | null>(null);
  readonly submitted = signal(false);
  readonly saveError = signal('');
  readonly toast = signal('');
  readonly disconnecting = signal<'payments' | 'cfdi' | null>(null);

  readonly mapsKey = signal('');
  readonly countryCode = signal('');
  readonly samplePhone = signal('8715084696');
  readonly payments = signal<PaymentsInput>(this.paymentsInput());
  readonly cfdi = signal<CfdiInput>(this.cfdiInput());
  readonly newSecret = signal('');
  readonly changingSecret = signal(false);
  readonly apiTesting = signal(false);
  readonly apiResult = signal<{ ok: boolean; message: string } | null>(null);

  readonly openCard = computed(() =>
    this.groups()
      .flatMap((group) => group.cards)
      .find((card) => card.key === this.open()),
  );
  readonly mapsError = computed(() => this.store.validateMapsKey(this.mapsKey()));
  readonly countryError = computed(() => this.store.validateCountryCode(this.countryCode()));
  readonly samplePreview = computed(() => {
    const digits = this.samplePhone().replace(/\D/g, '');
    if (!digits || this.countryError()) return '';
    return digits.length === 10 ? `wa.me/${this.countryCode().trim()}${digits}` : `wa.me/${whatsappNumber(digits)}`;
  });
  readonly paymentProvider = computed(
    () => PAYMENT_PROVIDERS.find((item) => item.value === this.payments().provider) ?? PAYMENT_PROVIDERS[0],
  );
  readonly cfdiProvider = computed(
    () => CFDI_PROVIDERS.find((item) => item.value === this.cfdi().provider) ?? CFDI_PROVIDERS[0],
  );
  readonly paymentErrors = computed<ConnectionErrors>(() =>
    this.store.validatePayments(this.payments(), true, this.newSecret()),
  );
  readonly cfdiErrors = computed<ConnectionErrors>(() =>
    this.store.validateCfdi(this.cfdi(), true, this.newSecret()),
  );
  readonly organization = computed(() => {
    this.store.state();
    const profile = currentOrganization();
    return {
      profile,
      regime: TAX_REGIMES.find((item) => item.code === profile.taxRegime)?.label ?? '',
      problems: this.store.fiscalProblems(),
    };
  });
  readonly deployedKeyTail = this.store.deployedMapsKey.slice(-4);

  statusOf(key: ConnectionKey): ConnectionStatus {
    return this.store.statuses()[key];
  }
  statusLabel(key: ConnectionKey): string {
    return STATUS_LABEL[this.statusOf(key)];
  }
  statusTone(key: ConnectionKey): string {
    return STATUS_TONE[this.statusOf(key)];
  }

  /** Por qué está en ese estado, en una línea. */
  statusNote(key: ConnectionKey): string {
    const status = this.statusOf(key);
    switch (key) {
      case 'speedlink-api':
        return status === 'active' ? 'Datos guardados en el servidor.' : 'Los datos viven en este navegador.';
      case 'google-maps':
        return status === 'active' ? 'Mapa real con satélite.' : 'Sin llave: se muestra un mapa esquemático.';
      case 'whatsapp':
        return 'No requiere cuenta.';
      default:
        return status === 'pending-server'
          ? key === 'payments'
            ? 'Configurada: empezará a cobrar cuando haya servidor.'
            : 'Configurado: empezará a timbrar cuando haya servidor.'
          : status === 'incomplete'
            ? 'Activada con datos faltantes.'
            : status === 'active'
              ? 'Operando.'
              : 'Apagada.';
    }
  }

  configure(key: ConnectionKey): void {
    const state = this.store.state();
    this.mapsKey.set(state.maps.apiKey);
    this.countryCode.set(state.whatsapp.countryCode);
    this.payments.set(this.paymentsInput());
    this.cfdi.set(this.cfdiInput());
    this.newSecret.set('');
    const tail = key === 'payments' ? state.payments.secretTail : key === 'cfdi' ? state.cfdi.secretTail : '';
    this.changingSecret.set(!tail);
    this.submitted.set(false);
    this.saveError.set('');
    this.apiResult.set(null);
    this.open.set(key);
  }

  close(): void {
    this.open.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.disconnecting()) this.disconnecting.set(null);
    else if (this.open()) this.close();
  }

  setPayments<K extends keyof PaymentsInput>(key: K, value: PaymentsInput[K]): void {
    this.payments.update((draft) => ({ ...draft, [key]: value }));
    this.saveError.set('');
  }
  setCfdi<K extends keyof CfdiInput>(key: K, value: CfdiInput[K]): void {
    this.cfdi.update((draft) => ({ ...draft, [key]: value }));
    this.saveError.set('');
  }

  /** Errores visibles sólo tras intentar guardar y con la integración encendida. */
  paymentError(field: string): string | undefined {
    return this.submitted() && this.payments().enabled ? this.paymentErrors()[field] : undefined;
  }
  cfdiError(field: string): string | undefined {
    return this.submitted() && this.cfdi().enabled ? this.cfdiErrors()[field] : undefined;
  }

  save(event?: Event): void {
    event?.preventDefault();
    const key = this.open();
    if (!key || !this.canEdit()) return;
    this.submitted.set(true);
    const actor = this.session.user()?.name ?? 'Sistema';
    const result =
      key === 'google-maps'
        ? this.store.saveMapsKey(this.mapsKey(), actor)
        : key === 'whatsapp'
          ? this.store.saveWhatsapp(this.countryCode(), actor)
          : key === 'payments'
            ? this.store.savePayments(this.payments(), this.newSecret(), actor)
            : key === 'cfdi'
              ? this.store.saveCfdi(this.cfdi(), this.newSecret(), actor)
              : ({ ok: true } as const);
    if (!result.ok) return this.saveError.set(result.error);
    this.close();
    this.showToast(
      key === 'google-maps'
        ? 'Llave guardada. Se aplica al recargar la página.'
        : 'Conexión guardada',
    );
  }

  useDeployedMapsKey(): void {
    this.mapsKey.set('');
  }

  async testApi(): Promise<void> {
    this.apiTesting.set(true);
    this.apiResult.set(await this.store.testApi());
    this.apiTesting.set(false);
  }

  confirmDisconnect(): void {
    const key = this.disconnecting();
    if (!key) return;
    this.store.disconnect(key, this.session.user()?.name ?? 'Sistema');
    this.disconnecting.set(null);
    this.close();
    this.showToast(key === 'payments' ? 'Pagos en línea desconectados' : 'Timbrado desconectado');
  }

  private paymentsInput(): PaymentsInput {
    const { enabled, provider, mode, publicKey } = this.store.state().payments;
    return { enabled, provider, mode, publicKey };
  }
  private cfdiInput(): CfdiInput {
    const { enabled, provider, mode, username } = this.store.state().cfdi;
    return { enabled, provider, mode, username };
  }
  private showToast(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
