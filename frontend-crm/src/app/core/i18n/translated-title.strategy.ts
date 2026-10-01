import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { LanguageService } from './language.service';

/**
 * El título de la pestaña («Clientes | SpeedLink CRM») sigue el idioma elegido:
 * se traduce cada parte y se vuelve a poner al cambiar de idioma.
 */
@Injectable({ providedIn: 'root' })
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(LanguageService);
  private source = '';

  constructor() {
    super();
    effect(() => {
      this.i18n.language();
      this.apply();
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    if (title === undefined) return;
    this.source = title;
    this.apply();
  }

  private apply(): void {
    if (!this.source) return;
    this.title.setTitle(
      this.source
        .split(' | ')
        .map((part) => this.i18n.t(part))
        .join(' | '),
    );
  }
}
