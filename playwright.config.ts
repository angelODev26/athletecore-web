import { defineConfig } from "@playwright/test";

/*
 * Configuración E2E (design.md C1 de e2e-flujos-criticos). La suite corre contra
 * el backend REAL en :8080 — el `global-setup` aborta con mensaje accionable si no
 * está arriba. `workers: 1` + `fullyParallel: false`: el backend local es compartido
 * y la ejecución secuencial elimina interferencias entre specs.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  trace: "retain-on-failure",
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
