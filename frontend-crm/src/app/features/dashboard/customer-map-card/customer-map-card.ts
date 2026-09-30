import { CurrencyPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CRM_DATA } from '../../../core/data-access/crm-data';
import { ANTENNA_LOCATION } from '../../../core/data-access/mock-crm-data';
import { LanguageService } from '../../../core/i18n/language.service';
import { Customer, CustomerStatus } from '../../../core/models/customer';
import { googleMapsApiKey } from '../../../core/connections/connections.model';
import { loadGoogleMaps } from '../../../shared/google-maps-loader';

/** Cliente ya ubicado: sólo entran los que tienen coordenadas utilizables. */
export interface CustomerMapPoint {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly status: CustomerStatus;
  readonly statusLabel: string;
  readonly color: string;
  readonly plan: string;
  readonly speed: string;
  readonly community: string;
  readonly address: string;
  readonly technician: string;
  readonly balance: number;
  readonly latitude: number;
  readonly longitude: number;
  /** Posición 0-100 en la vista esquemática, cuando no hay mapa base. */
  readonly plotX: number;
  readonly plotY: number;
}

interface StatusMeta {
  readonly label: string;
  readonly color: string;
}

const STATUS_META: Readonly<Record<CustomerStatus, StatusMeta>> = {
  active: { label: 'Activo', color: '#16a34a' },
  pending: { label: 'Pendiente', color: '#d97706' },
  suspended: { label: 'Suspendido', color: '#dc2626' },
  inactive: { label: 'Inactivo', color: '#64748b' },
  cancelled: { label: 'Cancelado', color: '#475569' },
};

/**
 * Capa de pines HTML sobre el mapa.
 *
 * `OverlayView` sólo existe una vez cargada la API, así que la clase se declara
 * dentro de una fábrica perezosa: definirla en el módulo reventaría al importar.
 */
interface Pin {
  readonly position: google.maps.LatLng;
  readonly element: HTMLElement;
}

interface PinLayer extends google.maps.OverlayView {}
type PinLayerCtor = new (host: HTMLElement, pins: ReadonlyArray<Pin>) => PinLayer;

let pinLayerCtor: PinLayerCtor | undefined;

function pinLayerClass(): PinLayerCtor {
  if (pinLayerCtor) return pinLayerCtor;
  pinLayerCtor = class extends google.maps.OverlayView {
    constructor(
      private readonly host: HTMLElement,
      private readonly pins: ReadonlyArray<Pin>,
    ) {
      super();
    }
    override onAdd(): void {
      // `overlayMouseTarget` es el panel que recibe clics; en `floatPane` los
      // pines se verían pero no serían clicables.
      this.getPanes()?.overlayMouseTarget.appendChild(this.host);
    }
    override draw(): void {
      const projection = this.getProjection();
      if (!projection) return;
      for (const pin of this.pins) {
        const point = projection.fromLatLngToDivPixel(pin.position);
        if (!point) continue;
        // Se posiciona con left/top y no con transform: el CSS ya usa transform
        // para anclar la punta del pin a la coordenada.
        pin.element.style.left = `${point.x}px`;
        pin.element.style.top = `${point.y}px`;
      }
    }
    override onRemove(): void {
      this.host.remove();
    }
  };
  return pinLayerCtor;
}

@Component({
  selector: 'app-customer-map-card',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './customer-map-card.html',
  styleUrl: './customer-map-card.scss',
  // Los pines se crean fuera de la plantilla (los pinta Google Maps), así que
  // la encapsulación por atributo nunca los alcanzaría. Todo selector aquí
  // arranca con `.customer-map` para no filtrar estilos al resto del CRM.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card customer-map' },
})
export class CustomerMapCard implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') private mapContainer?: ElementRef<HTMLDivElement>;

  readonly i18n = inject(LanguageService);
  private readonly api = inject(CRM_DATA);

  readonly loading = signal(true);
  /** `map` = mapa real de Google; `plot` = vista esquemática sin mapa base. */
  readonly mode = signal<'map' | 'plot'>('plot');
  readonly message = signal('');
  readonly selected = signal<CustomerMapPoint | null>(null);
  readonly statusFilter = signal<CustomerStatus | 'all'>('all');

  private readonly customers = signal<ReadonlyArray<Customer>>([]);

  readonly points = computed<ReadonlyArray<CustomerMapPoint>>(() => {
    const located = this.customers()
      .map((customer) => ({ customer, coordinates: coordinatesOf(customer) }))
      .filter((entry) => entry.coordinates !== null);
    if (!located.length) return [];

    const latitudes = located.map((entry) => entry.coordinates![0]);
    const longitudes = located.map((entry) => entry.coordinates![1]);
    const bounds = {
      minLat: Math.min(...latitudes),
      maxLat: Math.max(...latitudes),
      minLng: Math.min(...longitudes),
      maxLng: Math.max(...longitudes),
    };

    return located.map(({ customer, coordinates }) => {
      const [latitude, longitude] = coordinates!;
      const meta = STATUS_META[customer.status] ?? STATUS_META.inactive;
      return {
        id: customer.id,
        name: customer.name,
        initials: customer.initials,
        status: customer.status,
        statusLabel: meta.label,
        color: meta.color,
        plan: customer.plan,
        speed: customer.speed,
        community: customer.community,
        address: customer.address,
        technician: customer.technician,
        balance: customer.currentBalance,
        latitude,
        longitude,
        plotX: project(longitude, bounds.minLng, bounds.maxLng),
        plotY: 100 - project(latitude, bounds.minLat, bounds.maxLat),
      };
    });
  });

  /** Puntos que se dibujan; el filtro por estado se aplica aquí. */
  readonly visiblePoints = computed(() => {
    const filter = this.statusFilter();
    const points = this.points();
    return filter === 'all' ? points : points.filter((point) => point.status === filter);
  });

  /** Leyenda: sólo los estados que existen hoy, con su conteo. */
  readonly legend = computed(() =>
    (Object.keys(STATUS_META) as CustomerStatus[])
      .map((status) => ({
        status,
        label: STATUS_META[status].label,
        color: STATUS_META[status].color,
        count: this.points().filter((point) => point.status === status).length,
      }))
      .filter((entry) => entry.count > 0),
  );

  readonly unlocatedCount = computed(() => this.customers().length - this.points().length);

  private map?: google.maps.Map;
  private layer?: PinLayer;
  private pinElements = new Map<string, HTMLElement>();
  private viewReady = false;
  private mapWatchdog?: ReturnType<typeof setTimeout>;

  constructor() {
    this.api.getCustomers().subscribe({
      next: (customers) => {
        this.customers.set(customers);
        this.loading.set(false);
        this.renderPins();
      },
      error: () => {
        this.loading.set(false);
        this.message.set('No pudimos cargar la ubicación de los clientes.');
      },
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.initializeMap();
  }

  ngOnDestroy(): void {
    clearTimeout(this.mapWatchdog);
    this.destroyLayer();
    this.map = undefined;
  }

  filterBy(status: CustomerStatus | 'all'): void {
    this.statusFilter.set(status);
    // Si el cliente abierto queda fuera del filtro, su ficha ya no corresponde.
    const selected = this.selected();
    if (selected && status !== 'all' && selected.status !== status) this.selected.set(null);
    this.renderPins();
  }

  select(point: CustomerMapPoint): void {
    this.selected.set(point);
    this.highlightPins();
    if (this.map) {
      this.map.panTo({ lat: point.latitude, lng: point.longitude });
    }
  }

  clearSelection(): void {
    this.selected.set(null);
    this.highlightPins();
  }

  googleMapsUrlFor(point: CustomerMapPoint): string {
    return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
  }

  private initializeMap(): void {
    const apiKey = googleMapsApiKey();
    if (!apiKey) {
      this.message.set('Vista esquemática: configura la API key de Google Maps para el mapa real.');
      this.renderPins();
      return;
    }
    loadGoogleMaps(apiKey)
      .then(() => this.createMap())
      .catch(() => {
        this.message.set('No se pudo cargar Google Maps. Se muestra la vista esquemática.');
        this.renderPins();
      });
  }

  private createMap(): void {
    const container = this.mapContainer?.nativeElement;
    if (!container || this.map) return;
    const map = new google.maps.Map(container, {
      // Centro inicial en la antena; `fitBounds` lo reajusta al encuadrar los
      // pines, pero evita el parpadeo en otra parte del país al abrir.
      center: { lat: ANTENNA_LOCATION.latitude, lng: ANTENNA_LOCATION.longitude },
      zoom: 13,
      // Mapa y satélite: en zona rural la vista aérea ayuda a ubicar el predio
      // del cliente, donde el callejero apenas trae calles.
      mapTypeControl: true,
      mapTypeControlOptions: {
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE],
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
      },
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
    });

    // Que la API cargue no garantiza que el mapa pinte: si la red bloquea o
    // frena los tiles, el contenedor se queda en blanco y nunca emite `idle`.
    // Sin este watchdog el widget se vería como un recuadro gris vacío.
    const watchdog = setTimeout(() => this.fallBackToPlot(), 12000);
    this.mapWatchdog = watchdog;
    // `idle` puede llegar después del watchdog en redes lentas: cuando pasa, se
    // recupera el mapa y se limpia el aviso de la vista esquemática.
    google.maps.event.addListenerOnce(map, 'idle', () => {
      clearTimeout(watchdog);
      this.mapWatchdog = undefined;
      this.map = map;
      this.mode.set('map');
      this.message.set('');
      this.renderPins();
    });
    map.addListener('click', () => this.clearSelection());
  }

  /** Deja el widget en la vista esquemática, que no depende de la red. */
  private fallBackToPlot(): void {
    this.mapWatchdog = undefined;
    this.destroyLayer();
    this.map = undefined;
    this.mode.set('plot');
    this.message.set(
      'El mapa de Google no respondió. Se muestra la posición relativa de cada cliente.',
    );
  }

  /** Reconstruye la capa de pines: se llama al cargar datos y al filtrar. */
  private renderPins(): void {
    if (!this.viewReady) return;
    if (this.mode() !== 'map' || !this.map) return;
    this.destroyLayer();

    const points = this.visiblePoints();
    if (!points.length) return;

    const host = document.createElement('div');
    host.className = 'customer-map__pins';
    const bounds = new google.maps.LatLngBounds();
    const pins: Pin[] = points.map((point) => {
      const position = new google.maps.LatLng(point.latitude, point.longitude);
      bounds.extend(position);
      const element = this.createPinElement(point);
      host.appendChild(element);
      this.pinElements.set(point.id, element);
      return { position, element };
    });

    const Layer = pinLayerClass();
    this.layer = new Layer(host, pins);
    this.layer.setMap(this.map);

    // Encuadre: `fitBounds` con un solo punto deja un zoom absurdo de calle.
    if (points.length === 1) {
      this.map.setCenter(bounds.getCenter());
      this.map.setZoom(14);
    } else {
      this.map.fitBounds(bounds, 64);
    }
    this.highlightPins();
  }

  private createPinElement(point: CustomerMapPoint): HTMLElement {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'customer-map__pin';
    pin.style.setProperty('--pin-color', point.color);
    pin.title = `${point.name} · ${point.community}`;
    pin.setAttribute('aria-label', `${point.name}, ${point.statusLabel}`);
    pin.innerHTML =
      '<span class="customer-map__avatar"></span><span class="customer-map__pin-name"></span>';
    // `textContent` y no interpolación: el nombre del cliente es dato de
    // captura y no debe llegar al DOM como HTML.
    pin.querySelector('.customer-map__avatar')!.textContent = point.initials;
    pin.querySelector('.customer-map__pin-name')!.textContent = point.name;
    pin.addEventListener('click', (event) => {
      event.stopPropagation();
      this.select(point);
    });
    return pin;
  }

  /** Marca el pin abierto para que se distinga del resto. */
  private highlightPins(): void {
    const selectedId = this.selected()?.id;
    for (const [id, element] of this.pinElements) {
      element.classList.toggle('is-selected', id === selectedId);
    }
  }

  private destroyLayer(): void {
    this.layer?.setMap(null);
    this.layer = undefined;
    this.pinElements.clear();
  }
}

/** Coordenadas del cliente: campos numéricos y, si faltan, el texto de GPS. */
function coordinatesOf(customer: Customer): [number, number] | null {
  const latitude = Number(customer.latitude);
  const longitude = Number(customer.longitude);
  if (isValid(latitude, longitude)) return [latitude, longitude];
  const [parsedLat, parsedLng] = String(customer.gpsLocation ?? '')
    .split(',')
    .map((part) => Number(part.trim()));
  return isValid(parsedLat, parsedLng) ? [parsedLat, parsedLng] : null;
}

function isValid(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    // (0, 0) es el Golfo de Guinea: en la práctica significa "sin capturar".
    (latitude !== 0 || longitude !== 0)
  );
}

/**
 * Proyección lineal a 0-100 con 12% de margen, para la vista esquemática.
 * Si todos los puntos coinciden, el rango es cero y se centran.
 */
function project(value: number, min: number, max: number): number {
  const range = max - min;
  if (range < 1e-9) return 50;
  return 12 + ((value - min) / range) * 76;
}
