import { ChangeDetectionStrategy, Component, OnDestroy, inject, input, signal } from '@angular/core';
import { CredentialRef, CredentialVault } from '../../../core/equipment/credential-vault';

const REVEAL_SECONDS = 30;

/**
 * Contraseña de un equipo: oculta por defecto, se pide al servidor al
 * mostrarla y se vuelve a ocultar sola. Nunca se guarda en el navegador.
 */
@Component({
  selector: 'app-secret-field',
  template: `
    <div class="secret">
      <span class="secret__label">{{ label() }}</span>
      <div class="secret__value">
        @if (revealed(); as value) {
          <code>{{ value }}</code>
          <small>Se oculta en {{ countdown() }} s</small>
        } @else {
          <span class="secret__dots">●●●●●●●●</span>
        }
        <span class="secret__actions">
          @if (revealed()) {
            <button type="button" (click)="copy()">{{ copied() ? '✓ Copiada' : 'Copiar' }}</button>
            <button type="button" (click)="hide()">Ocultar</button>
          } @else {
            <button
              type="button"
              [disabled]="!allowed() || !vault.available || loading()"
              [attr.title]="blockedReason()"
              (click)="reveal()"
            >
              {{ loading() ? '…' : 'Mostrar' }}
            </button>
          }
          @if (canChange()) {
            <button
              type="button"
              [disabled]="!vault.available"
              [attr.title]="vault.available ? null : unavailableMessage"
            >
              Cambiar
            </button>
          }
        </span>
      </div>
      @if (blockedReason(); as reason) {
        <small class="secret__note">{{ reason }}</small>
      }
      @if (error()) {
        <small class="secret__note secret__note--error">{{ error() }}</small>
      }
    </div>
  `,
  styles: `
    .secret {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .secret__label {
      color: var(--color-text-secondary);
      font-size: 11.5px;
      font-weight: 650;
    }
    .secret__value {
      min-height: 42px;
      padding: 4px 6px 4px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px dashed var(--color-border);
      border-radius: 9px;
      background: var(--color-background);
    }
    .secret__dots {
      flex: 1;
      color: var(--color-text-secondary);
      letter-spacing: 0.1em;
    }
    code {
      flex: 1;
      font: 700 13px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
      user-select: all;
    }
    small {
      color: var(--color-text-secondary);
      font-size: 11px;
    }
    .secret__actions {
      display: flex;
      gap: 4px;
    }
    button {
      height: 30px;
      padding: 0 10px;
      border: 0;
      border-radius: 7px;
      background: var(--color-muted);
      color: var(--color-primary);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    button:disabled {
      color: var(--color-text-secondary);
      cursor: not-allowed;
      opacity: 0.7;
    }
    .secret__note--error {
      color: #b91c1c;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecretField implements OnDestroy {
  readonly vault = inject(CredentialVault);
  readonly label = input.required<string>();
  readonly credential = input.required<CredentialRef>();
  /** El rol del usuario puede revelar este secreto. */
  readonly allowed = input(false);
  /** El rol puede cambiarlo (editar el equipo). */
  readonly canChange = input(false);
  readonly deniedMessage = input('Tu rol no puede ver esta contraseña.');

  readonly unavailableMessage = 'Disponible cuando se conecte el servidor de credenciales.';
  readonly revealed = signal<string | null>(null);
  readonly countdown = signal(REVEAL_SECONDS);
  readonly loading = signal(false);
  readonly copied = signal(false);
  readonly error = signal('');
  private timer = 0;

  blockedReason(): string | null {
    if (!this.allowed()) return this.deniedMessage();
    if (!this.vault.available) return this.unavailableMessage;
    return null;
  }

  async reveal(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const result = await this.vault.reveal(this.credential());
    this.loading.set(false);
    if (!result.ok) return this.error.set(result.message);
    this.revealed.set(result.value);
    this.countdown.set(REVEAL_SECONDS);
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.countdown.update((value) => value - 1);
      if (this.countdown() <= 0) this.hide();
    }, 1000);
  }

  hide(): void {
    clearInterval(this.timer);
    this.revealed.set(null);
    this.copied.set(false);
  }

  async copy(): Promise<void> {
    const value = this.revealed();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(true);
    } catch {
      this.error.set('No se pudo copiar; selecciónala manualmente.');
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
