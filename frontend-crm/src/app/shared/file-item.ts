import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CrmAttachment } from '../core/models/customer';
import { FileViewer, downloadAttachment, formatFileSize, previewKind } from './file-viewer.service';

/**
 * Archivo adjunto con sus acciones: clic para la vista previa, Ver, Descargar
 * y, si quien lo pinta escucha `deleted`, Eliminar (con confirmación).
 */
@Component({
  selector: 'app-file-item',
  templateUrl: './file-item.html',
  styleUrl: './file-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileItem {
  private readonly viewer = inject(FileViewer);
  readonly file = input.required<CrmAttachment>();
  /** Muestra "Eliminar"; el padre borra el archivo al recibir `deleted`. */
  readonly deletable = input(false);
  readonly deleted = output<CrmAttachment>();
  readonly confirming = signal(false);
  readonly formatSize = formatFileSize;

  isImage(): boolean {
    return previewKind(this.file()) === 'image';
  }

  extension(): string {
    return this.file().fileName.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE';
  }

  view(): void {
    const file = this.file();
    this.viewer.open(file, this.deletable() ? () => this.deleted.emit(file) : undefined);
  }

  download(): void {
    void downloadAttachment(this.file());
  }

  remove(): void {
    this.confirming.set(false);
    this.deleted.emit(this.file());
  }
}
