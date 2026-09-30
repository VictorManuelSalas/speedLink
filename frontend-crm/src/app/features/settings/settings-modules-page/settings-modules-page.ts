import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { TicketStore } from '../../../core/data-access/ticket-store';
import { CustomModule, isHiddenInMenu } from '../../../core/modules/custom-modules.model';
import { ModulesStore, NATIVE_MODULES } from '../../../core/modules/modules-store';
import { moduleDefinition } from '../../operations/module-registry';
import { OperationalStore } from '../../operations/operational-store';
import { ModuleFormDialog } from './module-form-dialog';

export interface ModuleRow {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly kind: 'native' | 'custom';
  readonly builtInFields: number;
  readonly customFields: number;
  readonly records: number;
  readonly inMenu: boolean;
}

@Component({
  selector: 'app-settings-modules-page',
  imports: [ModuleFormDialog, NgTemplateOutlet, RouterLink],
  templateUrl: './settings-modules-page.html',
  styleUrls: ['../settings-pages.scss', './settings-modules.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModulesPage {
  readonly store = inject(ModulesStore);
  private readonly session = inject(SessionContext);
  private readonly operations = inject(OperationalStore);
  private readonly tickets = inject(TicketStore);
  private readonly router = inject(Router);

  readonly creating = signal(false);
  readonly toast = signal('');
  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));

  readonly nativeRows = computed<ReadonlyArray<ModuleRow>>(() =>
    NATIVE_MODULES.map((module) => ({
      key: module.key,
      label: module.label,
      icon: module.icon,
      kind: 'native',
      builtInFields:
        module.builtIn?.length ??
        moduleDefinition(module.key)?.fields.filter((field) => !field.custom).length ??
        0,
      customFields: this.store.fieldsOf(module.key).length,
      records:
        module.key === 'tickets'
          ? this.tickets.tickets().length
          : this.operations.recordsFor(module.key as never).length,
      inMenu: !isHiddenInMenu(module.key),
    })),
  );
  readonly customRows = computed<ReadonlyArray<ModuleRow>>(() =>
    this.store.custom().map((module) => ({
      key: module.key,
      label: module.plural,
      icon: module.icon,
      kind: 'custom',
      builtInFields: 1,
      customFields: module.fields.length,
      records: this.operations.recordsFor(module.key).length,
      inMenu: module.showInMenu,
    })),
  );
  readonly totalCustomFields = computed(
    () => [...this.nativeRows(), ...this.customRows()].reduce((sum, row) => sum + row.customFields, 0),
  );

  toggleMenu(row: ModuleRow): void {
    this.store.setMenuVisibility(row.key, !row.inMenu);
    this.notify(`${row.label} ${row.inMenu ? 'ya no aparece' : 'aparece'} en el menú`);
  }

  created(module: CustomModule): void {
    this.creating.set(false);
    void this.router.navigate(['/settings/modules', module.key], { queryParams: { created: 1 } });
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2600);
  }
}
