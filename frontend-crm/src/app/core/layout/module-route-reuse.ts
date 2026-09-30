import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/**
 * Las páginas de detalle y de módulo leen su registro (o su módulo) al
 * construirse. Si sólo cambian los parámetros —de /equipment/EQ-1001 a
 * /equipment/EQ-1000, o entre dos módulos personalizados— Angular
 * reutilizaría la página y seguiría mostrando el anterior: aquí se fuerza a
 * crearla de nuevo cuando cambian los parámetros de la ruta.
 */
export class ModuleRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    if (!super.shouldReuseRoute(future, current)) return false;
    const params = (snapshot: ActivatedRouteSnapshot) => JSON.stringify(snapshot.params);
    return params(future) === params(current);
  }
}
