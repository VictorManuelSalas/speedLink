import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AccessStore, initialsOf, passwordProblem } from '../../core/auth/access-store';
import { ACTION_LABELS, UserStatus, accessModules } from '../../core/auth/access.model';
import { SessionContext } from '../../core/auth/session-context';
import { LanguageService } from '../../core/i18n/language.service';

const STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  active: 'Activo',
  invited: 'Invitación pendiente',
  suspended: 'Suspendido',
};

@Component({
  selector: 'app-user-profile-page',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './user-profile-page.html',
  styleUrl: './user-profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfilePage {
  readonly i18n = inject(LanguageService);
  readonly session = inject(SessionContext);
  private readonly access = inject(AccessStore);
  readonly statusLabels = STATUS_LABELS;
  readonly initials = initialsOf;

  private readonly userId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );
  readonly user = computed(() => this.access.user(this.userId()));
  readonly role = computed(() => {
    const user = this.user();
    return user ? this.access.role(user.roleId) : undefined;
  });
  readonly isSelf = computed(() => this.user()?.id === this.session.user()?.id);
  readonly canManageUsers = computed(() => this.session.hasPermission('users.read'));

  /** Resumen legible de lo que el rol permite, módulo por módulo. */
  readonly accessSummary = computed(() => {
    const user = this.user();
    if (!user) return [];
    const permissions = this.access.permissionsOf(user.id);
    return accessModules().map((module) => ({
      label: module.label,
      actions: module.actions
        .filter((action) => permissions.has(`${module.key}.${action}`))
        .map((action) => ACTION_LABELS[action]),
    })).filter((item) => item.actions.length);
  });

  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly passwordError = signal('');
  readonly passwordSaved = signal(false);

  async changePassword(event: Event): Promise<void> {
    event.preventDefault();
    const user = this.user();
    if (!user) return;
    this.passwordSaved.set(false);
    if (this.newPassword() !== this.confirmPassword())
      return this.passwordError.set('La confirmación no coincide con la nueva contraseña.');
    if (this.newPassword() === this.currentPassword())
      return this.passwordError.set('La nueva contraseña debe ser distinta a la actual.');
    const weak = passwordProblem(this.newPassword());
    if (weak) return this.passwordError.set(weak);
    const result = await this.access.changePassword(
      user.id,
      this.currentPassword(),
      this.newPassword(),
    );
    if (!result.ok) return this.passwordError.set(result.error);
    this.passwordError.set('');
    this.currentPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.passwordSaved.set(true);
  }
}
