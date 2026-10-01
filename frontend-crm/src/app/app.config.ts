import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { RouteReuseStrategy, TitleStrategy, provideRouter } from '@angular/router';
import { ModuleRouteReuseStrategy } from './core/layout/module-route-reuse';
import { TranslatedTitleStrategy } from './core/i18n/translated-title.strategy';

import { routes } from './app.routes';
import { provideMockDataAccess } from './core/data-access/mock-crm-data';
import { OperationalDataService } from './core/data-access/services/operational-data.service';
import { DataInitializerService } from './core/data-access/services/data-initializer.service';
import { OrganizationStore } from './core/organization/organization-store';
import { ModulesStore } from './core/modules/modules-store';
import { ConnectionsStore } from './core/connections/connections-store';
import { IntegrationsStore } from './core/integrations/integrations.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: ModuleRouteReuseStrategy },
    { provide: TitleStrategy, useExisting: TranslatedTitleStrategy },
    provideHttpClient(withFetch()),
    ...provideMockDataAccess(),
    // Data Access Layer services
    OperationalDataService,
    DataInitializerService,
    // Carga el perfil guardado antes de que un documento o plantilla lo lea.
    provideAppInitializer(() => void inject(OrganizationStore)),
    // Igual con los módulos: el menú y los permisos deben ver los personalizados desde el inicio.
    provideAppInitializer(() => void inject(ModulesStore)),
    // La llave de mapas y la lada de WhatsApp se leen desde muchas pantallas.
    provideAppInitializer(() => void inject(ConnectionsStore)),
    // Escucha los eventos del CRM desde el arranque para preparar las entregas de webhooks.
    provideAppInitializer(() => void inject(IntegrationsStore)),
  ],
};
