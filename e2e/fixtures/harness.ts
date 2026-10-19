import { expect, test as base, type Page } from "@playwright/test";

import { CleanupRegistry } from "./api";

/*
 * Test extendido de la suite (design.md C6 + correcciones B2/M1 del review).
 *
 * B2 — cleanup SIEMPRE: cada test recibe un `cleanup` (CleanupRegistry) fresco.
 * Su `run()` se ejecuta en el TEARDOWN del fixture, el equivalente idiomático de
 * `test.afterEach` en Playwright, garantizado tanto si el test pasa como si falla
 * a mitad (con `retries: 1`, cada intento limpia lo suyo) y ejecutado UNA sola
 * vez. La dependencia explícita en `page` fija el orden de teardown: los pasos
 * del registry usan `page.request`, así que el cleanup corre ANTES de que la
 * página se cierre (setup por dependencias: page → cleanup; teardown inverso).
 *
 * M1 — console sin errores (design C6): se escucha `page.on("console")` desde
 * ANTES de la primera navegación del test y el teardown aserta que no se
 * acumuló ningún mensaje de tipo "error". Único filtro documentado: el ruido de
 * red que el propio navegador registra ante respuestas HTTP de error
 * ("Failed to load resource: ...", p. ej. el 401 del login inválido o el 500
 * del reporte fallido) — NO proviene de la app ni de React y silenciarlo NO
 * silencia errores de React: cualquier `console.error` del código o del render
 * rompe el test.
 *
 * Los specs importan `test`/`expect` desde este archivo, no desde
 * "@playwright/test" directamente: ambos fixtures son `auto`, así que ningún
 * spec puede olvidárselos.
 */

/** Ruido de red del navegador ante respuestas HTTP de error (ver cabecera). */
const BROWSER_NETWORK_NOISE = /^Failed to load resource/;

/** Instala el collector de errores de consola y devuelve los acumulados. */
function collectConsoleErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !BROWSER_NETWORK_NOISE.test(message.text())) {
      errors.push(message.text());
    }
  });
  return () => [...errors];
}

export const test = base.extend<{ cleanup: CleanupRegistry }>({
  cleanup: [
    async ({ page }, use) => {
      const consoleErrors = collectConsoleErrors(page);
      const registry = new CleanupRegistry();
      await use(registry);
      await registry.run();
      expect(
        consoleErrors(),
        "consola del navegador sin errores de React/app durante el test (design C6)",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Page };
