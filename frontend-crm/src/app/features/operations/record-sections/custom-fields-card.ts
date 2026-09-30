import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { systemUserName, systemUserOptions } from '../../../core/data-access/system-users';
import { CustomField } from '../../../core/modules/custom-modules.model';
import { ModulesStore } from '../../../core/modules/modules-store';
import { RecordField, RecordFieldConfig } from '../../../shared/record-field';
import { lookupDisplayLabel, lookupPicklistOptions } from '../lookup-options';
import { toModuleField } from '../module-registry';
import { OperationalStore } from '../operational-store';

/**
 * Campos personalizados de módulos con ficha propia (clientes, tickets). Los
 * valores se guardan en ModulesStore porque esos registros no pasan por el
 * formulario genérico de módulos.
 */
@Component({
  selector: 'app-custom-fields-card',
  imports: [RecordField, RouterLink],
  template: `
    @if (fields().length) {
      <section class="custom-fields-card card">
        <header>
          <div>
            <h2>Campos personalizados</h2>
            <p>Definidos en Ajustes › Módulos.</p>
          </div>
          @if (canConfigure()) {
            <a [routerLink]="['/settings/modules', moduleKey()]">Configurar</a>
          }
        </header>
        <div class="custom-fields-card__grid">
          @for (item of configs(); track item.field.key) {
            <div>
              <app-record-field
                [config]="item.config"
                [value]="item.value"
                (valueSaved)="save(item.field, $event)"
              />
              @if (item.field.helpText) {
                <small>{{ item.field.helpText }}</small>
              }
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .custom-fields-card {
      margin-bottom: 20px;
    }
    header {
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--color-border);
    }
    h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    p {
      margin: 3px 0 0;
      color: var(--color-text-secondary);
      font-size: 11px;
    }
    a {
      color: var(--color-primary);
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
    }
    .custom-fields-card__grid {
      padding: 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 18px 20px;
    }
    small {
      display: block;
      margin-top: 4px;
      color: var(--color-text-secondary);
      font-size: 11px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomFieldsCard {
  private readonly modules = inject(ModulesStore);
  private readonly operations = inject(OperationalStore);
  private readonly session = inject(SessionContext);
  readonly moduleKey = input.required<string>();
  readonly recordId = input.required<string>();

  readonly fields = computed(() => this.modules.fieldsOf(this.moduleKey()));
  readonly canConfigure = computed(() => this.session.hasPermission('settings.update'));
  readonly configs = computed(() => {
    const values = this.modules.valuesFor(this.moduleKey(), this.recordId());
    return this.fields().map((field) => ({
      field,
      value: values[field.key] ?? '',
      config: this.configFor(field, values[field.key] ?? ''),
    }));
  });

  save(field: CustomField, value: string): void {
    this.modules.setValue(this.moduleKey(), this.recordId(), field.key, value);
  }

  private configFor(field: CustomField, value: string): RecordFieldConfig {
    const base = {
      key: field.key,
      label: field.label + (field.required ? ' *' : ''),
      editable: true,
      validationConfig: {
        required: field.required,
        validateAs:
          field.type === 'email'
            ? ('email' as const)
            : field.type === 'phone'
              ? ('phone' as const)
              : field.type === 'url'
                ? ('url' as const)
                : field.type === 'number' || field.type === 'currency'
                  ? ('number' as const)
                  : undefined,
      },
    };
    switch (field.type) {
      case 'email':
        return { ...base, kind: 'email' };
      case 'phone':
        return { ...base, kind: 'phone' };
      case 'date':
        return { ...base, kind: 'date' };
      case 'currency':
        return {
          ...base,
          kind: 'text',
          displayValue: value
            ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value) || 0)
            : '',
        };
      case 'picklist':
        return { ...base, kind: 'select', options: field.options };
      case 'checkbox':
        return { ...base, kind: 'select', options: ['true', 'false'], optionLabels: { true: 'Sí', false: 'No' } };
      case 'user':
        return {
          ...base,
          kind: 'lookup',
          picklistOptions: systemUserOptions(),
          displayValue: systemUserName(value) ?? value,
          route: value ? ['/settings/users', value] : undefined,
        };
      case 'lookup': {
        const moduleField = toModuleField(field);
        return {
          ...base,
          kind: 'lookup',
          picklistOptions: lookupPicklistOptions(this.operations, moduleField, { currentValue: value }),
          displayValue: lookupDisplayLabel(this.operations, moduleField, value),
        };
      }
      default:
        return { ...base, kind: 'text' };
    }
  }
}
