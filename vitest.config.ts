import { defineConfig } from "vitest/config";

/*
 * Suite unit (Vitest) — SIN relación con la suite E2E:
 * - Solo `src/**`: los specs de Playwright (e2e/*.spec.ts) corren con
 *   `npm run test:e2e` y exigen el backend real en :8080 (precondición del
 *   global-setup); la unit corre siempre sin back.
 * - El entorno es node por defecto; los archivos que necesitan DOM lo declaran
 *   con el comentario `// @vitest-environment jsdom`.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
