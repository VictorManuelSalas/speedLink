import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccessStore, RoleInput, initialsOf } from '../../../core/auth/access-store';
import {
  ACCESS_ACTIONS,
  ACTION_LABELS,
  SPECIAL_ACTIONS,
  SPECIAL_ACTION_HINTS,
  AccessAction,
  AccessModule,
  Permission,
  Role,
  accessModules,
  allPermissions,
  normalizePermissions,
  permissionOf,
} from '../../../core/auth/access.model';
import { SessionContext } from '../../../core/auth/session-context';

interface ModuleGroup {
  readonly title: string;
  readonly modules: ReadonlyArray<AccessModule>;
}

/** Acción que se quería hacer cuando había cambios sin guardar. */
type PendingNavigation = { kind: 'select'; roleId: string } | { kind: 'create' };

@Component({
  selector: 'app-settings-roles-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './settings-roles-page.html',
  styleUrls: ['../settings-pages.scss', './settings-roles-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsRolesPage {
  readonly access = inject(AccessStore);
  readonly session = inject(SessionContext);
  readonly actions = ACCESS_ACTIONS;
  readonly actionLabels = ACTION_LABELS;
  readonly specialHints = SPECIAL_ACTION_HINTS;
  /** Incluye los módulos personalizados: crece cuando se crea uno. */
  readonly totalPermissions = computed(() => allPermissions().length);
  readonly initials = initialsOf;
  readonly groups = computed<ReadonlyArray<ModuleGroup>>(() => {
    const modules = accessModules();
    return [...new Set(modules.map((m) => m.group))].map((title) => ({
      title,
      modules: modules.filter((m) => m.group === title),
    }));
  });

  readonly selectedId = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('role') ?? this.access.roles()[0]?.id ?? '',
  );
  readonly selected = computed(
    () => this.access.role(this.selectedId()) ?? this.access.roles()[0],
  );
  /** Permisos en edición del rol seleccionado; se guardan con "Guardar cambios". */
  readonly draft = signal<ReadonlySet<Permission>>(new Set(this.selected()?.permissions ?? []));
  readonly saveError = signal('');
  readonly toast = signal('');

  readonly roleEditor = signal<{ id: string | null } | null>(null);
  readonly roleDraft = signal<RoleInput>({ name: '', description: '' });
  readonly copyFrom = signal('');
  readonly roleError = signal('');

  readonly deleting = signal<Role | null>(null);
  readonly reassignTo = signal('');
  readonly deleteError = signal('');
  readonly pendingNavigation = signal<PendingNavigation | null>(null);

  readonly canCreate = computed(() => this.session.hasPermission('roles.create'));
  readonly canUpdate = computed(() => this.session.hasPermission('roles.update'));
  readonly canDelete = computed(() => this.session.hasPermission('roles.delete'));
  /** El administrador siempre tiene todo; sin permiso de editar, sólo se consulta. */
  readonly readOnly = computed(() => !!this.selected()?.system || !this.canUpdate());

  readonly effectivePermissions = computed<ReadonlySet<Permission>>(() =>
    this.selected()?.system ? new Set(allPermissions()) : this.draft(),
  );
  readonly dirty = computed(() => {
    const role = this.selected();
    if (!role || role.system) return false;
    const draft = this.draft();
    return draft.size !== role.permissions.length || role.permissions.some((p) => !draft.has(p));
  });
  readonly selectedUsers = computed(() =>
    this.access.users().filter((user) => user.roleId === this.selected()?.id),
  );
  readonly isOwnRole = computed(() => this.session.user()?.roleId === this.selected()?.id);
  readonly metrics = computed(() => ({
    roles: this.access.roles().length,
    custom: this.access.roles().filter((role) => !role.system).length,
    unassigned: this.access.users().filter((user) => !this.access.role(user.roleId)).length,
  }));

  userCount(roleId: string): number {
    return this.access.userCountByRole().get(roleId) ?? 0;
  }

  permissionCount(role: Role): number {
    return role.system ? this.totalPermissions() : role.permissions.length;
  }

  // ------------------------------------------------------------- Selección

  select(roleId: string): void {
    if (roleId === this.selected()?.id) return;
    if (this.dirty()) {
      this.pendingNavigation.set({ kind: 'select', roleId });
      return;
    }
    this.applySelection(roleId);
  }

  discardAndContinue(): void {
    const pending = this.pendingNavigation();
    this.pendingNavigation.set(null);
    this.resetDraft();
    if (pending?.kind === 'select') this.applySelection(pending.roleId);
    if (pending?.kind === 'create') this.openCreate(true);
  }

  private applySelection(roleId: string): void {
    this.selectedId.set(roleId);
    this.resetDraft();
  }

  resetDraft(): void {
    this.draft.set(new Set(this.selected()?.permissions ?? []));
    this.saveError.set('');
  }

  // ---------------------------------------------------------------- Matriz

  /** Permisos fuera de la matriz (p. ej. ver credenciales de equipos). */
  specialActions(module: AccessModule): ReadonlyArray<AccessAction> {
    return module.actions.filter((action) => SPECIAL_ACTIONS.includes(action));
  }

  supports(module: AccessModule, action: AccessAction): boolean {
    return module.actions.includes(action);
  }

  has(module: AccessModule, action: AccessAction): boolean {
    return this.effectivePermissions().has(permissionOf(module.key, action));
  }

  /**
   * Activar cualquier acción activa "Ver"; quitar "Ver" quita todo el módulo,
   * porque no se puede crear o editar lo que no se puede ver.
   */
  toggle(module: AccessModule, action: AccessAction): void {
    if (this.readOnly() || !this.supports(module, action)) return;
    const next = new Set(this.draft());
    const permission = permissionOf(module.key, action);
    if (next.has(permission)) {
      if (action === 'read') module.actions.forEach((a) => next.delete(permissionOf(module.key, a)));
      else next.delete(permission);
    } else {
      next.add(permission);
    }
    this.setDraft(next);
  }

  moduleState(module: AccessModule): 'all' | 'some' | 'none' {
    const count = module.actions.filter((a) => this.has(module, a)).length;
    return count === module.actions.length ? 'all' : count ? 'some' : 'none';
  }

  toggleModule(module: AccessModule): void {
    if (this.readOnly()) return;
    const next = new Set(this.draft());
    const grant = this.moduleState(module) !== 'all';
    module.actions.forEach((a) =>
      grant ? next.add(permissionOf(module.key, a)) : next.delete(permissionOf(module.key, a)),
    );
    this.setDraft(next);
  }

  columnState(action: AccessAction): 'all' | 'some' | 'none' {
    const modules = accessModules().filter((m) => this.supports(m, action));
    const count = modules.filter((m) => this.has(m, action)).length;
    return count === modules.length ? 'all' : count ? 'some' : 'none';
  }

  toggleColumn(action: AccessAction): void {
    if (this.readOnly()) return;
    const next = new Set(this.draft());
    const grant = this.columnState(action) !== 'all';
    for (const module of accessModules()) {
      if (!this.supports(module, action)) continue;
      const permission = permissionOf(module.key, action);
      if (grant) next.add(permission);
      else if (action === 'read') module.actions.forEach((a) => next.delete(permissionOf(module.key, a)));
      else next.delete(permission);
    }
    this.setDraft(next);
  }

  private setDraft(next: Set<Permission>): void {
    this.draft.set(new Set(normalizePermissions(next)));
    this.saveError.set('');
  }

  savePermissions(): void {
    const role = this.selected();
    const actorId = this.session.user()?.id ?? '';
    if (!role) return;
    const result = this.access.updateRole(
      role.id,
      { name: role.name, description: role.description },
      this.draft(),
      actorId,
    );
    if (!result.ok) return this.saveError.set(result.error);
    this.resetDraft();
    this.notify(`Permisos de ${role.name} guardados`);
  }

  // ---------------------------------------------------------- Datos del rol

  openCreate(skipDirtyCheck = false): void {
    if (!skipDirtyCheck && this.dirty()) {
      this.pendingNavigation.set({ kind: 'create' });
      return;
    }
    this.roleDraft.set({ name: '', description: '' });
    this.copyFrom.set('');
    this.roleError.set('');
    this.roleEditor.set({ id: null });
  }

  duplicate(role: Role): void {
    this.roleDraft.set({ name: `${role.name} (copia)`, description: role.description });
    this.copyFrom.set(role.id);
    this.roleError.set('');
    this.roleEditor.set({ id: null });
  }

  openEdit(role: Role): void {
    this.roleDraft.set({ name: role.name, description: role.description });
    this.roleError.set('');
    this.roleEditor.set({ id: role.id });
  }

  setRoleDraft(key: keyof RoleInput, value: string): void {
    this.roleDraft.update((draft) => ({ ...draft, [key]: value }));
    this.roleError.set('');
  }

  saveRole(event: Event): void {
    event.preventDefault();
    const editor = this.roleEditor();
    if (!editor) return;
    if (editor.id) {
      const role = this.access.role(editor.id);
      if (!role) return;
      // Sólo cambian nombre y descripción: se guardan los permisos ya guardados,
      // no el borrador de la matriz.
      const result = this.access.updateRole(
        role.id,
        this.roleDraft(),
        role.permissions,
        this.session.user()?.id ?? '',
      );
      if (!result.ok) return this.roleError.set(result.error);
      this.roleEditor.set(null);
      this.notify('Rol actualizado');
      return;
    }
    const result = this.access.createRole(this.roleDraft(), this.copyFrom() || undefined);
    if (!result.ok) return this.roleError.set(result.error);
    this.roleEditor.set(null);
    this.applySelection(result.value.id);
    this.notify(`Rol ${result.value.name} creado`);
  }

  askDelete(role: Role): void {
    this.deleteError.set('');
    this.reassignTo.set(
      this.access.roles().find((item) => item.id !== role.id && !item.system)?.id ??
        this.access.roles().find((item) => item.id !== role.id)?.id ??
        '',
    );
    this.deleting.set(role);
  }

  confirmDelete(): void {
    const role = this.deleting();
    if (!role) return;
    const result = this.access.deleteRole(role.id, this.reassignTo() || undefined);
    if (!result.ok) return this.deleteError.set(result.error);
    this.deleting.set(null);
    this.applySelection(this.access.roles()[0]?.id ?? '');
    this.notify(`Rol ${role.name} eliminado`);
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
