import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { AuthType, ConnectionInput, CustomConnection, IntegrationsStore } from '../../../core/integrations/integrations.store';

const EMPTY: ConnectionInput = { name: '', baseUrl: 'https://', auth: 'bearer', authName: '', headers: [], enabled: true };

const AUTH_LABEL: Readonly<Record<AuthType, string>> = {
  none: 'Sin autenticación',
  'api-key': 'API key en encabezado',
  bearer: 'Token Bearer',
  basic: 'Usuario y contraseña (Basic)',
};

/** Conexiones a cualquier API externa, reutilizables por los webhooks. */
@Component({
  selector: 'app-custom-connections-section',
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <section class="conn-group">
      <div class="cc-head">
        <h2>Personalizadas</h2>
        @if (canEdit()) {
          <button class="button" type="button" (click)="open()">＋ Nueva conexión</button>
        }
      </div>
      <div class="conn-grid">
        @for (item of store.connections(); track item.id) {
          <article class="settings-content-card conn-card">
            <header>
              <span class="conn-mark conn-mark--slate">{{ initials(item.name) }}</span>
              <div>
                <h3>{{ item.name }}</h3>
                <small>{{ item.baseUrl }}</small>
              </div>
              <span class="settings-status settings-status--{{ item.enabled ? (store.hasServer ? 'active' : 'pending') : 'inactive' }}"
                ><i></i>{{ item.enabled ? (store.hasServer ? 'Funcionando' : 'Espera al servidor') : 'Pausada' }}</span
              >
            </header>
            <p>{{ authLabel(item.auth) }}{{ item.secretTail ? ' · ●●●● ' + item.secretTail : '' }}{{ item.headers.length ? ' · ' + item.headers.length + ' encabezado(s)' : '' }}</p>
            <ul class="conn-used">
              <li>{{ store.usage(item.id) }} webhook(s)</li>
            </ul>
            <footer>
              <small>Modificada {{ item.updatedAt | date: 'dd MMM y' }} · {{ item.updatedBy }}</small>
              @if (canEdit()) {
                <div class="cc-actions">
                  <button class="button" type="button" (click)="open(item)">Editar</button>
                  <button class="button cc-danger" type="button" (click)="remove(item)">Eliminar</button>
                </div>
              }
            </footer>
          </article>
        } @empty {
          <article class="settings-content-card conn-card">
            <p>Conecta cualquier API (UISP, ERP, contabilidad) y úsala en <a routerLink="/settings/webhooks">Webhooks</a> para no repetir la URL y la llave.</p>
          </article>
        }
      </div>
      @if (removeError()) {
        <p class="channel-error">{{ removeError() }}</p>
      }
    </section>

    @if (editor(); as current) {
      <button class="settings-modal-backdrop" type="button" aria-label="Cerrar" (click)="editor.set(null)"></button>
      <section class="settings-modal conn-dialog" role="dialog" aria-modal="true" aria-label="Conexión personalizada">
        <header>
          <div>
            <span>Conexión personalizada</span>
            <h2>{{ current.id ? 'Editar conexión' : 'Nueva conexión' }}</h2>
            <p>URL base y autenticación de la API. Los webhooks la usan para enviar sus avisos.</p>
          </div>
          <button class="icon-button" type="button" aria-label="Cerrar" (click)="editor.set(null)">×</button>
        </header>
        <form (submit)="save($event)" novalidate>
          <div class="conn-body">
            <div class="channel-grid conn-grid-form">
              <label [class.has-error]="fieldError('name')"
                ><span>Nombre <b>*</b></span
                ><input name="name" placeholder="UISP Ubiquiti" [ngModel]="draft().name" (ngModelChange)="set('name', $event)" />
                @if (fieldError('name'); as message) {
                  <small class="channel-error">{{ message }}</small>
                }
              </label>
              <label [class.has-error]="fieldError('baseUrl')"
                ><span>URL base <b>*</b></span
                ><input name="baseUrl" placeholder="https://api.ejemplo.com/v1" [ngModel]="draft().baseUrl" (ngModelChange)="set('baseUrl', $event)" />
                @if (fieldError('baseUrl'); as message) {
                  <small class="channel-error">{{ message }}</small>
                }
              </label>
              <label
                ><span>Autenticación</span
                ><span class="settings-select"
                  ><select name="auth" [ngModel]="draft().auth" (ngModelChange)="set('auth', $event)">
                    <option value="none">Sin autenticación</option>
                    <option value="api-key">API key en encabezado</option>
                    <option value="bearer">Token Bearer</option>
                    <option value="basic">Usuario y contraseña (Basic)</option></select
                  ><i>⌄</i></span
                ></label
              >
              @if (draft().auth === 'api-key' || draft().auth === 'basic') {
                <label [class.has-error]="fieldError('authName')"
                  ><span>{{ draft().auth === 'api-key' ? 'Encabezado' : 'Usuario' }} <b>*</b></span
                  ><input name="authName" [placeholder]="draft().auth === 'api-key' ? 'x-auth-token' : 'usuario'" [ngModel]="draft().authName" (ngModelChange)="set('authName', $event)" />
                  @if (fieldError('authName'); as message) {
                    <small class="channel-error">{{ message }}</small>
                  }
                </label>
              }
              @if (draft().auth !== 'none') {
                <label class="channel-wide"
                  ><span>{{ draft().auth === 'basic' ? 'Contraseña' : 'Llave / token' }} {{ current.id ? '' : '*' }}</span
                  ><input name="secret" type="password" autocomplete="new-password" [placeholder]="current.id ? 'Sin cambios' : ''" [ngModel]="secret()" (ngModelChange)="secret.set($event)" />
                  <small class="channel-hint">Se enviará al servidor; aquí solo quedan sus últimos 4 caracteres.</small>
                </label>
              }
              <div class="channel-wide cc-headers">
                <span>Encabezados adicionales</span>
                @for (header of draft().headers; track $index; let i = $index) {
                  <div class="cc-header-row">
                    <input [name]="'hn' + i" placeholder="Nombre" [ngModel]="header.name" (ngModelChange)="setHeader(i, 'name', $event)" />
                    <input [name]="'hv' + i" placeholder="Valor" [ngModel]="header.value" (ngModelChange)="setHeader(i, 'value', $event)" />
                    <button type="button" aria-label="Quitar encabezado" (click)="removeHeader(i)">×</button>
                  </div>
                }
                @if (fieldError('headers'); as message) {
                  <small class="channel-error">{{ message }}</small>
                }
                <button class="conn-link" type="button" (click)="addHeader()">＋ Agregar encabezado</button>
              </div>
              <label class="net-check channel-wide"
                ><input type="checkbox" name="enabled" [ngModel]="draft().enabled" (ngModelChange)="set('enabled', $event)" />Activa</label
              >
            </div>
          </div>
          @if (error()) {
            <p class="channel-error conn-save-error">{{ error() }}</p>
          }
          <footer>
            <button class="button" type="button" (click)="editor.set(null)">Cancelar</button>
            <button class="button button--primary" type="submit">{{ current.id ? 'Guardar' : 'Crear conexión' }}</button>
          </footer>
        </form>
      </section>
    }
  `,
  styleUrls: ['../settings-pages.scss', '../settings-channel.scss', './settings-connections-page.scss'],
  styles: `
    .cc-head {
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;

      h2 {
        margin: 0 !important;
      }
    }
    .cc-actions {
      display: flex;
      gap: 6px;
    }
    .cc-danger {
      color: #dc2626 !important;
    }
    .cc-headers {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: var(--color-text-secondary);
      font-size: 11.5px;
      font-weight: 650;
    }
    .cc-header-row {
      display: grid;
      grid-template-columns: 1fr 1fr 32px;
      gap: 8px;

      button {
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-surface);
        color: var(--color-text-secondary);
        cursor: pointer;
      }
    }
    .net-check {
      flex-direction: row !important;
      align-items: center;
      gap: 8px !important;
      color: var(--color-text-primary) !important;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomConnectionsSection {
  readonly store = inject(IntegrationsStore);
  private readonly session = inject(SessionContext);
  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));

  readonly editor = signal<{ id?: string } | null>(null);
  readonly draft = signal<ConnectionInput>(EMPTY);
  readonly secret = signal('');
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly removeError = signal('');
  readonly errors = computed(() => this.store.validateConnection(this.draft(), this.editor()?.id));

  authLabel(auth: AuthType): string {
    return AUTH_LABEL[auth];
  }
  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase();
  }

  open(item?: CustomConnection): void {
    this.draft.set(
      item
        ? { name: item.name, baseUrl: item.baseUrl, auth: item.auth, authName: item.authName, headers: [...item.headers], enabled: item.enabled }
        : { ...EMPTY, headers: [] },
    );
    this.secret.set('');
    this.submitted.set(false);
    this.error.set('');
    this.editor.set({ id: item?.id });
  }

  set<K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.error.set('');
  }
  setHeader(index: number, key: 'name' | 'value', value: string): void {
    this.draft.update((draft) => ({
      ...draft,
      headers: draft.headers.map((header, i) => (i === index ? { ...header, [key]: value } : header)),
    }));
  }
  addHeader(): void {
    this.draft.update((draft) => ({ ...draft, headers: [...draft.headers, { name: '', value: '' }] }));
  }
  removeHeader(index: number): void {
    this.draft.update((draft) => ({ ...draft, headers: draft.headers.filter((_, i) => i !== index) }));
  }
  fieldError(key: keyof ConnectionInput): string | undefined {
    return this.submitted() ? this.errors()[key] : undefined;
  }

  save(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    const result = this.store.saveConnection(this.draft(), this.secret(), this.session.user()?.name ?? 'Sistema', this.editor()?.id);
    if (!result.ok) return this.error.set(result.error);
    this.editor.set(null);
  }

  remove(item: CustomConnection): void {
    const result = this.store.removeConnection(item.id);
    this.removeError.set(result.ok ? '' : result.error);
  }
}
