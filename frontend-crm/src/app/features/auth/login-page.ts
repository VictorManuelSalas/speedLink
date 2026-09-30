import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionContext } from '../../core/auth/session-context';
import { LanguageService } from '../../core/i18n/language.service';
import { ApiService } from '../../shared/services/api.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly session = inject(SessionContext);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly apiService = inject(ApiService);
  readonly i18n = inject(LanguageService);
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly error = signal('');
  readonly supportEmail = signal('soporte@speedlink.mx');
  email = '';
  password = '';
  remember = true;

  constructor() {
    this.loadContactInfo();
  }

  private loadContactInfo(): void {
    this.apiService.getContactInfo().subscribe((response: any) => {
      if (response?.data?.contact?.email) {
        this.supportEmail.set(response.data.contact.email);
      }
    });
  }

  useDemoCredentials(): void {
    this.email = 'andrea.torres@speedlink.mx';
    this.password = 'SpeedLink2026!';
    this.error.set('');
  }

  clearError(): void {
    this.error.set('');
  }

  submit(): void {
    if (this.loading() || !this.email || this.password.length < 8) return;
    this.loading.set(true);
    this.error.set('');
    window.setTimeout(async () => {
      const result = await this.session.login(this.email, this.password, this.remember);
      this.loading.set(false);
      if (!result.success) {
        this.error.set(result.message ?? 'No se pudo iniciar sesión. Inténtalo de nuevo.');
        return;
      }
      // Sin returnUrl se entra a la primera pantalla que el rol permite ver:
      // no todos los roles tienen acceso al dashboard.
      const requested = this.route.snapshot.queryParamMap.get('returnUrl');
      const returnUrl =
        requested?.startsWith('/') && !requested.startsWith('//')
          ? requested
          : this.session.homeRoute();
      void this.router.navigateByUrl(returnUrl, { replaceUrl: true });
    }, 450);
  }
}
