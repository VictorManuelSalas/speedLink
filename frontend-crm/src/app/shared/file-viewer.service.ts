import { Injectable, signal } from '@angular/core';
import { CrmAttachment } from '../core/models/customer';

export type FilePreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'none';

interface OpenFile {
  readonly file: CrmAttachment;
  /** Sólo se ofrece "Eliminar" cuando quien abre el visor sabe borrarlo. */
  readonly onDelete?: () => void;
}

/** Tipo de vista previa que el navegador puede mostrar para un archivo. */
/** Tipo para archivos sin contenido real que mostrar (p. ej. documentos de demostración). */
export const NO_PREVIEW_MIME = 'application/x-no-preview';

export function previewKind(file: CrmAttachment): FilePreviewKind {
  const type = file.mimeType.toLowerCase();
  if (type === NO_PREVIEW_MIME) return 'none';
  // La extensión sólo cuenta cuando el navegador no reconoció el tipo.
  const unknown = !type || type === 'application/octet-stream';
  const extension = unknown ? (file.fileName.split('.').pop()?.toLowerCase() ?? '') : '';
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || ['txt', 'csv', 'json', 'log', 'md'].includes(extension))
    return 'text';
  return 'none';
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Descarga con el nombre original. Un enlace `download` no funciona con URLs
 * de otro dominio (el navegador lo abre en vez de guardarlo), así que en ese
 * caso se baja primero como blob.
 */
export async function downloadAttachment(file: CrmAttachment): Promise<void> {
  let url = file.url;
  let temporary = false;
  const sameOrigin =
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    new URL(url, window.location.href).origin === window.location.origin;
  if (!sameOrigin) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      url = URL.createObjectURL(await response.blob());
      temporary = true;
    } catch {
      // Sin CORS no se puede leer: se abre para que el usuario lo guarde.
      window.open(file.url, '_blank', 'noopener');
      return;
    }
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (temporary) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Visor de archivos compartido; el modal vive una sola vez en el layout. */
@Injectable({ providedIn: 'root' })
export class FileViewer {
  readonly current = signal<OpenFile | null>(null);

  open(file: CrmAttachment, onDelete?: () => void): void {
    this.current.set({ file, onDelete });
  }

  close(): void {
    this.current.set(null);
  }
}
