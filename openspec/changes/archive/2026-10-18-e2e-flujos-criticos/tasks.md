# Tasks: e2e-flujos-criticos

> Implementación completa de la infraestructura E2E y los cinco flujos críticos
> según `design.md` (decisiones C1–C7 vinculantes) y `specs/pruebas-e2e/spec.md`.
> Rama: `feature/e2e-flujos-criticos`. Trabajar solo dentro del alcance; desviaciones
> se anotan abajo. Verificación obligatoria al final: `npm run test`, `npm run build`,
> `npm run design:check` en verde Y **`npm run test:e2e` en verde contra el backend
> real** (el entregable del change). Si el back no es levantable en la sesión,
> declararlo como desviación — el change NO se archiva sin esa ejecución.
>
> **Propietario por fase**: todas las fases → `e2e-tester` (es su charter); el guard
> de C3 es un test nuevo junto al store de auth — si exigiera MODIFICAR
> `session-store.ts`, escalar a `auth-guardian`, no editarlo por cuenta propia.
> Cierre → `quality-reviewer` vía `/review` (lo orquesta el revisor del change).

## Fase 0 — Infraestructura (C1, C2)

- [x] 0.1 Crear la rama `feature/e2e-flujos-criticos` (el pre-commit hook rechaza
      commits directos a `main`).
- [x] 0.2 Instalar `@playwright/test` (devDependency, aprobada por el usuario) y
      ejecutar `npx playwright install chromium`.
- [x] 0.3 `playwright.config.ts` en la raíz según C1: `testDir: "e2e"`, baseURL
      :5173, project chromium único, `workers: 1`, `fullyParallel: false`,
      `retries: 1`, `trace: "retain-on-failure"`, reporter list+html,
      `webServer` con `reuseExistingServer: true`.
- [x] 0.4 Script `"test:e2e": "playwright test"` en `package.json` (fuera de
      `npm run test`); añadir `test-results/` y `playwright-report/` al `.gitignore`.
- [x] 0.5 `e2e/global-setup.ts` (C2): health-check de
      `http://localhost:8080/api/v1/actuator/health` + sanity de login
      `admin.demo/secret123`; si falla, abortar la suite con mensaje accionable
      que incluya los comandos para levantar Postgres (docker
      `athletecore-postgres`) y la API (`SPRING_PROFILES_ACTIVE=local
      ./mvnw spring-boot:run` en `~/athletecore-api`).
- [x] 0.6 Smoke mínimo (`e2e/_smoke.spec.ts`): con el back arriba, abrir `/login`
      sin sesión y ver `login-page`; borra este archivo o conviértelo en helper
      cuando F1 lo cubra (decisión del implementador, documentada).

## Fase 1 — Fixtures (C3, C4)

- [x] 1.1 `e2e/fixtures/session.ts`: `buildSessionStoragePayload` PURO (sin
      imports de Playwright) que replica el envelope exacto de `zustand persist`
      para `athletecore.session` (leer `src/lib/auth/session-store.ts` como fuente
      de verdad: clave, `partialize`, `version`), y `loginAs(page, role)` con
      login por API + `expiresAt` derivado del `exp` del JWT + siembra de
      `localStorage` + `goto("/")` + assert del shell.
- [x] 1.2 `src/lib/auth/session-store.shape.test.ts` (guard anti-drift, Vitest):
      montar el store real en jsdom, `setSession` con un token de prueba, leer el
      JSON persistido y compararlo estructuralmente con
      `buildSessionStoragePayload` — mensaje de fallo que apunte al fixture E2E.
      Sin modificar `session-store.ts` (si lo exigiera, escalar a
      `auth-guardian`).
- [x] 1.3 `e2e/fixtures/api.ts` (C4): fábricas autenticadas (`createAthlete`,
      `createPlanWithCycleAndSession`, `createCheckup`, `addCheckupTime`,
      `ensureReferenceTriple`, `softDelete*`), sufijos únicos
      `e2e-<spec>-<ts>`, y helper `openApp(page, role)` (login + shell).
- [x] 1.4 `ensureReferenceTriple` para la combinación reservada
      (`MARIPOSA / 999 / INFANTIL`): crea las 3 posiciones tolerando 409 de
      duplicado; cleanup en `afterEach` que las borre (soft delete, 204).

## Fase 2 — Flujo 1: login y visibilidad por rol (C5 F1)

- [x] 2.1 `e2e/login.spec.ts`: (a) login real de `admin.demo` desde el formulario
      → dashboard visible; (b) credenciales inválidas → `login-error` con
      "Credenciales inválidas" (mismo mensaje para usuario inexistente y password
      errónea — anti-enumeración); (c) login como `demo.user` → nav SIN
      "Entrenamientos" ni "Tabla nacional", y login como ADMIN → con ambos.

## Fase 3 — Flujo 2: alta de deportista (C5 F2)

- [x] 3.1 `e2e/athlete-creation.spec.ts`: ADMIN → `/athletes` →
      `athlete-create-link` → wizard paso 1 con los obligatorios del contrato 04
      (usar los testids de `athlete-form.tsx`) → `athlete-step2-continue` →
      `athlete-created-notice` → ficha con el nombre único → visible en
      `athletes-row`. Cleanup del atleta en `afterEach`.

## Fase 4 — Flujo 3: pase de lista persistente (C5 F3)

- [x] 4.1 `e2e/attendance.spec.ts`: ADMIN → plan+mesociclo+microciclo+sesión VÍA
      API (`createPlanWithCycleAndSession`) → `/training/sessions/:id` →
      `attendance-grid` → marcar PRESENTE a un atleta del spec y AUSENTE a otro
      → **recargar** → ambos estados persisten. Cleanup de sesión/plan y atletas.

## Fase 5 — Flujo 4: chequeo + comparación (C5 F4)

- [x] 5.1 `e2e/checkup-comparison.spec.ts`: ADMIN → atleta propio →
      `/athletes/:id/chequeos` → `checkup-new-button` →
      `checkup-form-year/month/category` → visible en `checkups-list` → detalle →
      `time-form-dialog` (MARIPOSA / 999 / `mm:ss.fff` en `time-input`) →
      `comparison-button` → `comparison-panel` con las 3 posiciones del triple.
- [x] 5.2 Aserción de regla dura: traer el detalle del chequeo y el comparison
      por API y asertar el `timeFormatted` / `absoluteDiffFormatted` del servidor
      EXACTOS en el DOM. Cleanup de chequeo, atleta y triple de referencia.

## Fase 6 — Flujo 5: generación y descarga de PDF (C5 F5)

- [x] 6.1 `e2e/report-pdf.spec.ts` — caso GENERATED: atleta con chequeo+tiempo
      creado por API → `/reports` → `report-new-button` → INDIVIDUAL + atleta +
      `report-title-input` único → `report-submit` en loading → detalle con badge
      Generado → `report-download-button` → `waitForEvent("download")` → filename
      del `Content-Disposition` (fallback `reporte-{id}.pdf`) → archivo con magic
      number `%PDF` y tamaño > 0. Cleanup del reporte y datos.
- [x] 6.2 Caso FAILED: atleta SIN datos → generar → dialog permanece con
      `report-generation-error` mostrando el `errorMessage` del servidor.
      Cleanup. *(Reescrito por desviación: ver Desviaciones.)*

## Fase 7 — Cierre (C7)

- [x] 7.1 Suite E2E completa (`npm run test:e2e`) en VERDE contra el backend real
      levantado en local (los 5 specs, workers=1). Documentar en este archivo el
      resultado y el entorno (fecha, versión del back).
- [x] 7.2 `npm run test`, `npm run build` y `npm run design:check` en verde (el
      guard Vitest de 1.2 forma parte de la suite).
- [x] 7.3 Actualizar `AGENTS.md` (sección Estructura): `e2e/` (config + fixtures +
      5 specs) y script `test:e2e` con su precondición de backend real.
- [x] 7.4 Anotar aquí cualquier desviación del diseño antes de pedir `/review`.

## Desviaciones

- 0.6: el smoke `e2e/_smoke.spec.ts` se borró cuando `login.spec.ts` (F1) pasó a
  cubrir el mismo camino ("borrar" opción elegida del diseño; validado antes en
  verde), junto con el spec temporal `_factories-check.spec.ts` que validó las
  fábricas de C4 contra el backend real.
- 0.5: el actuator/health del perfil local responde **401 sin JWT** (no 200 como
  asumía C2). El global-setup trata cualquier respuesta HTTP (200 o 401) como
  "servidor arriba" y deja la validación real al sanity de login — misma intención
  fail-fast, ajustada al comportamiento observado del backend.
- `loginAs` llama a `http://localhost:8080/api/v1/auth/login` por URL absoluta (la
  app usa `API_BASE_URL` absoluto; el dev server :5173 no proxifica /api).
- 6.2 REESCRITO (decisión del usuario, "gana el código"): el `201 FAILED` del
  diseño NO es producible contra el backend real. (a) Un atleta SIN datos genera
  `GENERATED` normalmente (PDF con secciones vacías) — el ejemplo del contrato 07
  ("p.ej. atleta sin datos") no se cumple. (b) El fallo de ensamblado determinista
  (tiempo sin triple de referencia → `DuplicateResourceException` 409 en
  `getProjectionsForAthlete`) no alcanza el catch de `ReportGenerationService`:
  la excepción cruza proxies `@Transactional` anidados que marcan rollback-only y
  el commit lanza `UnexpectedRollbackException` → **500**. El spec aserta el
  comportamiento real: dialog permanece con `report-form-error` y el mensaje
  seguro (`SAFE_FALLBACK_VALIDATION`), sin filtrar el texto crudo. El camino
  `report-generation-error` (201 FAILED) queda cubierto por los tests unit del
  módulo. **Prerrequisito registrado**: `ReportGenerationService.generateReport`
  debería REQUIRES_NEW (o no transaccional) en el ensamblado para que el estado
  FAILED sea alcanzable — deuda del back, **doc 09 T11** (registrada en la
  corrección del review; antes solo se prometía sin existir).
- 5.x: `athlete-detail-page` no tiene testid de contenedor; la aserción de la
  ficha usa `page.getByRole("main")` + el nombre único (testids solo donde existen).
- Infra (nota para `design-system-keeper`): `scripts/check-hardcoded-styles.mjs`
  escanea `test-results/` y `playwright-report/` si existen (artefactos generados
  del HTML report de Playwright, ya gitignored) y falla con sus CSS embebidos.
  En esta sesión se limpiaron con `rm -rf` antes de `design:check`. Solicitud
  vía skill design-tokens: excluir esos dos directorios en los globs del checker
  (misma deuda documentada de exclusión que `design/generated/tokens.css`).
- Infra: se añadió `vitest.config.ts` (include `src/**/*.{test,spec}.{ts,tsx}` +
  alias `@`) para que `npm run test` NUNCA recoja `e2e/*.spec.ts` (el include por
  defecto de Vitest los habría recogido; los 40 archivos/382 tests previos quedan
  idénticos). Decisión mecánica prevista por el diseño (import del fixture E2E
  desde el guard: relativo `../../../e2e/fixtures/session.ts` + extensión `.ts`,
  permitida por `allowImportingTsExtensions`).

### Correcciones del review de calidad (cierre del change)

El review post-implementación dictaminó NO APTO (3 bloqueantes + 4 menores);
todo corregido en el mismo commit de cierre:

- **B1 (crítico)**: `fetchReservedReferenceIds` (e2e/fixtures/api.ts) pedía
  `GET /national-reference-times?style=…&distance=…&category=…`, pero el back
  ignora los query params y devuelve TODAS las filas activas — el cleanup
  soft-deletaba la tabla nacional COMPLETA en cada corrida (la del 17:43 vació
  el triple real LIBRE/100/MAYOR). Fix: GET sin params + filtrado client-side
  por la combinación reservada (igual que `useNationalReferenceTimes` +
  agrupación client-side de la matriz) y solo entonces mapear ids. Validado
  end-to-end: tras la corrida del cierre, las 3 filas del usuario siguen activas.
- **B2 (alto)**: `cleanup.run()` estaba en la última línea del cuerpo del test —
  un fallo a mitad dejaba todo activo en el back compartido. Fix: fixture
  `cleanup` auto (e2e/fixtures/harness.ts) cuyo teardown corre SIEMPRE (éxito,
  fallo o timeout), una vez por intento; dependencia explícita en `page` para
  que el cleanup corra antes del cierre de la página (los pasos usan
  `page.request`). Además, los registros ahora ocurren EN CUANTO existe el id
  (wizard → URL de la ficha; chequeo → testid; reporte → URL del detalle), no al
  final del test.
- **B3 (medio)**: el "prerrequisito registrado" del ensamblado de reportes solo
  estaba prometido. Registrado como **T11** en
  `docs/backend-contract/09-decisiones-deuda-y-pendientes.md` (formato T9/T10).
- **M1 (design C6)**: aserción global de consola implementada en el harness
  (`page.on("console")` desde antes de la primera navegación + aserción en el
  teardown de 0 mensajes `error`). Único filtro documentado: ruido de red del
  navegador ("Failed to load resource: …", p. ej. el 401 del login inválido o el
  500 del reporte fallido) — los `console.error` de React/app rompen el test.
- **M2**: comentario stale del caso FAILED en `report-pdf.spec.ts` actualizado
  al comportamiento real (`report-form-error` + mensaje seguro).
- **M3**: filename discriminativo (`reporte-individual-{id}.pdf` del
  Content-Disposition o el fallback `reporte-{id}.pdf` — ambos con el id) y
  eliminado el no-op `writeFile(readFile(...))`; el binario se lee directo tras
  `saveAs`.
- **M4**: rama 204 muerta de `postJson` eliminada (ningún POST del contrato
  devuelve 204) y la cita de procedencia del seed corregida en
  `e2e/fixtures/session.ts` (era "doc 02 §6"; la real es la precondición 3 de
  `archive/2026-10-12-integrar-athletes/tasks.md`).

### Restauración de la tabla nacional (aprobada por el usuario)

La corrida del 17:43 soft-deletó todas las filas activas del back local
(`national_reference_times` — plural, columna `deleted_at`). Inspección previa:
32 filas, 0 activas; 2 soft-deletes previos del usuario (ids 1 y 3,
2026-10-13 — NO restaurados) y 30 de la ventana E2E del 2026-10-18 (el triple
real LIBRE/100/MAYOR ids 2/4/5 + 27 artefactos MARIPOSA/999/INFANTIL).

**Restauradas 3 filas** (ids 2, 4, 5 — el triple real del usuario) con el
criterio `deleted_at >= '2026-10-18' AND NOT (MARIPOSA/999/INFANTIL)`: revivir
los 27 artefactos 999 violaría el unique index parcial
`uq_national_reference_times_style_distance_category_position` (8 triples
duplicados) y la suite los recrea por sí misma (`ensureReferenceTriple`
tolera 409 y el cleanup fijo los borra). El UPDATE se ejecutó por JDBC directo
(sin `psql`/docker CLI en el entorno; credenciales del perfil `local`:
`athletecore_user`/`athletecore_pass`, db `athletecore`). Verificación
post-UPDATE por API: `GET /national-reference-times` devolvió las 3 filas.
Los 27 artefactos 999 quedan soft-deleted (invisibles para la UI).

### Resultado de la ejecución E2E (7.1, corrida de cierre tras las correcciones)
- **Fecha**: 2026-10-18, 20:29 (UTC-5). **Backend**: `~/athletecore-api` commit
  `70fc10d` (2026-10-08), perfil `local`, PostgreSQL en :5432 (db `athletecore`,
  usuario `athletecore_user`).
- **Resultado**: `npm run test:e2e` → **9/9 passed** (exit 0) en 2.6m con
  workers=1, sin reintentos: login (4), alta de deportista (1), pase de lista
  (1), chequeo + comparación (1), PDF generación + descarga (2). El dev server
  lo levantó el `webServer` de Playwright (no había uno previo).
- **Validación del fix B1**: tras la corrida las 3 filas restauradas del usuario
  siguen activas y los 6 artefactos 999 creados por la suite (2 triples) quedaron
  soft-deleted por el cleanup corregido.
- Nota de entorno: el `actuator/health` exige JWT (401 anónimo); el sanity real
  es el `POST /auth/login` del global-setup (ver desviación 0.5).
- Verificación de cierre: `npm run test` → 40 archivos / **382 tests passed**;
  `npm run build` OK; `npm run design:check` OK (52 pares de contraste, 133
  archivos sin violaciones). `test-results/` y `playwright-report/` se
  limpiaron antes del design:check (desviación conocida del checker).
