import { Injectable } from '@angular/core';

/** Qué secreto se pide: la contraseña de administración o la de una red WiFi. */
export type CredentialKind = 'admin' | 'wifi';

export interface CredentialRef {
  readonly equipmentId: string;
  readonly kind: CredentialKind;
  /** Red WiFi, cuando `kind` es `wifi`. */
  readonly networkId?: string;
}

export type VaultResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unavailable' | 'forbidden' | 'not-set'; message: string };

/**
 * Acceso a las contraseñas de los equipos. El backend las guardará cifradas y
 * registrará cada vez que alguien las revela; el navegador nunca las
 * almacena. Mientras no exista ese servicio, esta implementación responde que
 * no está disponible y la interfaz lo indica en lugar de guardar en local.
 */
@Injectable({ providedIn: 'root' })
export class CredentialVault {
  /** Hay un servidor que guarda y entrega contraseñas. */
  readonly available = false;

  private unavailable<T>(): VaultResult<T> {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Disponible cuando se conecte el servidor de credenciales.',
    };
  }

  /** Devuelve la contraseña para mostrarla; el servidor registra quién la pidió. */
  async reveal(_ref: CredentialRef): Promise<VaultResult<string>> {
    return this.unavailable();
  }

  /** Guarda una contraseña nueva; la anterior queda en el historial cifrado. */
  async store(_ref: CredentialRef, _secret: string): Promise<VaultResult> {
    return this.unavailable();
  }
}
