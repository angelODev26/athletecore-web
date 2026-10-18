# Diseño: e2e-flujos-criticos

## Contexto

Estado: los cinco dominios del contrato están integrados; la suite Vitest (39
archivos, 379 tests) cubre validaciones y estados con `fetch` stubbeado. La
verificación visual de los últimos changes se hizo con la API mockeada porque el
back local no era levantable en esas sesiones (desviación 8 de `integrar-reportes`).
El charter de `e2e-tester` fija el alcance: **login, alta de atleta, pase de lista,
chequeo + comparación, generación y descarga de PDF** contra el backend real, más la
infraestructura (config Playwright, utilidades compartidas, convención
`data-testid` — esta última ya existe y es vinculante en los designs C10/C11).

Fuentes:
- Contrato: `docs/backend-contract/00`–`09` (+ credenciales locales documentadas en
  los designs previos: `admin.demo/secret123` ADMIN, `demo.user/secret123` USER).
- Shape de sesión: `src/lib/auth/session-store.ts` (fuente de verdad del envelope).
- Testids: los registrados en los `design.md` archivados (C10/C11) — verificados en
  el código al planificar este change.
- Lección de entorno (desviación 3 de `integrar-checkups`): el back local es
  **compartido** entre sesiones y puede ser mutado concurrentemente → los specs no
  pueden depender de conteos globales ni de datos preexistentes.

Dependencia nueva aprobada por el usuario: `@playwright/test` (devDependency).

## Goals / Non-Goals

**Goals:**

- Infra Playwright reproducible localmente con fallo rápido y accionable si falta el
  backend (sin timeouts difusos por test).
- Los cinco flujos críticos verificados contra la API real, cada spec autocontenido.
- Datos de prueba aislados y con cleanup; la tabla nacional no queda contaminada.
- Un guard que detecte drift del shape de sesión ANTES de que floten los cinco specs.

**Non-Goals:**

- **CI**: no hay pipeline en el repo; ejecución local únicamente (cambio futuro).
- **Regresión visual** (`DESIGN.md` §9 la deja pendiente de decisión de stack).
- Cobertura exhaustiva de casos borde: eso es territorio de los 379 tests de
  componente. E2E = caminos felices críticos + los negativos del login.
- **Refactor de los test-setup de módulos** (`training/checkups/reports`): están en
  verde y consolidarlos no cambia comportamiento. "Utilidades compartidas" se
  interpreta aquí en su mínima expresión útil: el builder del payload de sesión
  compartido entre el guard Vitest y el fixture E2E (C3).
- Corregir deuda del back (T1–T9 siguen registradas en el doc 09).

## Decisiones (vinculantes para la implementación)

### C1. Herramienta y configuración

- `@playwright/test` (devDependency) + `npx playwright install chromium` (único
  browser; el proyecto no define soporte multi-navegador).
- `playwright.config.ts` en la raíz:
  - `testDir: "e2e"`, `timeout: 30_000`, `expect: { timeout: 7_000 }`.
  - `fullyParallel: false` y **`workers: 1`**: el backend local es compartido y la
    ejecución secuencial elimina interferencias entre specs (y con otras sesiones).
  - `retries: 1` (local; con `trace: "retain-on-failure"` para diagnosticar el
    reintento).
  - `reporter: [["list"], ["html", { open: "never" }]]`.
  - `use: { baseURL: "http://localhost:5173", viewport: 1280x800 }`.
  - `webServer: { command: "npm run dev", url: "http://localhost:5173",
    reuseExistingServer: true }` — no duplicar dev server si ya hay uno.
- Script `test:e2e` en `package.json`. **`npm run test` (Vitest) no lo incluye**:
  la suite unit corre siempre sin back; la E2E exige precondiciones.
- `.gitignore`: `test-results/` y `playwright-report/`.

### C2. Precondición del backend: fail-fast accionable

`e2e/global-setup.ts` (ejecutado por Playwright antes de TODA la suite):

1. `GET http://localhost:8080/api/v1/actuator/health` (solo perfil local, doc 08 §6).
   Si responde 200 → continuar.
2. Si falla → **abortar la suite entera** con un mensaje que diga exactamente cómo
   levantar el entorno (comandos de los designs previos: docker `athletecore-postgres`
   arriba + `SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run` en
   `~/athletecore-api`), sin lanzar un solo test que moriría en timeouts difusos.
3. Sanity extra opcional: `POST /auth/login` con `admin.demo/secret123` — valida que
   el perfil local tiene el seed de usuarios demo (si falta, el mensaje lo dice).

### C3. Fixture de sesión sin UI + guard anti-drift

- **Builder puro** `e2e/fixtures/session.ts`:

  ```ts
  // Puro: sin imports de Playwright — importable desde Vitest.
  export function buildSessionStoragePayload(token: string, expiresAtMs: number) {
    // Envelope EXACTO de zustand persist para "athletecore.session"
    // (fuente de verdad: src/lib/auth/session-store.ts — partialize + version 0)
    return { state: { tokens: { access: token }, expiresAt: expiresAtMs }, version: 0 };
  }
  ```

- `loginAs(page, role)`: `POST /auth/login` con `request` de Playwright (fuera del
  navegador, rápido) → `expiresAt` derivado del `exp` del JWT (replicando la lógica
  de `setSession`, no inventado) → `localStorage.setItem("athletecore.session",
  JSON.stringify(buildSessionStoragePayload(...)))` → `page.goto("/")` → assert del
  shell montado. Roles: `ADMIN` (admin.demo) y `USER` (demo.user).
- **Guard anti-drift** `src/lib/auth/session-store.shape.test.ts` (Vitest, junto al
  store SIN tocarlo): monta el store real con `setSession(tokenFalso, …)` (jsdom +
  localStorage), lee el JSON persistido y lo compara estructuralmente con
  `buildSessionStoragePayload(tokenFalso, …)` de `e2e/fixtures/session.ts`. Si
  alguien cambia el store (nombre de clave, partialize, version), este test rompe
  primero con un mensaje que apunte al fixture E2E — no los cinco specs.
  - Si implementar el guard exigiera MODIFICAR `session-store.ts`, escalar a
    `auth-guardian` (dueño del módulo auth); el change no lo autoriza por sí solo.
- Alternativas descartadas (constancia): login por UI en cada spec (lento y acopla
  todo al formulario) y `storageState` de Playwright (serializa cookies/origen, no
  el envelope custom de zustand; la siembra directa es explícita y testeable).

### C4. Fábrica de datos por API + aislamiento

`e2e/fixtures/api.ts` con helpers sobre `APIRequestContext` autenticado:
`createAthlete`, `createPlanWithCycleAndSession`, `createCheckup`, `addCheckupTime`,
`ensureReferenceTriple`, `softDelete*` (los DELETE del contrato → 204).

- **Sufijos únicos**: nombres del estilo `e2e-${specName}-${Date.now()}` — jamás
  buscar "el primer atleta de la lista" ni depender de conteos globales.
- **Specs autocontenidos**: cada uno crea SU datos al empezar y los limpia en
  `afterEach` (best-effort: un fallo de cleanup se loga pero no tumba el test; el
  soft delete universal hace que los restos sean invisibles para la UI).
- **Triple de referencia reservado para E2E**: `(style: "MARIPOSA", distance: 999,
  category: "INFANTIL")` — combinación válida según contrato (distance entero ≥ 1,
  sin límite superior: "no inventar límites", design de checkups C8) y que ningún
  usuario real usaría. `ensureReferenceTriple` crea las 3 posiciones (tolera 409 de
  duplicado) y el cleanup las borra (DELETE 204). Re-asegurado antes de cada
  comparación por si otra sesión lo mutó a mitad de suite.

### C5. Los cinco flujos (specs y aserciones clave)

Todos navegan la UI real y asertan con `page.getByTestId(...)` (Playwright usa
`data-testid` por defecto). Interacciones Radix (select/dialog) con clicks reales y
esperas explícitas tras abrir portales — los flaky de Vitest con 24 workers no
aplican aquí (workers=1, navegador real), pero los helpers no adivinan estados.

**F1 `login.spec.ts`**
- admin.demo válido → redirección al dashboard (`dashboard-page` visible en `/`).
- Credenciales inválidas → `login-error` visible con "Credenciales inválidas"
  (mismo mensaje sea usuario inexistente o password errónea — anti-enumeración, doc
  03 §2; el test NO distingue).
- Visibilidad por rol tras login: USER (`demo.user`) no ve "Entrenamientos" ni
  "Tabla nacional" en el nav; ADMIN sí.

**F2 `athlete-creation.spec.ts`**
- ADMIN → `/athletes` → `athlete-create-link` → wizard paso 1
  (`athlete-form-firstName/lastName/birthdate/username/email` + los obligatorios del
  contrato 04) → `athlete-step2-continue` → `athlete-created-notice` → la ficha
  del atleta con el nombre único visible → aparece en `athletes-row` de la lista.

**F3 `attendance.spec.ts`**
- ADMIN → plan+mesociclo+microciclo+sesión creados VÍA API (rápidos, ya testeados
  en unit) → `/training/sessions/:id` → `attendance-grid` → marcar al atleta del
  spec PRESENTE y otro AUSENTE → **recargar la página** → los estados persisten
  (verifica el upsert real, no solo el render).

**F4 `checkup-comparison.spec.ts`**
- ADMIN → atleta creado → `/athletes/:id/chequeos` → `checkup-new-button` →
  `checkup-form-year/month/category` → aparece en `checkups-list` → detalle →
  `time-form-dialog` con `time-style-select` MARIPOSA, `time-distance-input` 999,
  `time-input` en `mm:ss.fff` → `comparison-button` → `comparison-panel` renderiza
  las 3 posiciones del triple reservado.
- **Aserción de regla dura** (el front nunca formatea): traer el detalle del chequeo
  por API, extraer `timeFormatted` del servidor y asertar ese string EXACTO en el
  DOM; idem con los deltas `absoluteDiffFormatted` del comparison.

**F5 `report-pdf.spec.ts`**
- ADMIN → atleta CON chequeo+tiempo (creado por API en el propio spec) → `/reports`
  → `report-new-button` → `report-type-select` INDIVIDUAL +
  `report-athlete-select` + `report-title-input` único → `report-submit` en loading
  (generación síncrona T3) → navega al `report-detail-page` con badge Generado.
- **Descarga**: click `report-download-button` → `page.waitForEvent("download")` →
  filename del `Content-Disposition` (fallback `reporte-{id}.pdf`) → guardar en
  tmp y asertar magic number `%PDF` (primeros bytes) y tamaño > 0.
- **FAILED**: atleta SIN datos (otro creado vacío) → generar → dialog permanece con
  `report-generation-error` mostrando el `errorMessage` del servidor.

### C6. Convenciones transversales de los specs

- Un helper `openApp(page, role)` = `loginAs` + assert de shell (DRY entre specs).
- Locators por testid SIEMPRE que existan (C10/C11); solo texto visible para
  aserciones de contenido del servidor.
- `afterEach` con cleanup best-effort + `console` sin errores de React como aserción
  global en cada spec (`page.on("console")` filtrando `error`) — la verificación
  visual previa ya usaba "0 errores de consola" como criterio.

### C7. Documentación y cierre

- `AGENTS.md` (Estructura): añadir `e2e/` (config + fixtures + 5 specs) y el script
  `test:e2e` con su precondición (back real arriba).
- Criterio de cierre del change: **`npm run test:e2e` verde contra el back real** +
  suite unit/build/`design:check` en verde. Si el back no es levantable en la
  sesión de implementación → declararlo como desviación y el change QUEDA ABIERTO
  hasta la ejecución real (a diferencia de `integrar-reportes`, aquí la ejecución
  real ES el entregable).

## Estructura de archivos

```
playwright.config.ts            — C1
e2e/
  global-setup.ts               — C2 (fail-fast accionable)
  fixtures/
    session.ts                  — C3 (builder puro + loginAs)
    api.ts                      — C4 (fábricas + ensureReferenceTriple + cleanup)
  login.spec.ts                 — C5 F1
  athlete-creation.spec.ts      — C5 F2
  attendance.spec.ts            — C5 F3
  checkup-comparison.spec.ts    — C5 F4
  report-pdf.spec.ts            — C5 F5
src/lib/auth/
  session-store.shape.test.ts   — C3 guard anti-drift (test-only, sin tocar el store)
```

## Riesgos / Trade-offs

- [Back no levantable en la sesión de implementación (lección de 8.2)] → global-setup
  falla rápido con los comandos exactos; el change no se cierra sin ejecución real.
- [Back local compartido y mutado concurrentemente] → specs autocontenidos, sufijos
  únicos, asserts acotados a lo creado por el spec, triple re-asegurado.
- [Radix flakiness] → workers=1, navegador real, esperas explícitas tras portales,
  retries 1 con trace.
- [Drift del shape de sesión] → guard Vitest que rompe antes que los specs.
- [Contaminación de la tabla nacional] → combinación reservada 999 m + cleanup en
  afterEach; restos eventuales son invisibles para la UI (soft delete) y documentados.
- [Descarga PDF lenta] → generación síncrona (T3); timeout de descarga generoso y
  una sola aserción de magic number.

## Deuda registrada (no se implementa)

- CI pipeline (GitHub Actions o similar): cambio futuro cuando se decida.
- Regresión visual: pendiente de decisión de stack (`DESIGN.md` §9).
- Flujos no críticos sin E2E (programaciones CRUD, alertas, tabla nacional): se
  cubren por la suite unit; añadir specs E2E de ellos = extensión natural futura.

## Preguntas abiertas

Ninguna bloqueante. La única convención por fijar en implementación es mecánica
(hacer que Vitest resuelva el import de `e2e/fixtures/session.ts` — path relativo o
include de tsconfig; decisión del implementador, sin impacto de diseño).
