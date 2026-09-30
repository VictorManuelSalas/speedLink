import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChannelsStore } from '../../../core/channels/channels-store';
import { ConnectionsStore } from '../../../core/connections/connections-store';
import { TemplateStore } from '../../../core/data-access/templates/template-store';
import { OrganizationStore } from '../../../core/organization/organization-store';
import { ClientPortalStore } from '../../../core/portal/client-portal.store';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, SettingsSectionKey } from '../settings.data';

interface HealthItem {
  readonly label: string;
  readonly done: boolean;
  readonly route: string;
}

@Component({
  selector: 'app-settings-overview-page',
  imports: [RouterLink],
  templateUrl: './settings-overview-page.html',
  styleUrl: '../settings-pages.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsOverviewPage {
  readonly groups = SETTINGS_GROUPS;
  private readonly organization = inject(OrganizationStore);
  private readonly channels = inject(ChannelsStore);
  private readonly portal = inject(ClientPortalStore);
  private readonly connections = inject(ConnectionsStore);
  private readonly templates = inject(TemplateStore);

  /** Lo que el CRM necesita para operar completo, verificado contra la configuración real. */
  readonly checks = computed<ReadonlyArray<HealthItem>>(() => {
    const statuses = this.connections.statuses();
    return [
      { label: 'Datos fiscales de la organización', done: !this.connections.fiscalProblems().length, route: '/settings/organization' },
      { label: 'Impuesto predeterminado', done: !!this.organization.defaultTax(), route: '/settings/taxes' },
      { label: 'Correo (SMTP) listo', done: this.channels.smtpStatus() === 'ready', route: '/settings/smtp' },
      { label: 'SMS listo', done: this.channels.smsStatus() === 'ready', route: '/settings/sms' },
      { label: 'Portal de clientes publicado', done: this.portal.config().enabled, route: '/settings/portal' },
      { label: 'Plantillas de WhatsApp activas', done: this.templates.all().some((t) => t.channel === 'whatsapp' && t.status === 'ACTIVE'), route: '/settings/templates' },
      { label: 'Google Maps', done: statuses['google-maps'] === 'active', route: '/settings/connections' },
      { label: 'MikroTik conectado', done: statuses.mikrotik !== 'disabled', route: '/settings/connections/mikrotik' },
      { label: 'Servidor del CRM', done: statuses['speedlink-api'] === 'active', route: '/settings/connections' },
    ];
  });
  readonly score = computed(() => {
    const checks = this.checks();
    return Math.round((checks.filter((check) => check.done).length / checks.length) * 100);
  });
  readonly pending = computed(() => this.checks().filter((check) => !check.done));
  /** Integraciones activadas con datos faltantes. */
  readonly attention = computed(
    () => Object.values(this.connections.statuses()).filter((status) => status === 'incomplete').length,
  );

  section(key: string) {
    return SETTINGS_SECTIONS[key as SettingsSectionKey];
  }
}
