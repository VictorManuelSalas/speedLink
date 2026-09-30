import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { googleMapsApiKey } from '../core/connections/connections.model';
import { loadGoogleMaps } from './google-maps-loader';

@Component({
  selector: 'app-gps-location-picker',
  templateUrl: './gps-location-picker.html',
  styleUrl: './gps-location-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GpsLocationPicker implements OnDestroy {
  @ViewChild('mapContainer') private mapContainer?: ElementRef<HTMLDivElement>;

  private readonly sanitizer = inject(DomSanitizer);

  readonly value = input.required<string>();
  readonly locationSaved = output<string>();
  readonly opened = signal(false);
  readonly latitude = signal(19.432608);
  readonly longitude = signal(-99.133209);
  readonly locating = signal(false);
  readonly mapLoading = signal(false);
  readonly interactiveMapReady = signal(false);
  readonly message = signal('');
  readonly validCoordinates = computed(
    () =>
      Number.isFinite(this.latitude()) &&
      Number.isFinite(this.longitude()) &&
      Math.abs(this.latitude()) <= 90 &&
      Math.abs(this.longitude()) <= 180,
  );
  readonly googleMapsUrl = computed(() => {
    const [latitude, longitude] = this.parseCoordinates(this.value());
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  });
  readonly googleMapsEmbedUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://maps.google.com/maps?q=${this.latitude()},${this.longitude()}&z=17&output=embed`,
    ),
  );

  private map?: google.maps.Map;
  private marker?: google.maps.Marker;

  openPicker(): void {
    const [latitude, longitude] = this.parseCoordinates(this.value());
    this.latitude.set(latitude);
    this.longitude.set(longitude);
    this.message.set('');
    this.opened.set(true);
    setTimeout(() => this.initializeGoogleMap());
  }

  close(): void {
    this.destroyMap();
    this.opened.set(false);
    this.locating.set(false);
  }

  save(): void {
    if (!this.validCoordinates()) return;
    this.locationSaved.emit(`${this.latitude().toFixed(6)}, ${this.longitude().toFixed(6)}`);
    this.close();
  }

  setManualCoordinates(latitudeValue: string, longitudeValue: string): void {
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    this.setCoordinates(latitude, longitude, true);
  }

  useDeviceLocation(): void {
    if (!navigator.geolocation) {
      this.message.set('Este navegador no permite detectar la ubicación.');
      return;
    }
    this.locating.set(true);
    this.message.set('Solicitando tu ubicación al navegador…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.locating.set(false);
        this.message.set('Ubicación detectada. Puedes ajustarla antes de guardar.');
        this.setCoordinates(coords.latitude, coords.longitude, true);
      },
      () => {
        this.locating.set(false);
        this.message.set(
          'No fue posible obtener tu ubicación. Revisa el permiso del navegador o captura las coordenadas.',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.opened()) this.close();
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  private initializeGoogleMap(): void {
    const apiKey = googleMapsApiKey();
    if (!apiKey) {
      this.message.set(
        'Google Maps está activo con pin y controles. Configura la API key para seleccionar también con clic o arrastre.',
      );
      return;
    }
    this.mapLoading.set(true);
    loadGoogleMaps(apiKey)
      .then(() => {
        this.interactiveMapReady.set(true);
        setTimeout(() => this.createInteractiveMap());
      })
      .catch(() => {
        this.mapLoading.set(false);
        this.message.set(
          'No se pudo cargar la API interactiva. Se mantiene la vista de Google Maps.',
        );
      });
  }

  private createInteractiveMap(): void {
    const container = this.mapContainer?.nativeElement;
    if (!container || this.map) return;
    const position = { lat: this.latitude(), lng: this.longitude() };
    this.map = new google.maps.Map(container, {
      center: position,
      zoom: 17,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      mapTypeControl: true,
      mapTypeControlOptions: {
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE],
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      },
      zoomControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      clickableIcons: false,
    });
    this.marker = new google.maps.Marker({
      position,
      map: this.map,
      draggable: true,
      title: 'Ubicación del cliente',
      animation: google.maps.Animation.DROP,
    });
    this.map.addListener('click', (event: google.maps.MapMouseEvent) => {
      const location = event.latLng;
      if (location) this.setCoordinates(location.lat(), location.lng());
    });
    this.marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
      const location = event.latLng;
      if (location) this.setCoordinates(location.lat(), location.lng());
    });
    this.mapLoading.set(false);
    this.message.set('Haz clic en el mapa o arrastra el pin para ajustar la ubicación.');
  }

  private setCoordinates(latitude: number, longitude: number, center = false): void {
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    this.latitude.set(Number(latitude.toFixed(6)));
    this.longitude.set(Number(longitude.toFixed(6)));
    const position = { lat: latitude, lng: longitude };
    this.marker?.setPosition(position);
    if (center && this.map) {
      this.map.panTo(position);
      if ((this.map.getZoom() ?? 0) < 17) this.map.setZoom(17);
    }
  }

  private parseCoordinates(value: string): [number, number] {
    const [latitude, longitude] = value.split(',').map((part) => Number(part.trim()));
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [latitude, longitude];
    return [19.432608, -99.133209];
  }

  private destroyMap(): void {
    if (this.marker) google.maps.event.clearInstanceListeners(this.marker);
    if (this.map) google.maps.event.clearInstanceListeners(this.map);
    this.marker?.setMap(null);
    this.map = undefined;
    this.marker = undefined;
    this.interactiveMapReady.set(false);
    this.mapLoading.set(false);
  }
}
