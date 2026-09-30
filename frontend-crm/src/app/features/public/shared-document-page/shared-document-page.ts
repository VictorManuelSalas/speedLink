import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  SHARED_DOCUMENT_LABEL,
  SHARED_DOCUMENT_MODULE,
  SharedDocumentKind,
  isValidDocumentToken,
} from '../../../core/documents/shared-documents';
import { ORGANIZATION } from '../../../core/organization/organization.model';
import type { OperationalModuleKey } from '../../operations/operational-modules.data';
import { OperationalStore } from '../../operations/operational-store';
import { DocumentBuilder } from '../../operations/printable-document/document-builder.service';
import { DocumentPdfService } from '../../operations/printable-document/document-pdf.service';

/**
 * Página pública del enlace que se manda por WhatsApp: el cliente la abre en
 * su teléfono y descarga el PDF sin iniciar sesión en el CRM.
 */
@Component({
  selector: 'app-shared-document-page',
  templateUrl: './shared-document-page.html',
  styleUrl: './shared-document-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedDocumentPage {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(OperationalStore);
  private readonly builder = inject(DocumentBuilder);
  private readonly pdf = inject(DocumentPdfService);
  readonly org = ORGANIZATION;

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly kind = computed(() => this.params().get('kind') ?? '');
  readonly id = computed(() => this.params().get('id') ?? '');
  readonly validToken = computed(() => isValidDocumentToken(this.kind(), this.id(), this.query().get('t')));
  readonly label = computed(() => SHARED_DOCUMENT_LABEL[this.kind() as SharedDocumentKind] ?? 'Documento');

  /** El estado de cuenta no depende de los registros operativos; lo demás sí. */
  readonly loading = computed(() => this.validToken() && this.kind() !== 'statement' && !this.store.dataReady());
  readonly document = computed(() => {
    if (!this.validToken() || this.loading()) return null;
    const kind = this.kind() as SharedDocumentKind;
    if (kind === 'statement') return this.builder.statement(this.id());
    const module = SHARED_DOCUMENT_MODULE[kind] as OperationalModuleKey;
    const record = this.store.find(module, this.id());
    return record ? this.builder.build(module, record) : null;
  });
  readonly downloaded = signal(false);

  constructor() {
    // Se descarga solo una vez al abrir; el botón queda para repetir.
    effect(() => {
      const document = this.document();
      if (document && !untracked(this.downloaded)) untracked(() => this.download());
    });
  }

  download(): void {
    const document = this.document();
    if (!document) return;
    this.pdf.download(document);
    this.downloaded.set(true);
  }
}
