import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  FileViewer,
  NO_PREVIEW_MIME,
  downloadAttachment,
  formatFileSize,
  previewKind,
} from './file-viewer.service';

const TEXT_PREVIEW_LIMIT = 200_000;

/** Vista previa de un archivo con Descargar, Abrir y Eliminar. */
@Component({
  selector: 'app-file-preview-modal',
  imports: [DatePipe],
  templateUrl: './file-preview-modal.html',
  styleUrl: './file-preview-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilePreviewModal {
  private readonly sanitizer = inject(DomSanitizer);
  readonly viewer = inject(FileViewer);
  readonly current = this.viewer.current;
  readonly kind = computed(() => {
    const open = this.current();
    return open ? previewKind(open.file) : 'none';
  });
  /** El PDF va en un iframe, que Angular exige marcar como recurso de confianza. */
  readonly resourceUrl = computed<SafeResourceUrl | null>(() => {
    const open = this.current();
    return open ? this.sanitizer.bypassSecurityTrustResourceUrl(open.file.url) : null;
  });
  /** Documento sin contenido real que abrir (demostración del portal). */
  readonly unavailable = computed(() => this.current()?.file.mimeType === NO_PREVIEW_MIME);
  readonly text = signal<string | null>(null);
  readonly failed = signal(false);
  readonly confirmingDelete = signal(false);
  readonly formatSize = formatFileSize;

  constructor() {
    effect(() => {
      const open = this.current();
      this.confirmingDelete.set(false);
      this.failed.set(false);
      this.text.set(null);
      if (open && previewKind(open.file) === 'text') void this.loadText(open.file.url);
    });
  }

  download(): void {
    const open = this.current();
    if (open) void downloadAttachment(open.file);
  }

  confirmDelete(): void {
    const open = this.current();
    if (!open?.onDelete) return;
    open.onDelete();
    this.viewer.close();
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.viewer.close();
  }

  private async loadText(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const content = await response.text();
      this.text.set(
        content.length > TEXT_PREVIEW_LIMIT
          ? `${content.slice(0, TEXT_PREVIEW_LIMIT)}\n\n… (vista previa recortada)`
          : content,
      );
    } catch {
      this.failed.set(true);
    }
  }
}
