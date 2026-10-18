import { installRadixPointerPolyfills } from "@/modules/checkups/test-setup";

/*
 * Polyfills de jsdom para los componentes Radix que monta el módulo reportes.
 *
 * Los `Select`/`Dialog` reutilizan los polyfills del proyecto
 * (`installRadixPointerPolyfills`: Pointer Capture y scrollIntoView). El `Switch` del
 * registry (`@radix-ui/react-use-size`) además mide su thumb con `ResizeObserver`, que
 * jsdom no implementa: sin él, cualquier test que abra el formulario de programaciones
 * revienta en el layout effect.
 *
 * Vive en el módulo (mismo criterio que `modules/checkups/test-setup.ts`) para no
 * repetirlo en cada archivo de test. Candidato a subir a la infraestructura compartida
 * de testing cuando exista.
 */
export function installReportSchedulePolyfills(): void {
  installRadixPointerPolyfills();

  globalThis.ResizeObserver ??= class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
