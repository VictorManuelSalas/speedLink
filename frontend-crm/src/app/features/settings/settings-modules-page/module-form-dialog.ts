import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionContext } from '../../../core/auth/session-context';
import { CustomModule, MODULE_ICONS, toApiName } from '../../../core/modules/custom-modules.model';
import { ModuleInput, ModulesStore } from '../../../core/modules/modules-store';

/** Alta o edición de un módulo personalizado. */
@Component({
  selector: 'app-module-form-dialog',
  imports: [FormsModule],
  templateUrl: './module-form-dialog.html',
  styleUrls: ['../settings-pages.scss', './settings-modules.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleFormDialog {
  private readonly store = inject(ModulesStore);
  private readonly session = inject(SessionContext);
  readonly icons = MODULE_ICONS;
  /** Sin módulo es un alta. */
  readonly module = input<CustomModule | null>(null);
  readonly saved = output<CustomModule>();
  readonly closed = output<void>();

  readonly draft = signal<ModuleInput>({
    singular: '',
    plural: '',
    gender: 'f',
    description: '',
    icon: MODULE_ICONS[0].value,
    accent: '#7c3aed',
    primaryLabel: 'Nombre',
    idPrefix: '',
  });
  /** El prefijo se sugiere del nombre hasta que el usuario lo escribe a mano. */
  private readonly prefixTouched = signal(false);
  readonly error = signal('');
  readonly apiName = computed(() => `cm_${toApiName(this.draft().plural) || '…'}`);

  ngOnInit(): void {
    const module = this.module();
    if (module) {
      this.draft.set({
        singular: module.singular,
        plural: module.plural,
        gender: module.gender ?? 'm',
        description: module.description,
        icon: module.icon,
        accent: module.accent,
        primaryLabel: module.primaryLabel,
        idPrefix: module.idPrefix,
      });
      this.prefixTouched.set(true);
    }
  }

  set<K extends keyof ModuleInput>(key: K, value: ModuleInput[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.error.set('');
    if (key === 'idPrefix') this.prefixTouched.set(true);
    if (key === 'plural' && !this.prefixTouched()) {
      const letters = toApiName(String(value)).replace(/[^a-z]/g, '').toUpperCase();
      this.draft.update((draft) => ({ ...draft, idPrefix: letters.slice(0, 3) }));
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    const module = this.module();
    const result = module
      ? this.store.updateModule(module.key, this.draft())
      : this.store.createModule(this.draft(), this.session.user()?.name ?? 'Sistema');
    if (!result.ok) return this.error.set(result.error);
    this.saved.emit(result.value);
  }
}
