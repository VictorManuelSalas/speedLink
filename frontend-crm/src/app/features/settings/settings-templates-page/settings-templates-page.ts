import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { SessionContext } from '../../../core/auth/session-context';
import { smsSegments } from '../../../core/channels/channels-store';
import { TemplateStore } from '../../../core/data-access/templates/template-store';
import {
  CrmTemplate,
  MergeField,
  TemplateChannel,
  TemplateFormat,
  TemplateModule,
  htmlToText,
  mergeFieldGroups,
  renderTemplateText,
} from '../../../core/data-access/templates/template.model';
import { customModule, customModules, nativeCustomFields } from '../../../core/modules/custom-modules.model';
import {
  LeadEmailFormValue,
  LeadEmailModal,
  LeadEmailSeed,
} from '../../operations/lead-email-modal/lead-email-modal';
import { OperationalStore } from '../../operations/operational-store';
import { ORGANIZATION } from '../../operations/printable-document/printable-document.data';

/** Módulos nativos a los que se puede asociar una plantilla. */
const NATIVE_TEMPLATE_MODULES: ReadonlyArray<{ value: TemplateModule; label: string }> = [
  { value: '', label: 'Todos los módulos' },
  { value: 'leads', label: 'Leads' },
  { value: 'customers', label: 'Clientes' },
  { value: 'contracts', label: 'Contratos' },
  { value: 'invoices', label: 'Facturas' },
  { value: 'payments', label: 'Pagos' },
  { value: 'assignments', label: 'Asignaciones' },
  { value: 'equipment', label: 'Equipamiento' },
];

/** Datos de ejemplo para la vista previa, por módulo. */
const PREVIEW_RECORD: Readonly<Record<string, Record<string, unknown>>> = {
  contracts: {
    contractNumber: 'CTR-2026-3010',
    client: 'María Fernanda López',
    startDate: '2026-09-01',
    endDate: '2027-09-01',
    totalMonthly: 399,
    status: 'ACTIVE',
  },
  invoices: {
    folio: 'FAC-SL-1042-07',
    client: 'María Fernanda López',
    total: 350,
    dueDate: '2026-09-10',
    status: 'PENDING',
  },
  payments: {
    reference: 'SL74018',
    client: 'María Fernanda López',
    amount: 350,
    paidAt: '2026-09-05',
  },
  leads: {
    name: 'Roberto Sánchez',
    email: 'roberto@email.mx',
    phone: '55 6123 8801',
    source: 'Sitio web',
  },
  customers: {
    name: 'María Fernanda López',
    email: 'maria.lopez@email.mx',
    phone: '55 1234 8052',
    plan: 'Intermedio',
    currentBalance: 0,
    id: 'CLI-1042',
    portalUrl: 'https://crm.speedlink.mx/portal/speedlink',
    portalPin: '4821',
  },
  equipment: {
    name: 'Router TP-Link Archer C6',
    wifiSsid: 'SpeedLink_Lopez',
    wifiBand: '2.4 GHz',
    wifiPassword: 'Ejemplo-2026!',
  },
  assignments: {
    name: 'ASG-2026-0001',
    client: 'María Fernanda López',
    equipment: 'Antena CPE',
    serial: 'DHR2I3TR',
  },
};

/** Valor de muestra de un campo personalizado según su tipo. */
function sampleValue(type: string, label: string): unknown {
  switch (type) {
    case 'number':
      return 12;
    case 'currency':
      return 1250;
    case 'date':
      return '2026-10-15';
    case 'checkbox':
      return 'true';
    case 'email':
      return 'ejemplo@correo.mx';
    case 'phone':
      return '55 1234 5678';
    case 'url':
      return 'https://speedlink.mx';
    case 'user':
      return 'usr-andrea-torres';
    default:
      return `(${label})`;
  }
}

const EMPTY: CrmTemplate = {
  id: '',
  name: '',
  channel: 'email',
  module: '',
  format: 'text',
  subject: '',
  body: '',
  status: 'ACTIVE',
  updatedAt: '',
};

type StatusFilter = 'all' | 'ACTIVE' | 'DRAFT';

@Component({
  selector: 'app-settings-templates-page',
  imports: [FormsModule, RouterLink, DatePipe, LeadEmailModal],
  templateUrl: './settings-templates-page.html',
  styleUrls: ['../settings-pages.scss', './settings-templates-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsTemplatesPage {
  private readonly store = inject(TemplateStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly session = inject(SessionContext);
  private readonly emails = inject(OperationalStore);

  /** Nativos + módulos personalizados (las plantillas pueden asociarse a ellos). */
  readonly modules = computed(() => [
    ...NATIVE_TEMPLATE_MODULES,
    ...customModules().map((module) => ({ value: module.key as TemplateModule, label: module.plural })),
  ]);
  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));

  readonly query = signal('');
  readonly channelFilter = signal<'all' | TemplateChannel>('all');
  readonly moduleFilter = signal<'all' | TemplateModule>('all');
  readonly statusFilter = signal<StatusFilter>('all');

  readonly editorOpen = signal(false);
  readonly fieldPickerOpen = signal(false);
  readonly draft = signal<CrmTemplate>({ ...EMPTY });
  /** Copia al abrir el editor, para saber si hay cambios sin guardar. */
  private readonly original = signal<CrmTemplate>({ ...EMPTY });
  readonly saveError = signal('');
  readonly confirmDiscard = signal(false);
  readonly deleting = signal<CrmTemplate | null>(null);
  readonly toast = signal('');
  readonly testSeed = signal<LeadEmailSeed | null>(null);
  readonly testKey = signal(0);

  readonly templates = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.store
      .all()
      .filter((template) => this.channelFilter() === 'all' || template.channel === this.channelFilter())
      .filter((template) => this.moduleFilter() === 'all' || template.module === this.moduleFilter())
      .filter((template) => this.statusFilter() === 'all' || template.status === this.statusFilter())
      .filter(
        (template) =>
          !query ||
          `${template.name} ${template.subject} ${template.body}`.toLocaleLowerCase().includes(query),
      );
  });
  readonly emailCount = computed(
    () => this.store.all().filter((template) => template.channel === 'email').length,
  );
  readonly systemCount = computed(
    () => this.store.all().filter((template) => this.store.usageOf(template.id)).length,
  );
  readonly activeCount = this.store.activeCount;
  readonly totalCount = computed(() => this.store.all().length);
  readonly filtersActive = computed(
    () =>
      !!this.query() ||
      this.channelFilter() !== 'all' ||
      this.moduleFilter() !== 'all' ||
      this.statusFilter() !== 'all',
  );

  /** Variables disponibles según el módulo elegido en el editor. */
  readonly fieldGroups = computed(() => mergeFieldGroups(this.draft().module));
  readonly unknownTokens = computed(() => this.store.unknownTokens(this.draft()));
  readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.original()));
  readonly editingUsage = computed(() => this.store.usageOf(this.draft().id));
  readonly isNew = computed(() => !this.store.find(this.draft().id));
  readonly segments = computed(() => smsSegments(this.preview().body));

  readonly preview = computed(() => {
    const draft = this.draft();
    const context = {
      record: this.previewRecord(draft.module),
      organization: ORGANIZATION,
      userName: this.session.user()?.name ?? 'Andrea Torres',
      formatMoney: (value: unknown) =>
        new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
          Number(value) || 0,
        ),
      formatDate: (value: unknown) =>
        new Intl.DateTimeFormat('es-MX', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }).format(new Date(String(value))),
    };
    const body = renderTemplateText(draft.body, draft.module, context);
    return {
      subject: renderTemplateText(draft.subject, draft.module, context),
      body: draft.format === 'html' && draft.channel === 'sms' ? htmlToText(body) : body,
    };
  });
  /** El HTML se pinta en un iframe sin scripts: sus estilos no tocan el CRM. */
  readonly previewHtml = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:14px;font:14px/1.5 system-ui,sans-serif;color:#0f172a;background:#fff}img{max-width:100%}</style></head><body>${this.preview().body}</body></html>`,
    ),
  );

  moduleLabel(module: TemplateModule): string {
    return this.modules().find((item) => item.value === module)?.label ?? 'Todos los módulos';
  }
  channelLabel(channel: TemplateChannel): string {
    return channel === 'email' ? 'Correo' : 'SMS';
  }
  usageOf(template: CrmTemplate): string | undefined {
    return this.store.usageOf(template.id);
  }
  clearFilters(): void {
    this.query.set('');
    this.channelFilter.set('all');
    this.moduleFilter.set('all');
    this.statusFilter.set('all');
  }

  // ---------------------------------------------------------------- Editor

  create(): void {
    this.openEditor({ ...EMPTY, id: `tpl-${crypto.randomUUID?.() ?? Date.now()}` });
  }
  edit(template: CrmTemplate): void {
    this.openEditor({ ...template });
  }
  private openEditor(template: CrmTemplate): void {
    this.draft.set(template);
    this.original.set(template);
    this.saveError.set('');
    this.confirmDiscard.set(false);
    this.fieldPickerOpen.set(false);
    this.editorOpen.set(true);
  }
  /** Cerrar con cambios pide confirmación: se perdería lo escrito. */
  close(force = false): void {
    if (!force && this.dirty()) {
      this.confirmDiscard.set(true);
      return;
    }
    this.confirmDiscard.set(false);
    this.editorOpen.set(false);
    this.fieldPickerOpen.set(false);
  }
  update<K extends keyof CrmTemplate>(key: K, value: CrmTemplate[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.saveError.set('');
  }
  setChannel(value: string): void {
    // El SMS no lleva asunto ni marcado: se normaliza al cambiar de canal.
    this.draft.update((draft) => ({
      ...draft,
      channel: value as TemplateChannel,
      subject: value === 'sms' ? '' : draft.subject,
      format: value === 'sms' ? 'text' : draft.format,
    }));
    this.saveError.set('');
  }
  setFormat(value: string): void {
    this.update('format', value as TemplateFormat);
  }
  setModule(value: string): void {
    this.update('module', value as TemplateModule);
  }
  save(): void {
    if (!this.canEdit()) return;
    const result = this.store.save(this.draft());
    if (!result.ok) return this.saveError.set(result.error);
    this.close(true);
    this.notify('Plantilla guardada');
  }

  // --------------------------------------------------------------- Acciones

  askDelete(template: CrmTemplate): void {
    if (this.store.usageOf(template.id)) {
      this.notify(`«${template.name}» la usa ${this.store.usageOf(template.id)}: no se puede eliminar.`);
      return;
    }
    this.deleting.set(template);
  }
  confirmDelete(): void {
    const template = this.deleting();
    if (!template) return;
    const result = this.store.remove(template.id);
    this.deleting.set(null);
    if (this.draft().id === template.id) this.close(true);
    this.notify(result.ok ? 'Plantilla eliminada' : result.error);
  }
  duplicate(template: CrmTemplate): void {
    const copy = this.store.duplicate(template);
    this.notify(`Se creó «${copy.name}» como borrador`);
  }

  /** Abre el redactor del sistema con la plantilla ya resuelta, dirigida a ti. */
  sendTest(): void {
    const preview = this.preview();
    this.testSeed.set({
      title: 'Enviar prueba de plantilla',
      to: this.session.user()?.email ?? '',
      subject: `[Prueba] ${preview.subject}`,
      body: this.draft().format === 'html' ? htmlToText(preview.body) : preview.body,
    });
    this.testKey.update((key) => key + 1);
  }
  testSubmitted(value: LeadEmailFormValue, draft: boolean): void {
    this.emails.saveEmail(this.session.user()?.id ?? 'template-tests', value, draft);
    this.testSeed.set(null);
    this.notify(draft ? 'Prueba guardada como borrador' : `Prueba enviada a ${value.to}`);
  }

  /**
   * Inserta `${token}` donde está el cursor. Si el usuario acaba de teclear `$`
   * para abrir el selector, ese `$` se reemplaza en vez de duplicarse.
   */
  insertField(field: MergeField, target: HTMLInputElement | HTMLTextAreaElement): void {
    const key = target.tagName === 'INPUT' ? 'subject' : 'body';
    const value = target.value;
    const end = target.selectionEnd ?? value.length;
    const start = value.slice(0, end).endsWith('$') ? end - 1 : (target.selectionStart ?? end);
    const snippet = `\${${field.token}}`;
    const next = value.slice(0, start) + snippet + value.slice(end);
    this.update(key as 'subject' | 'body', next);
    this.fieldPickerOpen.set(false);
    queueMicrotask(() => {
      target.focus();
      target.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }
  /** Teclear `$` abre el selector de variables. */
  handleKey(event: KeyboardEvent): void {
    if (event.key === '$') this.fieldPickerOpen.set(true);
  }

  /** Registro de muestra: el del módulo más valores para sus campos personalizados. */
  private previewRecord(module: TemplateModule): Record<string, unknown> {
    const custom = module ? customModule(module) : undefined;
    const fields = custom?.fields ?? (module ? nativeCustomFields(module) : []);
    return {
      ...(PREVIEW_RECORD[module] ?? (custom ? { name: `(${custom.primaryLabel})` } : {})),
      ...Object.fromEntries(fields.map((field) => [field.key, sampleValue(field.type, field.label)])),
    };
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
