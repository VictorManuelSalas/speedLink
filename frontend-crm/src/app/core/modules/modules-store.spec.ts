import { TestBed } from '@angular/core/testing';
import { TemplateStore } from '../data-access/templates/template-store';
import { mergeFieldGroups } from '../data-access/templates/template.model';
import { accessModules, allPermissions } from '../auth/access.model';
import { moduleDefinition } from '../../features/operations/module-registry';
import { ModulesStore } from './modules-store';

const field = (label: string, extra: object = {}) => ({
  label,
  type: 'text' as const,
  required: false,
  helpText: '',
  options: [],
  showInList: false,
  ...extra,
});

const moduleInput = {
  singular: 'Orden de trabajo',
  plural: 'Órdenes de trabajo',
  gender: 'f' as const,
  description: '',
  icon: '/icons/menu/fi-rr-document.svg',
  accent: '#7c3aed',
  primaryLabel: 'Folio',
  idPrefix: 'ORD',
};

describe('ModulesStore', () => {
  let store: ModulesStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ModulesStore);
  });

  it('adds custom fields to a native module and exposes them to forms and templates', () => {
    const result = store.addField('leads', field('Presupuesto', { showInList: true }));
    expect(result.ok && result.value.key).toBe('cf_presupuesto');
    TestBed.tick();
    const definition = moduleDefinition('leads')!;
    expect(definition.fields.some((f) => f.key === 'cf_presupuesto' && f.custom)).toBe(true);
    expect(definition.columns.some((c) => c.key === 'cf_presupuesto')).toBe(true);
    const tokens = mergeFieldGroups('leads').flatMap((g) => g.fields.map((f) => f.token));
    expect(tokens).toContain('custom.cf_presupuesto');
  });

  it('rejects labels that clash with system or custom fields', () => {
    expect(store.addField('leads', field('Correo')).ok).toBe(false);
    store.addField('leads', field('Zona'));
    expect(store.addField('leads', field('zona')).ok).toBe(false);
  });

  it('never changes the type of an existing field', () => {
    const created = store.addField('leads', field('Zona'));
    if (!created.ok) throw new Error(created.error);
    expect(store.updateField('leads', created.value.key, field('Zona', { type: 'number' })).ok).toBe(false);
  });

  it('requires options for picklists', () => {
    expect(store.addField('leads', field('Tipo', { type: 'picklist', options: ['', ' '] })).ok).toBe(false);
  });

  it('creates custom modules with permissions and rejects duplicates or native names', () => {
    const created = store.createModule(moduleInput, 'Test');
    expect(created.ok && created.value.key).toBe('cm_ordenes_de_trabajo');
    TestBed.tick();
    expect(accessModules().some((m) => m.key === 'cm_ordenes_de_trabajo')).toBe(true);
    expect(allPermissions()).toContain('cm_ordenes_de_trabajo.create');
    expect(store.createModule({ ...moduleInput, idPrefix: 'OTR' }, 'Test').ok).toBe(false);
    expect(store.createModule({ ...moduleInput, plural: 'Clientes', idPrefix: 'CLX' }, 'Test').ok).toBe(false);
    expect(store.createModule({ ...moduleInput, plural: 'Torres', idPrefix: 'SL' }, 'Test').ok).toBe(false);
  });
});

describe('TemplateStore rules', () => {
  let templates: TemplateStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    templates = TestBed.inject(TemplateStore);
  });

  it('protects templates used by CRM features', () => {
    expect(templates.remove('tpl-contract-send').ok).toBe(false);
    expect(templates.remove('tpl-generic-followup').ok).toBe(true);
  });

  it('keeps the contract template even when a newer one exists', () => {
    const base = templates.find('tpl-contract-send')!;
    templates.save({ ...base, id: 'tpl-new', name: 'Otra de contratos' });
    expect(templates.forFeature('tpl-contract-send', 'contracts', 'email')?.id).toBe('tpl-contract-send');
  });

  it('blocks active templates with unknown variables but allows drafts', () => {
    const base = { ...templates.find('tpl-generic-followup')!, id: 'tpl-x', name: 'Prueba', body: 'Hola ${nada.aqui}' };
    expect(templates.save(base).ok).toBe(false);
    expect(templates.save({ ...base, status: 'DRAFT' }).ok).toBe(true);
  });

  it('names duplicates without collisions', () => {
    const base = templates.find('tpl-generic-followup')!;
    expect(templates.duplicate(base).name).toBe('Seguimiento general (copia)');
    expect(templates.duplicate(base).name).toBe('Seguimiento general (copia 2)');
  });
});
