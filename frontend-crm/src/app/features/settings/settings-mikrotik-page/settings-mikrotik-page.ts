import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../core/auth/session-context';
import { MikrotikStore, RouterInput } from '../../../core/network/mikrotik.store';
import {
  CutoffRules,
  MikrotikRouter,
  SpeedProfile,
  routerSetupScript,
  speedLabel,
} from '../../../core/network/mikrotik.model';
import { OperationalStore } from '../../operations/operational-store';

type Tab = 'routers' | 'profiles' | 'rules';
type RulesInput = Omit<CutoffRules, 'updatedAt' | 'updatedBy'>;
type ProfileInput = Omit<SpeedProfile, 'id' | 'serviceId'>;

const EMPTY_ROUTER: RouterInput = {
  name: '',
  node: '',
  host: '',
  port: 443,
  api: 'rest',
  username: 'crm-api',
  blockList: 'morosos',
  enabled: true,
};

@Component({
  selector: 'app-settings-mikrotik-page',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './settings-mikrotik-page.html',
  styleUrls: [
    '../settings-pages.scss',
    '../settings-channel.scss',
    '../../network/network.scss',
    './settings-mikrotik-page.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsMikrotikPage {
  readonly store = inject(MikrotikStore);
  private readonly ops = inject(OperationalStore);
  private readonly session = inject(SessionContext);
  readonly speedText = speedLabel;

  readonly canEdit = computed(() => this.session.hasPermission('settings.update'));
  readonly tab = signal<Tab>('routers');
  readonly toast = signal('');

  // ─────────────────────────────────────────────────────────── Routers

  readonly routerEditor = signal<{ id?: string } | null>(null);
  readonly routerDraft = signal<RouterInput>(EMPTY_ROUTER);
  readonly routerSecret = signal('');
  readonly routerSubmitted = signal(false);
  readonly routerError = signal('');
  readonly routerErrors = computed(() => this.store.validateRouter(this.routerDraft(), this.routerEditor()?.id));
  readonly scriptFor = signal<MikrotikRouter | null>(null);
  readonly removingRouter = signal<MikrotikRouter | null>(null);
  readonly testing = signal<string | null>(null);
  readonly testResult = signal<Readonly<Record<string, { ok: boolean; message: string }>>>({});
  readonly script = computed(() => {
    const router = this.scriptFor();
    return router ? routerSetupScript(router).join('\n') : '';
  });
  readonly scriptCopied = signal(false);

  openRouter(router?: MikrotikRouter): void {
    this.routerDraft.set(
      router
        ? {
            name: router.name,
            node: router.node,
            host: router.host,
            port: router.port,
            api: router.api,
            username: router.username,
            blockList: router.blockList,
            enabled: router.enabled,
          }
        : EMPTY_ROUTER,
    );
    this.routerSecret.set('');
    this.routerSubmitted.set(false);
    this.routerError.set('');
    this.routerEditor.set({ id: router?.id });
  }

  setRouter<K extends keyof RouterInput>(key: K, value: RouterInput[K]): void {
    this.routerDraft.update((draft) => {
      const next = { ...draft, [key]: value };
      // Puerto habitual de cada servicio cuando aún no se cambió a mano.
      if (key === 'api' && (draft.port === 443 || draft.port === 8729)) next.port = value === 'rest' ? 443 : 8729;
      return next;
    });
    this.routerError.set('');
  }

  routerFieldError(key: keyof RouterInput): string | undefined {
    return this.routerSubmitted() ? this.routerErrors()[key] : undefined;
  }

  saveRouter(event: Event): void {
    event.preventDefault();
    this.routerSubmitted.set(true);
    const id = this.routerEditor()?.id;
    const result = this.store.saveRouter(this.routerDraft(), this.routerSecret(), this.actor(), id);
    if (!result.ok) return this.routerError.set(result.error);
    this.routerEditor.set(null);
    this.notify(id ? 'Router actualizado' : 'Router agregado');
    if (!id) this.scriptFor.set(result.value);
  }

  toggleRouter(router: MikrotikRouter): void {
    const { id: _id, ...rest } = router;
    this.store.saveRouter({ ...rest, enabled: !router.enabled }, '', this.actor(), router.id);
    this.notify(router.enabled ? 'Router desactivado: sus acciones se ocultan' : 'Router activado');
  }

  async test(router: MikrotikRouter): Promise<void> {
    this.testing.set(router.id);
    const result = await this.store.testRouter(router.id);
    this.testResult.update((results) => ({ ...results, [router.id]: result }));
    this.testing.set(null);
  }

  confirmRemoveRouter(): void {
    const router = this.removingRouter();
    if (!router) return;
    const result = this.store.removeRouter(router.id);
    this.removingRouter.set(null);
    this.notify(result.ok ? 'Router eliminado' : result.error);
  }

  copyScript(): void {
    void navigator.clipboard?.writeText(this.script()).then(() => {
      this.scriptCopied.set(true);
      window.setTimeout(() => this.scriptCopied.set(false), 1800);
    });
  }

  // ───────────────────────────────────────────────────────── Perfiles

  readonly profileEditor = signal<{ id?: string; serviceId?: string } | null>(null);
  readonly profileDraft = signal<ProfileInput>({ name: '', download: 10, upload: 2, burst: true });
  readonly profileError = signal('');
  readonly removingProfile = signal<SpeedProfile | null>(null);

  /** Perfil de un plan de Servicios (su nombre y velocidad viven en el servicio). */
  isPlanProfile(profile: SpeedProfile): boolean {
    return !!profile.serviceId && !!this.ops.find('services', profile.serviceId);
  }

  openProfile(profile?: SpeedProfile): void {
    this.profileDraft.set(
      profile
        ? { name: profile.name, download: profile.download, upload: profile.upload, burst: profile.burst }
        : { name: '', download: 10, upload: 2, burst: true },
    );
    this.profileError.set('');
    this.profileEditor.set({ id: profile?.id, serviceId: profile && this.isPlanProfile(profile) ? profile.serviceId : undefined });
  }

  setProfile<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]): void {
    this.profileDraft.update((draft) => ({ ...draft, [key]: value }));
    this.profileError.set('');
  }

  saveProfile(event: Event): void {
    event.preventDefault();
    const draft = this.profileDraft();
    const result = this.store.saveProfile(
      { ...draft, download: Number(draft.download), upload: Number(draft.upload) },
      this.profileEditor()?.id,
    );
    if (!result.ok) return this.profileError.set(result.error);
    const plan = !!this.profileEditor()?.serviceId;
    this.profileEditor.set(null);
    this.notify(plan ? 'Plan actualizado en Servicios y en las colas de sus clientes' : 'Perfil guardado');
  }

  confirmRemoveProfile(): void {
    const profile = this.removingProfile();
    const result = profile ? this.store.removeProfile(profile.id) : null;
    this.removingProfile.set(null);
    if (result) this.notify(result.ok ? 'Perfil eliminado' : result.error);
  }

  planName(serviceId: string): string {
    return String(this.ops.find('services', serviceId)?.['name'] ?? '');
  }

  // ─────────────────────────────────────────────────────────── Reglas

  readonly rulesDraft = signal<RulesInput>(this.rulesInput());
  readonly rulesError = signal('');
  readonly rulesDirty = computed(() => JSON.stringify(this.rulesDraft()) !== JSON.stringify(this.rulesInput()));

  setRule<K extends keyof RulesInput>(key: K, value: RulesInput[K]): void {
    this.rulesDraft.update((draft) => ({ ...draft, [key]: value }));
    this.rulesError.set('');
  }

  saveRules(): void {
    const draft = this.rulesDraft();
    const result = this.store.saveRules({ ...draft, graceDays: Number(draft.graceDays) }, this.actor());
    if (!result.ok) return this.rulesError.set(result.error);
    this.rulesDraft.set(this.rulesInput());
    this.notify('Reglas de corte guardadas');
  }

  discardRules(): void {
    this.rulesDraft.set(this.rulesInput());
    this.rulesError.set('');
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.routerEditor.set(null);
    this.profileEditor.set(null);
    this.scriptFor.set(null);
    this.removingRouter.set(null);
    this.removingProfile.set(null);
  }

  private rulesInput(): RulesInput {
    const { updatedAt: _at, updatedBy: _by, ...rules } = this.store.rules();
    return rules;
  }

  private notify(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 2800);
  }

  private actor(): string {
    return this.session.user()?.name ?? 'Sistema';
  }
}
