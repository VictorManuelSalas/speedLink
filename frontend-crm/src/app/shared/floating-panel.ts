import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

const GAP = 6;
const EDGE = 8;

/**
 * Saca un panel desplegable (picklist, calendario) de su contenedor y lo pinta
 * flotando sobre la página, pegado a su campo. Así ningún modal con scroll u
 * `overflow: hidden` lo corta.
 *
 * Se mueve al `.app-frame` más cercano y no a `body` para que siga heredando
 * las variables del modo oscuro. Abre hacia abajo y, si no cabe, hacia arriba.
 */
@Directive({ selector: '[appFloatingPanel]' })
export class FloatingPanel implements OnInit, OnDestroy {
  private readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  /** Elemento junto al que se ancla el panel. */
  readonly anchor = input.required<HTMLElement>({ alias: 'appFloatingPanel' });
  /** `start` alinea con el borde izquierdo del campo; `end`, con el derecho. */
  readonly align = input<'start' | 'end'>('start');
  /** Iguala el ancho del campo (picklist); si no, respeta el ancho propio. */
  readonly matchWidth = input(false);
  /** Por debajo de este ancho el panel conserva su propio estilo (p. ej. centrado). */
  readonly disableBelow = input(0);

  private pending = 0;
  /**
   * Se agenda fuera del callback: si se reposicionara dentro del callback del
   * ResizeObserver, el cambio de tamaño que eso provoca se descartaría
   * ("ResizeObserver loop") y el panel quedaría mal medido.
   */
  private readonly reposition = () => {
    clearTimeout(this.pending);
    this.pending = window.setTimeout(() => this.position());
  };
  // El contenido cambia de alto (búsqueda, meses de 5 o 6 semanas).
  private readonly resizeObserver = new ResizeObserver(this.reposition);
  private readonly mutationObserver = new MutationObserver(this.reposition);

  ngOnInit(): void {
    const container = this.anchor().closest('.app-frame') ?? document.body;
    container.appendChild(this.element);
    this.position();
    // En captura: también reacciona al scroll del modal, no sólo al de la página.
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    this.resizeObserver.observe(this.element);
    // Con `max-height` el panel deja de crecer aunque su contenido sí lo haga,
    // y parte del contenido (bloques @if/@for) se pinta después de este hook:
    // cualquier cambio en el árbol vuelve a medir.
    this.mutationObserver.observe(this.element, { childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    clearTimeout(this.pending);
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    this.element.remove();
  }

  private position(): void {
    const style = this.element.style;
    if (window.innerWidth <= this.disableBelow()) {
      for (const key of ['top', 'left', 'right', 'bottom', 'width', 'maxHeight', 'margin']) {
        style.removeProperty(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
      }
      style.position = 'fixed';
      style.zIndex = '2000';
      return;
    }

    const rect = this.anchor().getBoundingClientRect();
    style.position = 'fixed';
    style.zIndex = '2000';
    style.margin = '0';
    style.right = 'auto';
    style.bottom = 'auto';
    style.transform = 'none';
    if (this.matchWidth()) style.width = `${rect.width}px`;

    const width = this.element.offsetWidth;
    // Se mide sin el límite de la vez anterior: con `max-height` puesto,
    // scrollHeight no cuenta el padding inferior y el panel sale corto.
    style.maxHeight = '';
    style.overflowY = '';
    const height = this.element.offsetHeight;
    const preferred = this.align() === 'end' ? rect.right - width : rect.left;
    const left = Math.min(Math.max(preferred, EDGE), window.innerWidth - width - EDGE);

    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    style.left = `${Math.max(left, EDGE)}px`;
    // No cabe ni arriba ni abajo pero sí en la pantalla: se muestra completo
    // aunque tape el campo, mejor que obligar a hacer scroll dentro del panel.
    if (height > below && height > above && height <= window.innerHeight - EDGE * 2) {
      style.top = `${Math.min(rect.bottom + GAP, window.innerHeight - height - EDGE)}px`;
      return;
    }
    const openUp = height > below && above > below;
    const available = Math.max(openUp ? above : below, 160);
    style.maxHeight = `${available}px`;
    style.overflowY = height > available ? 'auto' : '';
    const shown = Math.min(height, available);
    style.top = `${openUp ? rect.top - GAP - shown : rect.bottom + GAP}px`;
  }
}
