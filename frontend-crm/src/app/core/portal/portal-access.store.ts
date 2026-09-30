import { Injectable, signal } from '@angular/core';

const ACCESS_KEY = 'speedlink-client-portal-pins';

/** `none` = nunca se le envió invitación. */
export type PortalAccessStatus = 'none' | 'active' | 'disabled';

export interface PortalAccess {
  readonly pin: string;
  /** Ausente mientras la invitación no se ha enviado. */
  readonly status?: Exclude<PortalAccessStatus, 'none'>;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}

/**
 * Acceso de cada cliente al portal: su PIN y si puede entrar. Deshabilitar no
 * borra el PIN, para poder reactivar el acceso sin reenviar nada.
 */
@Injectable({ providedIn: 'root' })
export class PortalAccessStore {
  private readonly records = signal<Readonly<Record<string, PortalAccess>>>(this.read());

  access(customerId: string): PortalAccess | undefined {
    return this.records()[this.key(customerId)];
  }

  status(customerId: string): PortalAccessStatus {
    return this.access(customerId)?.status ?? 'none';
  }

  /** PIN del cliente; si aún no tiene, se genera uno sin activar el acceso. */
  pinFor(customerId: string): string {
    const current = this.access(customerId);
    if (current) return current.pin;
    const pin = this.generatePin();
    this.write(customerId, { pin });
    return pin;
  }

  /** Enviar la invitación activa el acceso, salvo que esté deshabilitado. */
  markInvited(customerId: string, by: string): void {
    const pin = this.pinFor(customerId);
    if (this.status(customerId) === 'disabled') return;
    this.write(customerId, { pin, status: 'active', updatedAt: new Date().toISOString(), updatedBy: by });
  }

  disable(customerId: string, by: string): void {
    this.write(customerId, {
      pin: this.pinFor(customerId),
      status: 'disabled',
      updatedAt: new Date().toISOString(),
      updatedBy: by,
    });
  }

  /** Reactiva el acceso; con `newPin` el PIN anterior deja de servir. */
  enable(customerId: string, by: string, newPin = false): string {
    const pin = newPin ? this.generatePin() : this.pinFor(customerId);
    this.write(customerId, { pin, status: 'active', updatedAt: new Date().toISOString(), updatedBy: by });
    return pin;
  }

  regeneratePin(customerId: string, by: string): string {
    const pin = this.generatePin();
    this.write(customerId, {
      ...this.access(customerId),
      pin,
      updatedAt: new Date().toISOString(),
      updatedBy: by,
    });
    return pin;
  }

  /** Lee de nuevo el almacenamiento: el portal puede estar en otra pestaña. */
  isDisabled(customerId: string): boolean {
    this.records.set(this.read());
    return this.status(customerId) === 'disabled';
  }

  /** Cuántos clientes hay en cada estado, para los indicadores de Ajustes. */
  summary(): { active: number; disabled: number } {
    const all = Object.values(this.records());
    return {
      active: all.filter((access) => access.status === 'active').length,
      disabled: all.filter((access) => access.status === 'disabled').length,
    };
  }

  /** Sólo un acceso activo deja entrar, aunque el PIN coincida. */
  matches(customerId: string, pin: string): boolean {
    this.records.set(this.read());
    const access = this.access(customerId);
    return access?.status === 'active' && access.pin === pin.trim();
  }

  private write(customerId: string, access: PortalAccess): void {
    this.records.update((records) => ({ ...records, [this.key(customerId)]: access }));
    try {
      localStorage.setItem(ACCESS_KEY, JSON.stringify(this.records()));
    } catch {
      // Sin almacenamiento el acceso vive sólo en esta sesión.
    }
  }

  private key(customerId: string): string {
    return customerId.trim().toLocaleUpperCase();
  }

  private generatePin(): string {
    const [value] = crypto.getRandomValues(new Uint32Array(1));
    return String(value % 10_000).padStart(4, '0');
  }

  private read(): Record<string, PortalAccess> {
    try {
      const raw = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? '{}') as Record<
        string,
        PortalAccess | string
      >;
      // La primera versión guardaba sólo el PIN: esos clientes ya estaban invitados.
      return Object.fromEntries(
        Object.entries(raw).map(([id, value]) => [
          id,
          typeof value === 'string' ? { pin: value, status: 'active' as const } : value,
        ]),
      );
    } catch {
      return {};
    }
  }
}
