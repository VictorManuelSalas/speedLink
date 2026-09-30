import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { CrmAttachment } from '../../../core/models/customer';
import { AttachmentPicker } from '../../../shared/attachment-picker';
import { FileUploadModal } from '../../../shared/file-upload-modal';
import { FileItem } from '../../../shared/file-item';
import { FileViewer, downloadAttachment } from '../../../shared/file-viewer.service';
import { InlineEditableDateField } from '../../../shared/inline-editable-date-field';
import { LeadEmailFormValue, LeadEmailModal, LeadEmailSeed } from '../lead-email-modal/lead-email-modal';
import { TemplateModule } from '../../../core/data-access/templates/template.model';
import { OperationalActivity, OperationalEmail, OperationalStore } from '../operational-store';
import { RecordRelations, RelatedRecord } from './record-relations';
import { RouterLink } from '@angular/router';

/** Evento del historial con el registro relacionado del que viene (null = el propio). */
type ActivityView = OperationalActivity & { source: RelatedRecord | null };

const SECTION_STYLES = `
  :host{display:block}.section-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}
  .section-head h2{font-size:20px}.section-head p{margin-top:4px;color:var(--color-text-secondary);font-size:12px}
  .button{min-height:38px;padding:0 14px;border:1px solid var(--color-border);border-radius:9px;background:var(--color-surface);color:var(--color-text-primary);font:inherit;font-size:11px;font-weight:750;cursor:pointer}
  .button.primary{border-color:var(--color-primary);background:var(--color-primary);color:#fff}.button:disabled{opacity:.45;cursor:not-allowed}
  .empty{min-height:230px;padding:30px;border:1px solid var(--color-border);border-radius:15px;background:var(--color-surface);display:grid;place-items:center;align-content:center;gap:8px;text-align:center}
  .empty>span{font-size:28px;color:var(--color-text-secondary)}.empty h3{font-size:15px}.empty p{color:var(--color-text-secondary);font-size:11px}
  @media(max-width:680px){.section-head{align-items:stretch;flex-direction:column}}
`;

@Component({
  selector: 'app-record-notes-section',
  imports: [AttachmentPicker, DatePipe, FileItem],
  templateUrl: './record-notes-section.html',
  styles: [SECTION_STYLES],
  styleUrl: './record-notes-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordNotesSection {
  readonly recordId = input.required<string>();
  readonly autoOpen = input(false);
  readonly store = inject(OperationalStore);
  readonly composing = signal(false);
  readonly draft = signal('');
  readonly pinned = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly menuId = signal<string | null>(null);
  readonly attachments = signal<ReadonlyArray<CrmAttachment>>([]);
  /** Archivos con los que se precarga el selector al editar una nota. */
  readonly editingAttachments = signal<ReadonlyArray<CrmAttachment>>([]);
  readonly attachmentReset = signal(0);
  constructor() {
    effect(() => {
      if (this.autoOpen()) this.composing.set(true);
    });
  }
  notes() {
    return [...this.store.notesFor(this.recordId())].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt),
    );
  }
  pinnedCount() {
    return this.notes().filter((n) => n.pinned).length;
  }
  openComposer() {
    this.composing.set(true);
  }
  save() {
    const value = this.draft().trim();
    if (!value) return;
    const id = this.editingId();
    if (id) this.store.updateNote(this.recordId(), id, value, this.pinned(), this.attachments());
    else
      this.store.addNote(
        this.recordId(),
        value,
        this.attachments(),
        this.pinned() && this.pinnedCount() < 5,
      );
    this.cancel();
  }
  edit(id: string) {
    const note = this.notes().find((item) => item.id === id);
    if (!note) return;
    this.editingId.set(id);
    this.draft.set(note.message);
    this.pinned.set(note.pinned);
    // El editor arranca con los archivos actuales de la nota para poder
    // quitarlos o sumarles otros; al guardar se manda la lista completa.
    this.attachments.set(note.attachments);
    this.editingAttachments.set(note.attachments);
    this.attachmentReset.update((value) => value + 1);
    this.composing.set(true);
    this.menuId.set(null);
  }
  remove(id: string) {
    this.store.deleteNote(this.recordId(), id);
    this.menuId.set(null);
  }
  removeAttachment(noteId: string, fileId: string) {
    const note = this.notes().find((item) => item.id === noteId);
    if (!note) return;
    this.store.updateNote(
      this.recordId(),
      noteId,
      note.message,
      note.pinned,
      note.attachments.filter((file) => file.id !== fileId),
    );
  }
  togglePin(id: string) {
    this.store.togglePinnedNote(this.recordId(), id);
    this.menuId.set(null);
  }
  toggleMenu(event: MouseEvent, id: string) {
    event.stopPropagation();
    this.menuId.set(this.menuId() === id ? null : id);
  }
  cancel() {
    this.composing.set(false);
    this.draft.set('');
    this.pinned.set(false);
    this.editingId.set(null);
    this.attachments.set([]);
    this.editingAttachments.set([]);
    this.attachmentReset.update((v) => v + 1);
  }
  size(v: number) {
    return v < 1048576 ? `${Math.ceil(v / 1024)} KB` : `${(v / 1048576).toFixed(1)} MB`;
  }
  @HostListener('document:click') closeMenu() {
    this.menuId.set(null);
  }
}

@Component({
  selector: 'app-record-activity-section',
  imports: [DatePipe, InlineEditableDateField, RouterLink],
  templateUrl: './record-activity-section.html',
  styles: [SECTION_STYLES],
  styleUrl: './record-activity-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordActivitySection {
  readonly recordId = input.required<string>();
  /** Módulo del registro: define qué registros relacionados se incluyen. */
  readonly moduleKey = input('');
  readonly store = inject(OperationalStore);
  private readonly relations = inject(RecordRelations);
  readonly module = signal('');
  readonly type = signal<'' | 'CREATE' | 'EDIT' | 'DELETE'>('');
  readonly date = signal('');
  /** all = este registro y sus relacionados · own = sólo este · related = sólo relacionados. */
  readonly origin = signal<'all' | 'own' | 'related'>('all');
  readonly whatsappOnly = signal(false);

  readonly related = computed(() => this.relations.related(this.moduleKey(), this.recordId()));
  /** Historial del registro más el de sus relacionados, cada evento con su origen. */
  readonly allEvents = computed<ReadonlyArray<ActivityView>>(() => {
    const own = this.store.activityFor(this.recordId()).map((event) => ({ ...event, source: null }));
    const related = this.related().flatMap((relation) =>
      (this.store.activity()[relation.id] ?? []).map((event) => ({ ...event, source: relation })),
    );
    return [...own, ...related].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  /** Módulos presentes en el historial (en vez de una lista fija con opciones vacías). */
  readonly modules = computed(() => [...new Set(this.allEvents().map((event) => event.module))].sort());
  readonly whatsappCount = computed(() => this.allEvents().filter((event) => event.channel === 'whatsapp').length);
  readonly filtered = computed(() =>
    this.allEvents().filter(
      (e) =>
        (this.origin() === 'all' || (this.origin() === 'own' ? !e.source : !!e.source)) &&
        (!this.whatsappOnly() || e.channel === 'whatsapp') &&
        (!this.module() || e.module === this.module()) &&
        (!this.type() || e.actionType === this.type()) &&
        (!this.date() || this.key(e.createdAt) === this.date()),
    ),
  );

  events() {
    return this.allEvents();
  }
  setType(v: string) {
    this.type.set(v as '' | 'CREATE' | 'EDIT' | 'DELETE');
  }
  setOrigin(v: string) {
    this.origin.set(v as 'all' | 'own' | 'related');
  }
  clear() {
    this.module.set('');
    this.type.set('');
    this.date.set('');
    this.origin.set('all');
    this.whatsappOnly.set(false);
  }
  typeLabel(v: 'CREATE' | 'EDIT' | 'DELETE') {
    return { CREATE: 'Creación', EDIT: 'Edición', DELETE: 'Eliminación' }[v];
  }
  icon(event: ActivityView) {
    if (event.channel === 'whatsapp') return '✆';
    const t = event.tone;
    return t === 'green' ? '✓' : t === 'amber' ? '!' : t === 'violet' ? '◆' : '↻';
  }
  private key(v: string) {
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

@Component({
  selector: 'app-record-emails-section',
  imports: [DatePipe, LeadEmailModal],
  templateUrl: './record-emails-section.html',
  styles: [SECTION_STYLES],
  styleUrl: './record-emails-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordEmailsSection {
  readonly recordId = input.required<string>();
  readonly recipientEmail = input('');
  /**
   * Contador para abrir el redactor desde fuera. Se usa un contador y no un
   * booleano porque la sección se monta al cambiar de pestaña: una bandera que
   * se reinicia en el mismo tick ya llegaría apagada.
   */
  readonly openKey = input(0);
  /** Borrador ya armado (asunto, cuerpo, adjuntos) que otro módulo preparó. */
  readonly seedOverride = input<LeadEmailSeed | null>(null);
  /** Módulo y registro: filtran las plantillas y resuelven sus variables. */
  readonly module = input<TemplateModule>('');
  readonly record = input<Record<string, unknown> | null>(null);
  readonly store = inject(OperationalStore);
  readonly composer = signal(false);
  readonly preview = signal<OperationalEmail | null>(null);
  readonly seed = signal<LeadEmailSeed>({});
  readonly composeKey = signal(0);
  readonly editingId = signal<string | null>(null);
  readonly menuId = signal<string | null>(null);
  constructor() {
    effect(() => {
      if (this.openKey() > 0) this.compose();
    });
  }
  emails() {
    return this.store.emailsFor(this.recordId());
  }
  compose() {
    this.seed.set(
      this.seedOverride() ?? { to: this.recipientEmail(), from: 'andrea.torres@speedlink.mx' },
    );
    this.editingId.set(null);
    this.composeKey.update((v) => v + 1);
    this.composer.set(true);
  }
  save(v: LeadEmailFormValue, d: boolean) {
    this.store.saveEmail(this.recordId(), v, d, this.editingId() ?? undefined);
    this.close();
  }
  close() {
    this.composer.set(false);
    this.editingId.set(null);
  }
  open(e: OperationalEmail) {
    e.status === 'DRAFT' ? this.edit(e) : this.preview.set(e);
  }
  edit(e: OperationalEmail) {
    this.seed.set({ ...e, title: 'Editar borrador' });
    this.editingId.set(e.id);
    this.preview.set(null);
    this.composeKey.update((v) => v + 1);
    this.composer.set(true);
  }
  from(e: OperationalEmail, forward: boolean) {
    this.seed.set({
      to: forward ? '' : e.to,
      cc: forward ? '' : e.cc,
      from: e.from,
      subject: forward ? `Fwd: ${e.subject}` : e.subject,
      body: forward ? `\n\n---------- Mensaje reenviado ----------\n${e.body}` : e.body,
      attachments: e.attachments,
    });
    this.preview.set(null);
    this.composeKey.update((v) => v + 1);
    this.composer.set(true);
  }
  menuClick(ev: MouseEvent, id: string) {
    ev.stopPropagation();
    this.menuId.set(this.menuId() === id ? null : id);
  }
  deleteEmail(e: OperationalEmail) {
    this.store.deleteEmail(this.recordId(), e.id);
    this.menuId.set(null);
  }
  @HostListener('document:click') closeMenu() {
    this.menuId.set(null);
  }
}

@Component({
  selector: 'app-record-attachments-section',
  imports: [DatePipe, FileUploadModal],
  templateUrl: './record-attachments-section.html',
  styles: [SECTION_STYLES],
  styleUrl: './record-attachments-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordAttachmentsSection {
  readonly recordId = input.required<string>();
  readonly store = inject(OperationalStore);
  readonly upload = signal(false);
  readonly menuId = signal<string | null>(null);
  /** Archivo con el Eliminar del menú pendiente de confirmar. */
  readonly confirmId = signal<string | null>(null);
  private readonly viewer = inject(FileViewer);
  files() {
    return this.store.attachmentsFor(this.recordId());
  }
  add(v: ReadonlyArray<CrmAttachment>) {
    this.store.addAttachments(this.recordId(), v);
    this.upload.set(false);
  }
  remove(id: string) {
    this.store.deleteAttachment(this.recordId(), id);
    this.menuId.set(null);
    this.confirmId.set(null);
  }
  view(file: CrmAttachment) {
    this.menuId.set(null);
    this.viewer.open(file, () => this.remove(file.id));
  }
  download(file: CrmAttachment) {
    this.menuId.set(null);
    void downloadAttachment(file);
  }
  menuClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    this.confirmId.set(null);
    this.menuId.set(this.menuId() === id ? null : id);
  }
  extension(v: string) {
    return v.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE';
  }
  size(v: number) {
    return v < 1048576 ? `${Math.ceil(v / 1024)} KB` : `${(v / 1048576).toFixed(1)} MB`;
  }
  @HostListener('document:click') close() {
    this.menuId.set(null);
  }
}
