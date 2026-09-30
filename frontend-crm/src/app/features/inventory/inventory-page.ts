import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../core/auth/session-context';
import { InventoryStore, StockRow } from '../../core/inventory/inventory.store';

/** Existencias por modelo con alerta de stock mínimo. */
@Component({
  selector: 'app-inventory-page',
  imports: [CurrencyPipe, RouterLink],
  template: `
    <header class="page-header">
      <div>
        <div class="breadcrumbs"><span>SpeedLink CRM</span><b>›</b><a routerLink="/equipment">Equipamiento</a><b>›</b><span>Existencias</span></div>
        <h1>Existencias</h1>
        <p>Equipos por modelo: cuántos hay en bodega, instalados y en reparación, contra el mínimo para seguir instalando.</p>
      </div>
      <div class="page-header__actions">
        <a class="button" routerLink="/equipment">Ver equipos</a>
        @if (canCreate()) {
          <a class="button button--primary" routerLink="/equipment" [queryParams]="{ create: 'true' }">＋ Registrar entrada</a>
        }
      </div>
    </header>

    <section class="inv-kpis">
      <article class="card"><span>Modelos</span><b>{{ store.totals().models }}</b></article>
      <article class="card"><span>En bodega</span><b>{{ store.totals().available }}</b><small>Listos para instalar</small></article>
      <article class="card"><span>Bajo mínimo</span><b [class.inv-bad]="store.lowStock().length">{{ store.lowStock().length }}</b><small>Modelos por reponer</small></article>
      <article class="card"><span>En reparación</span><b>{{ store.totals().repair }}</b></article>
      <article class="card"><span>Valor en bodega</span><b>{{ store.totals().value | currency: 'MXN' : 'symbol-narrow' : '1.0-0' }}</b><small>Costo de compra</small></article>
    </section>

    @if (store.lowStock().length) {
      <p class="inv-alert" role="status">
        <b>Reponer:</b>
        @for (row of store.lowStock(); track row.key; let last = $last) {
          {{ row.label }} ({{ row.available }} de {{ row.minimum }}){{ last ? '' : ' · ' }}
        }
      </p>
    }

    <section class="card inv-card">
      <header class="inv-head">
        <div class="inv-chips">
          <button type="button" [class.is-on]="!onlyLow()" (click)="onlyLow.set(false)">Todos · {{ store.rows().length }}</button>
          <button type="button" [class.is-on]="onlyLow()" (click)="onlyLow.set(true)">Bajo mínimo · {{ store.lowStock().length }}</button>
        </div>
      </header>
      <div class="inv-wrap">
        <table class="inv-table">
          <thead>
            <tr>
              <th>Modelo</th><th class="num">En bodega</th><th class="num">Instalados</th><th class="num">Reparación</th><th class="num">Baja</th><th class="num">Total</th><th class="num">Mínimo</th><th class="num">Valor en bodega</th>
            </tr>
          </thead>
          <tbody>
            @for (row of visible(); track row.key) {
              <tr [class.is-low]="row.low">
                <td>
                  <a [routerLink]="['/equipment']" [queryParams]="{ search: row.label }">{{ row.label }}</a>
                  <small>{{ row.name }} · costo promedio {{ row.averageCost | currency: 'MXN' : 'symbol-narrow' : '1.0-0' }}</small>
                </td>
                <td class="num">
                  <b [class.inv-bad]="row.low">{{ row.available }}</b>
                  @if (row.low) {
                    <span class="inv-pill">Bajo mínimo</span>
                  }
                </td>
                <td class="num">{{ row.assigned }}</td>
                <td class="num">{{ row.repair }}</td>
                <td class="num">{{ row.retired }}</td>
                <td class="num">{{ row.total }}</td>
                <td class="num">
                  @if (canEdit()) {
                    <input
                      class="inv-min"
                      type="number"
                      min="0"
                      max="999"
                      [attr.aria-label]="'Mínimo de ' + row.label"
                      [value]="row.minimum"
                      (change)="setMinimum(row, $any($event.target).value)"
                    />
                  } @else {
                    {{ row.minimum }}
                  }
                </td>
                <td class="num">{{ row.stockValue | currency: 'MXN' : 'symbol-narrow' : '1.0-0' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="inv-empty">{{ onlyLow() ? 'Ningún modelo está bajo su mínimo.' : 'Aún no hay equipos registrados.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .card { padding: 18px; }
    .inv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .inv-kpis article { padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; }
    .inv-kpis span { color: var(--color-text-secondary); font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .inv-kpis b { font-size: 22px; font-weight: 800; }
    .inv-kpis small { color: var(--color-text-secondary); font-size: 11.5px; }
    .inv-bad { color: #dc2626; }
    .inv-alert { margin: 0; padding: 11px 14px; border: 1px solid #fde68a; border-radius: 11px; background: #fffbeb; color: #92400e; font-size: 12.5px; line-height: 1.5; }
    .inv-card { padding: 0; overflow: hidden; }
    .inv-head { padding: 14px 16px; border-bottom: 1px solid var(--color-border); }
    .inv-chips { display: flex; gap: 6px; }
    .inv-chips button { padding: 6px 11px; border: 1px solid var(--color-border); border-radius: 99px; background: var(--color-surface); color: var(--color-text-secondary); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
    .inv-chips .is-on { border-color: var(--color-primary); background: var(--color-primary); color: #fff; }
    .inv-wrap { position: relative; overflow: auto; }
    .inv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .inv-table th { padding: 10px 14px; color: var(--color-text-secondary); font-size: 10.5px; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--color-border); white-space: nowrap; }
    .inv-table td { padding: 11px 14px; border-bottom: 1px solid var(--color-border); }
    .inv-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .inv-table a { color: var(--color-text-primary); font-weight: 650; }
    .inv-table small { display: block; margin-top: 2px; color: var(--color-text-secondary); font-size: 11.5px; }
    .inv-table tr.is-low td { background: color-mix(in srgb, #f59e0b 7%, transparent); }
    .inv-pill { margin-left: 6px; padding: 2px 7px; border-radius: 99px; background: #fef2f2; color: #dc2626; font-size: 10.5px; font-weight: 700; }
    .inv-min { width: 64px; height: 32px; padding: 0 8px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-background); color: var(--color-text-primary); font: inherit; text-align: right; }
    .inv-empty { padding: 28px !important; color: var(--color-text-secondary); text-align: center; }
    :host-context(.app-frame--dark) .inv-alert { border-color: #78350f; background: #1c1917; color: #fcd34d; }
    :host-context(.app-frame--dark) .inv-pill { background: #2a1215; color: #fca5a5; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryPage {
  readonly store = inject(InventoryStore);
  private readonly session = inject(SessionContext);
  readonly canEdit = computed(() => this.session.hasPermission('equipment.update'));
  readonly canCreate = computed(() => this.session.hasPermission('equipment.create'));
  readonly onlyLow = signal(false);
  readonly visible = computed(() => (this.onlyLow() ? this.store.lowStock() : this.store.rows()));

  setMinimum(row: StockRow, value: string): void {
    this.store.setMinimum(row.key, Number(value), row.label);
  }
}
