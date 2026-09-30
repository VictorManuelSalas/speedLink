import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

export interface BarSeries {
  readonly name: string;
  /** Rol de color (slot categórico): el color vive en CSS para claro/oscuro. */
  readonly slot: 1 | 2 | 3;
  readonly values: ReadonlyArray<number>;
}

/**
 * Barras verticales agrupadas: una categoría (mes) con una barra por serie.
 * Tooltip al pasar el cursor por toda la columna, leyenda con ≥2 series y
 * una tabla equivalente para quien no ve la gráfica.
 */
@Component({
  selector: 'app-bar-chart',
  template: `
    <div class="viz-root">
      @if (series().length > 1) {
        <ul class="legend" aria-hidden="true">
          @for (item of series(); track item.name) {
            <li><i class="swatch s{{ item.slot }}"></i>{{ item.name }}</li>
          }
        </ul>
      }
      <div class="plot" (mouseleave)="hover.set(null)">
        <div class="axis-max">{{ format(max()) }}</div>
        <div class="columns" role="img" [attr.aria-label]="ariaLabel()">
          @for (label of categories(); track $index; let i = $index) {
            <div
              class="column"
              [class.is-hover]="hover() === i"
              (mouseenter)="hover.set(i)"
              (focus)="hover.set(i)"
              tabindex="0"
            >
              <div class="bars">
                @for (item of series(); track item.name) {
                  <span class="bar s{{ item.slot }}" [style.height.%]="height(item.values[i])"></span>
                }
              </div>
              <small>{{ label }}</small>
              @if (hover() === i) {
                <div class="tip" [class.tip--left]="i > categories().length / 2">
                  <b>{{ label }}</b>
                  @for (item of series(); track item.name) {
                    <span><i class="swatch s{{ item.slot }}"></i>{{ item.name }}: {{ format(item.values[i]) }}</span>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
      <table class="sr-table">
        <caption>{{ ariaLabel() }}</caption>
        <tr>
          <th>Periodo</th>
          @for (item of series(); track item.name) {
            <th>{{ item.name }}</th>
          }
        </tr>
        @for (label of categories(); track $index; let i = $index) {
          <tr>
            <td>{{ label }}</td>
            @for (item of series(); track item.name) {
              <td>{{ format(item.values[i]) }}</td>
            }
          </tr>
        }
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .viz-root {
      --series-1: #2a78d6;
      --series-2: #eb6834;
      --series-3: #1baf7a;
      --grid: #e7e6e2;
    }
    :host-context(.app-frame--dark) .viz-root {
      --series-1: #3987e5;
      --series-2: #d95926;
      --series-3: #199e70;
      --grid: #3a3a37;
    }
    .legend {
      margin: 0 0 10px;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      list-style: none;
      color: var(--color-text-secondary);
      font-size: 12px;
    }
    .legend li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      width: 10px;
      height: 10px;
      flex: 0 0 10px;
      border-radius: 3px;
      display: inline-block;
    }
    .s1 {
      background: var(--series-1);
    }
    .s2 {
      background: var(--series-2);
    }
    .s3 {
      background: var(--series-3);
    }
    .plot {
      position: relative;
      padding-top: 16px;
    }
    .axis-max {
      position: absolute;
      top: 0;
      left: 0;
      color: var(--color-text-secondary);
      font-size: 10.5px;
    }
    .columns {
      height: 200px;
      display: flex;
      align-items: stretch;
      gap: 4px;
      border-top: 1px dashed var(--grid);
      border-bottom: 1px solid var(--grid);
    }
    .column {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      outline: 0;
      border-radius: 6px;
    }
    .column.is-hover {
      background: color-mix(in srgb, var(--color-text-secondary) 8%, transparent);
    }
    .bars {
      flex: 1;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 2px;
      padding: 0 3px;
    }
    .bar {
      width: min(18px, 40%);
      min-height: 0;
      border-radius: 4px 4px 0 0;
    }
    small {
      position: absolute;
      bottom: -20px;
      left: 0;
      right: 0;
      color: var(--color-text-secondary);
      font-size: 10.5px;
      text-align: center;
      white-space: nowrap;
    }
    .tip {
      position: absolute;
      z-index: 5;
      bottom: calc(100% - 20px);
      left: 50%;
      min-width: 170px;
      padding: 9px 11px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      background: var(--color-surface);
      color: var(--color-text-primary);
      font-size: 11.5px;
      box-shadow: 0 10px 28px rgb(15 23 42 / 16%);
      pointer-events: none;
    }
    .tip--left {
      left: auto;
      right: 50%;
    }
    .tip span {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .sr-table {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    :host {
      position: relative;
      padding-bottom: 22px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarChart {
  readonly categories = input.required<ReadonlyArray<string>>();
  readonly series = input.required<ReadonlyArray<BarSeries>>();
  readonly money = input(false);
  readonly ariaLabel = input('Gráfica de barras');

  readonly hover = signal<number | null>(null);
  readonly max = computed(() => Math.max(1, ...this.series().flatMap((item) => item.values)));

  height(value: number): number {
    return (Math.max(0, value) / this.max()) * 100;
  }

  format(value: number): string {
    return this.money()
      ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value)
      : new Intl.NumberFormat('es-MX').format(value);
  }
}
