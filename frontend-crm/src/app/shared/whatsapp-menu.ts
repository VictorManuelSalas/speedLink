import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../core/auth/session-context';
import { TemplateStore } from '../core/data-access/templates/template-store';
import { CrmTemplate, TemplateModule } from '../core/data-access/templates/template.model';
import { MessageContext } from '../core/whatsapp/message-context';
import { WhatsappSender } from '../core/whatsapp/whatsapp-sender';

/**
 * Botón «WhatsApp ▾» de una ficha. Las opciones son las plantillas de WhatsApp
 * activas del módulo (y las de «Todos los módulos») que aplican al estado del
 * registro: crear una plantilla en Ajustes la agrega aquí sin tocar código.
 */
@Component({
  selector: 'app-whatsapp-menu',
  imports: [DatePipe, RouterLink],
  template: `
    @if (templates().length) {
      <div class="share-menu">
        <button
          class="button"
          type="button"
          aria-haspopup="menu"
          [attr.aria-expanded]="open()"
          [disabled]="!hasPhone()"
          [title]="hasPhone() ? 'Enviar por WhatsApp' : 'Este registro no tiene un teléfono al que mandar'"
          (click)="toggle($event)"
        >
          <svg class="whatsapp" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11.6a8 8 0 0 1-11.8 7l-4.2 1 1.1-4A8 8 0 1 1 20 11.6Z" />
            <path
              d="M8.5 7.8c.3-.4.6-.3.9-.1l1.1 2c.1.3 0 .5-.2.7l-.6.6c.7 1.5 1.8 2.6 3.3 3.2l.6-.7c.2-.2.5-.3.7-.2l2 1c.3.2.4.5.3.8-.3 1-1.2 1.7-2.3 1.7-3.5-.3-7.4-4.2-7.7-7.7 0-.5.3-1 .6-1.3Z"
            />
          </svg>
          WhatsApp ▾
        </button>
        @if (open()) {
          <div class="share-menu__panel wa-menu" role="menu" (click)="$event.stopPropagation()">
            @for (template of own(); track template.id) {
              <button type="button" role="menuitem" (click)="send(template)">
                <span
                  ><b>{{ template.name }}</b
                  ><small>{{ hint(template) }}</small></span
                >
              </button>
            }
            @if (general().length) {
              <p class="wa-menu__group">Generales</p>
              @for (template of general(); track template.id) {
                <button type="button" role="menuitem" (click)="send(template)">
                  <span
                    ><b>{{ template.name }}</b
                    ><small>{{ hint(template) }}</small></span
                  >
                </button>
              }
            }
            @if (!own().length && !general().length) {
              <p class="wa-menu__empty">Ninguna plantilla aplica al estado actual de este registro.</p>
            }
            @if (hiddenCount()) {
              <p class="wa-menu__note">{{ hiddenCount() }} plantilla(s) no aplican al estado actual.</p>
            }
            @if (last(); as entry) {
              <p class="whatsapp-last">Último: {{ entry.templateName }} · {{ entry.at | date: 'dd MMM, HH:mm' }}</p>
            }
            @if (canManage()) {
              <a class="wa-menu__manage" routerLink="/settings/templates">Administrar plantillas ›</a>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    .wa-menu {
      width: 290px;
      max-height: min(420px, 70vh);
      overflow: auto;
    }
    .wa-menu__group,
    .wa-menu__note,
    .wa-menu__empty {
      margin: 4px 0 0;
      padding: 6px 10px 2px;
      color: var(--color-text-secondary);
      font-size: 10.5px;
    }
    .wa-menu__group {
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .wa-menu__manage {
      padding: 8px 10px 4px;
      color: var(--color-primary);
      font-size: 11.5px;
      font-weight: 700;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappMenu {
  private readonly store = inject(TemplateStore);
  private readonly sender = inject(WhatsappSender);
  private readonly context = inject(MessageContext);
  private readonly session = inject(SessionContext);

  readonly module = input.required<TemplateModule>();
  /** Registro de la ficha (debe traer su `id`). */
  readonly record = input.required<object>();
  private readonly data = computed(() => this.record() as Readonly<Record<string, unknown>>);

  readonly open = signal(false);
  readonly canManage = computed(() => this.session.hasPermission('settings.read'));

  readonly templates = computed(() => this.store.whatsappFor(this.module()));
  private readonly built = computed(() => this.context.build(this.module(), this.data()));
  readonly hasPhone = computed(() => this.sender.hasPhone(this.built().phone));
  /** Plantillas que aplican al estado del registro («Mostrar solo cuando…»). */
  private readonly applicable = computed(() => {
    const state = this.built().state;
    return this.templates().filter((template) => !template.showWhen?.length || template.showWhen.includes(state));
  });
  readonly own = computed(() => this.applicable().filter((template) => template.module !== ''));
  readonly general = computed(() => this.applicable().filter((template) => template.module === ''));
  readonly hiddenCount = computed(() => this.templates().length - this.applicable().length);
  readonly last = computed(() => this.sender.last(String(this.data()['id'] ?? '')));

  @HostListener('document:click')
  close(): void {
    this.open.set(false);
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open.update((open) => !open);
  }

  hint(template: CrmTemplate): string {
    const firstLine = template.body.split('\n').find((line) => line.trim()) ?? '';
    const clean = firstLine.replace(/\$\{[^}]+\}/g, '…').replace(/[*_~]/g, '');
    return (template.attachDocument ? '📎 ' : '') + (clean.length > 60 ? `${clean.slice(0, 58)}…` : clean);
  }

  send(template: CrmTemplate): void {
    this.open.set(false);
    this.sender.open(this.sender.fromRecord(this.module(), this.data(), template.id));
  }
}
