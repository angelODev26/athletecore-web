/*
 * Polyfills mínimos de jsdom para los componentes Radix (Select/Dialog) usados en
 * tests: jsdom no implementa Pointer Capture ni scrollIntoView. Importar e invocar
 * en el `beforeAll` de cualquier test que monte Select.
 */
export function installRadixPointerPolyfills(): void {
  if (typeof HTMLElement === "undefined") {
    return;
  }
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
  HTMLElement.prototype.scrollIntoView ??= () => {};
}
