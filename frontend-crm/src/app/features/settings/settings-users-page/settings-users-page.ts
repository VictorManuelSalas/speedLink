import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AccessResult,
  AccessStore,
  IssuedCredentials,
  UserInput,
  initialsOf,
} from '../../../core/auth/access-store';
import { CrmUser, UserStatus } from '../../../core/auth/access.model';
import { SessionContext } from '../../../core/auth/session-context';
import { FloatingPanel } from '../../../shared/floating-panel';
import {
  LeadEmailFormValue,
  LeadEmailModal,
  LeadEmailSeed,
} from '../../operations/lead-email-modal/lead-email-modal';
import { OperationalStore } from '../../operations/operational-store';

type StatusFilter = 'all' | UserStatus;
type ConfirmKind = 'suspend' | 'delete' | 'reset';

const STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  active: 'Activo',
  invited: 'Invitación pendiente',
  suspended: 'Suspendido',
};

const EMPTY_INPUT: UserInput = {
  fullName: '',
  email: '',
  phone: '',
  roleId: '',
  preferredLanguage: 'es',
};

@Component({
  selector: 'app-settings-users-page',
  imports: [DatePipe, FloatingPanel, FormsModule, LeadEmailModal, RouterLink],
  templateUrl: './settings-users-page.html',
  styleUrls: ['../settings-pages.scss', './settings-users-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsUsersPage {
  readonly access = inject(AccessStore);
  readonly session = inject(SessionContext);
  readonly initials = initialsOf;
  readonly statusLabels = STATUS_LABELS;

  readonly query = signal('');
  readonly roleFilter = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('role') ?? 'all');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly menuId = signal<string | null>(null);
  readonly toast = signal('');

  /** Alta (`id` nulo) o edición del usuario con ese id. */
  readonly editor = signal<{ id: string | null } | null>(null);
  readonly draft = signal<UserInput>({ ...EMPTY_INPUT });
  readonly formError = signal('');
  readonly saving = signal(false);

  readonly confirm = signal<{ kind: ConfirmKind; user: CrmUser } | null>(null);
  readonly confirmError = signal('');
  /** Contraseña temporal recién emitida: se muestra una sola vez. */
  readonly credentials = signal<(IssuedCredentials & { reason: 'invite' | 'reset' }) | null>(null);
  readonly copied = signal(false);
  private readonly emails = inject(OperationalStore);
  /** Redactor de correo del CRM con los datos de acceso ya escritos. */
  readonly emailSeed = signal<LeadEmailSeed | null>(null);
  readonly emailKey = signal(0);
  /** Correo enviado para las credenciales que están en pantalla. */
  readonly emailSent = signal(false);

  readonly canCreate = computed(() => this.session.hasPermission('users.create'));
  readonly canUpdate = computed(() => this.session.hasPermission('users.update'));
  readonly canDelete = computed(() => this.session.hasPermission('users.delete'));
  readonly currentUserId = computed(() => this.session.user()?.id ?? '');

  readonly metrics = computed(() => {
    const users = this.access.users();
    const count = (status: UserStatus) => users.filter((user) => user.status === status).length;
    return { total: users.length, active: count('active'), invited: count('invited'), suspended: count('suspended') };
  });

  readonly rows = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    return this.access
      .users()
      .filter((user) => role === 'all' || user.roleId === role)
      .filter((user) => status === 'all' || user.status === status)
      .filter(
        (user) =>
          !query ||
          `${user.fullName} ${user.email} ${this.roleName(user.roleId)}`
            .toLocaleLowerCase()
            .includes(query),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  });

  readonly editing = computed(() => {
    const id = this.editor()?.id;
    return id ? this.access.user(id) : undefined;
  });

  roleName(roleId: string): string {
    return this.access.role(roleId)?.name ?? 'Sin rol';
  }

  statusTone(status: UserStatus): string {
    return { active: 'active', invited: 'pending', suspended: 'danger' }[status];
  }

  isSelf(user: CrmUser): boolean {
    return user.id === this.currentUserId();
  }

  /** Motivo por el que no se puede suspender/eliminar, o null si se puede. */
  lockReason(user: CrmUser): string | null {
    if (this.isSelf(user)) return 'Es tu propia cuenta';
    if (this.access.isLastActiveAdmin(user)) return 'Es el único administrador activo';
    return null;
  }

  // ---------------------------------------------------------------- Editor

  openCreate(): void {
    const defaultRole =
      this.access.roles().find((role) => !role.system)?.id ?? this.access.roles()[0]?.id ?? '';
    this.draft.set({ ...EMPTY_INPUT, roleId: defaultRole });
    this.formError.set('');
    this.editor.set({ id: null });
  }

  openEdit(user: CrmUser): void {
    this.menuId.set(null);
    this.draft.set({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId,
      preferredLanguage: user.preferredLanguage,
    });
    this.formError.set('');
    this.editor.set({ id: user.id });
  }

  setDraft<K extends keyof UserInput>(key: K, value: UserInput[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.formError.set('');
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    const editor = this.editor();
    if (!editor || this.saving()) return;
    this.saving.set(true);
    if (editor.id) {
      const result = this.access.updateUser(editor.id, this.draft(), this.currentUserId());
      this.saving.set(false);
      if (!result.ok) return this.formError.set(result.error);
      this.editor.set(null);
      this.notify('Usuario actualizado');
      return;
    }
    const result = await this.access.createUser(this.draft());
    this.saving.set(false);
    if (!result.ok) return this.formError.set(result.error);
    this.editor.set(null);
    this.showCredentials(result.value, 'invite');
  }

  // --------------------------------------------------------------- Acciones

  toggleMenu(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.menuId.update((current) => (current === id ? null : id));
  }

  ask(kind: ConfirmKind, user: CrmUser): void {
    this.menuId.set(null);
    this.confirmError.set('');
    this.confirm.set({ kind, user });
  }

  async runConfirm(): Promise<void> {
    const pending = this.confirm();
    if (!pending) return;
    const { kind, user } = pending;
    if (kind === 'reset') {
      const result = await this.access.resetPassword(user.id);
      if (!this.handle(result)) return;
      this.confirm.set(null);
      if (result.ok) this.showCredentials(result.value, 'reset');
      return;
    }
    const result =
      kind === 'suspend'
        ? this.access.suspendUser(user.id, this.currentUserId())
        : this.access.deleteUser(user.id, this.currentUserId());
    if (!this.handle(result)) return;
    this.confirm.set(null);
    this.notify(kind === 'suspend' ? `${user.fullName} fue suspendido` : `${user.fullName} fue eliminado`);
  }

  reactivate(user: CrmUser): void {
    this.menuId.set(null);
    const result = this.access.reactivateUser(user.id);
    if (result.ok) this.notify(`${user.fullName} fue reactivado`);
    else this.notify(result.error);
  }

  /** Reenviar = nueva contraseña temporal; la anterior deja de servir. */
  async resendInvitation(user: CrmUser): Promise<void> {
    this.menuId.set(null);
    const result = await this.access.resetPassword(user.id);
    if (result.ok) this.showCredentials(result.value, 'invite');
    else this.notify(result.error);
  }

  // ------------------------------------------------------------ Credenciales

  loginUrl(): string {
    return `${window.location.origin}/login`;
  }

  credentialsText(): string {
    const issued = this.credentials();
    if (!issued) return '';
    return [
      `Hola ${issued.user.fullName},`,
      '',
      issued.reason === 'invite'
        ? 'Te dimos acceso al CRM de SpeedLink. Estos son tus datos para entrar:'
        : 'Restablecimos tu contraseña del CRM de SpeedLink. Estos son tus nuevos datos:',
      '',
      `Acceso: ${this.loginUrl()}`,
      `Usuario: ${issued.user.email}`,
      `Contraseña temporal: ${issued.password}`,
      '',
      'Cámbiala desde "Ver perfil" después de entrar.',
    ].join('\n');
  }

  /** Abre el redactor del sistema; el correo sale por el SMTP configurado en Ajustes. */
  composeCredentialsEmail(): void {
    const issued = this.credentials();
    if (!issued) return;
    this.emailSeed.set({
      title: issued.reason === 'invite' ? 'Enviar invitación' : 'Enviar nueva contraseña',
      to: issued.user.email,
      from: this.session.user()?.email ?? '',
      subject:
        issued.reason === 'invite' ? 'Tu acceso al CRM de SpeedLink' : 'Tu nueva contraseña del CRM',
      body: this.credentialsText(),
    });
    this.emailKey.update((key) => key + 1);
  }

  /** Queda en el historial de correos del usuario, igual que los de cualquier registro. */
  emailSubmitted(value: LeadEmailFormValue, draft: boolean): void {
    const issued = this.credentials();
    if (!issued) return;
    this.emails.saveEmail(issued.user.id, value, draft);
    this.emailSeed.set(null);
    if (draft) return this.notify('Correo guardado como borrador');
    this.emailSent.set(true);
    this.notify(`Correo enviado a ${value.to}`);
  }

  async copyCredentials(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.credentialsText());
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 1600);
    } catch {
      this.notify('No se pudo copiar; selecciona el texto manualmente.');
    }
  }

  @HostListener('document:click') closeMenu(): void {
    this.menuId.set(null);
  }

  private showCredentials(issued: IssuedCredentials, reason: 'invite' | 'reset'): void {
    this.copied.set(false);
    this.emailSent.set(false);
    this.credentials.set({ ...issued, reason });
  }

  private handle(result: AccessResult<unknown>): boolean {
    if (result.ok) return true;
    this.confirmError.set(result.error);
    return false;
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
