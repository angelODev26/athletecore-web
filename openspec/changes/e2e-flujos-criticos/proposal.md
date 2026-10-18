# Propuesta: e2e-flujos-criticos

## Why

Los cinco dominios del contrato están integrados (auth, deportistas, entrenamientos,
chequeos, reportes) con 379 tests de componente en verde — pero **ningún test ejercita
los flujos reales contra la API**: la suite actual stubbea `fetch` y la verificación
visual de `integrar-reportes` se hizo con la API interceptada (desviación 8). La deuda
8.2 lo dejó explícito: el PDF auténtico, el `FAILED` con `errorMessage` del servidor,
los 204 reales y el CRUD de programaciones **jamás se verificaron contra el backend**.
El charter del agente `e2e-tester` nombra exactamente los cinco flujos que hay que
cubrir: login, alta de atleta, pase de lista, chequeo + comparación, y generación y
descarga de PDF.

## What Changes

- Nueva capability **`pruebas-e2e`**: infraestructura Playwright + los cinco flujos
  críticos contra el backend real en local.
- **Infraestructura**: `@playwright/test` (devDependency **aprobada por el usuario**)
  + Chromium, `playwright.config.ts` en la raíz (`baseURL` del dev server, `workers: 1`
  — backend local compartido), script `test:e2e` separado de la suite unit, y
  `global-setup` que **falla rápido con mensaje accionable** si el back no está en
  `:8080` (precondición documentada; sin timeouts misteriosos repartidos por test).
- **Fixture de sesión sin UI**: login por API (`POST /auth/login`) + siembra directa
  del `localStorage` con el envelope exacto de `zustand persist` — más un **test
  Vitest guard** que compara el builder del fixture contra el store real para que un
  cambio de shape del session-store rompa el guard, no los cinco specs.
- **Fábrica de datos por API con aislamiento**: cada spec crea sus propios datos
  (sufijos únicos `e2e-*`), es autocontenido y limpia en `afterEach` (best-effort).
  El flujo de comparación usa un **triple de referencia reservado para E2E**
  (`MARIPOSA / 999 / INFANTIL`) que no colisiona con datos reales.
- **Cinco specs** (`e2e/*.spec.ts`), cada uno contra la API real, consumiendo los
  `data-testid` vinculantes ya registrados (C10/C11 de los designs):
  1. `login.spec.ts` — credenciales válidas → dashboard; inválidas → "Credenciales
     inválidas"; visibilidad de nav por rol (USER sin Entrenamientos/Tabla nacional).
  2. `athlete-creation.spec.ts` — alta en dos pasos (wizard + perfil) → aparece en la
     lista.
  3. `attendance.spec.ts` — árbol plan→ciclo→sesión, pase de lista upsert, el estado
     persiste tras recargar.
  4. `checkup-comparison.spec.ts` — chequeo + tiempo `mm:ss.fff` + comparación contra
     el triple reservado, asertando el `*Formatted` del servidor en el DOM.
  5. `report-pdf.spec.ts` — generación INDIVIDUAL (spinner → `GENERATED` → detalle),
     descarga del PDF (magic number `%PDF` + filename del `Content-Disposition`) y el
     caso `FAILED` con `errorMessage` para un atleta sin datos.
- **Criterio de cierre del change**: la suite E2E verde contra el backend REAL. Si el
  back no es levantable en la sesión de implementación, se declara como desviación —
  como hizo `integrar-reportes` con 8.2 — pero el change no se archiva sin esa
  ejecución: es su razón de ser.

## Capabilities

### New Capabilities

- `pruebas-e2e`: infraestructura Playwright reproducible en local (config, fixtures de
  sesión, fábrica de datos aislada, fail-fast de precondiciones) y los cinco flujos
  críticos de negocio verificados end-to-end contra la API real.

### Modified Capabilities

- Ninguna. Los specs consumen testids y comportamiento ya existentes; no cambia
  ninguna UI. El único archivo nuevo en `src/` es un test Vitest (guard del shape de
  sesión) que no modifica el store.

## Impact

- **Dependencias**: `@playwright/test` como devDependency (aprobada) + binario de
  Chromium instalado fuera del repo (`npx playwright install chromium`).
- **Archivos nuevos**: `playwright.config.ts`, `e2e/` (global-setup, fixtures de
  sesión/API, 5 specs), `src/lib/auth/session-store.shape.test.ts` (guard, test-only).
- **package.json**: script `test:e2e`; `npm run test` NO lo incluye (suites separadas).
- **.gitignore**: `test-results/`, `playwright-report/`.
- **AGENTS.md**: sección Estructura gana `e2e/` y el script al finalizar.
- **Sin cambios** en `src/lib/api/`, componentes o páginas de ningún módulo; sin
  componentes shadcn nuevos; sin migración de los test-setup de módulo (379 tests en
  verde — consolidarlos es refactor sin cambio de comportamiento, fuera de alcance).
