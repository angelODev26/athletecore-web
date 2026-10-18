# athletecore-web — convenciones del proyecto

SPA en **React 19 + TypeScript + Vite 8**, único cliente de **AthleteCore API** (`http://localhost:8080`, Spring Boot en `../athletecore-api`).

## Fuente de verdad del contrato

`docs/backend-contract/` (docs `00`–`09` + `flujo-completo`). Si un doc y el backend difieren, **gana el código** (`../athletecore-api`, indexado con CodeGraph). Reglas clave: JWT Bearer con roles en el claim del token; `401` → login, `403` → sin permisos; `ErrorResponse` único; soft delete universal (204 + 404 posterior es correcto); el front **nunca** calcula BMI, clasificación ni rachas; tiempos siempre con `timeFormatted` del servidor.

## Reglas duras de UI

- Tras cualquier cambio visual en `components/` o `pages/`, levantar el dev server, navegar con el MCP playwright y tomar screenshot antes de dar la tarea por terminada.
- Usar el MCP shadcn para buscar e instalar componentes del registry real — nunca inventar className ni markup de shadcn/ui a mano.
- Evitar el "kit SaaS genérico": mismo border-radius en todo, sombra gris estándar, eyebrows en mayúsculas, gradientes decorativos, flechas "→" en botones. Un acento primario de color; el secundario (violeta) solo con el rol restringido que asigna `DESIGN.md` (rellenos de badge, uso moderado).

## Decisiones de arquitectura tomadas (sprint 0)

- **D1**: sin refresh token hoy — módulo de auth tras abstracción `AuthTokens { access, refresh? }`; comportamiento transitorio: re-login tras expiración (24 h). Prerrequisito registrado: refresh token en `athletecore-api`.
- **D2**: paginación client-side con adapters en la capa de datos; migración a server-side será un cambio local del adapter.
- **D3**: acknowledge de alertas es local (store `(athleteId, lastAbsenceDate)`); la UI nunca promete persistencia.
- **D4**: sin catálogo de disciplinas en el back — la UI muestra `disciplineId` como dato técnico hasta que exista `GET /disciplines` (prerrequisito registrado).
- **D5**: foto de perfil = input de URL, sin upload.
- **D6**: las programaciones de reportes envían `timezone` (IANA) porque el contrato lo
  exige, pero **el back todavía no lo honra**: `ReportScheduleService.computeNextRun`
  calcula la próxima ejecución con `clock.getZone()` (zona del servidor). La UI muestra
  la fecha del servidor tal cual y su copy no promete la zona elegida. Prerrequisito
  registrado: `computeNextRun` debe usar el `timezone` persistido de la programación.
  Nota relacionada (mismo servicio): el back calcula `nextRunAt` sin mirar `active`, así
  que una programación pausada trae fecha futura y la UI debe marcarla como "Pausada".

## Mapa de agentes especializados

| Agente | Dueño de |
|---|---|
| `api-client-keeper` | Tipos TS de DTOs, cliente fetch + interceptores, hooks TanStack Query, adapters de paginación |
| `auth-guardian` | Login/registro, sesión (Zustand), guards por rol, expiración |
| `athletes-ui` | Pantallas de deportistas (lista paginada, ficha, alta 2 pasos, perfil, deportes) |
| `training-ui` | Planes/ciclos/sesiones, pase de lista, alertas (solo ADMIN/COACH) |
| `checkups-ui` | Chequeos, tiempos, comparación, tabla nacional |
| `reports-ui` | Dashboards, gráficas Chart.js, PDFs, programación cron |
| `design-system-keeper` | Shell, tema Tailwind, componentes shadcn compartidos, auditoría visual |
| `e2e-tester` | Playwright E2E, infra de Vitest, data-testid |
| `quality-reviewer` | Revisión de solo lectura (se dispara con `/review`) |

## Flujo de trabajo

- Ramas `feature/*` obligatorias: el hook `.githooks/pre-commit` rechaza commits directos a `main` (ya activo vía `core.hooksPath`).
- El proceso de desarrollo se orquesta con **OpenSpec** (`openspec/`).
- Autonomía: los agentes actúan solos dentro de su rama; piden confirmación solo ante acciones destructivas (borrados masivos, cambios de configuración, nuevas dependencias).

## Design contract

All UI work follows `DESIGN.md` (tokens in `docs/design/tokens.json`). Never hardcode colors or styles.

## Agent and skill configuration (OpenCode + Claude Code)

`.opencode/agents` and `.opencode/skills` are canonical. `.claude/agents` and `.claude/skills` mirror them, maintained by hand: when you change an agent or skill, edit the `.opencode` file and then apply the same body change to the `.claude/` copy (bodies identical; frontmatter stays tool-specific). OpenSpec skills belong to the OpenSpec tooling and each tree uses its own command syntax (`/opsx-apply` in OpenCode, `/opsx:apply` in Claude Code) — do not normalize them across trees.

## Estructura (post `integrar-autenticacion`)

- `src/components/ui/` — componentes del registry shadcn (botón, input, label, card, alert, form, dialog, select, alert-dialog, tabs, switch, …). NO se editan a mano; se gestionan vía MCP shadcn. El checker `check-hardcoded-styles.mjs` los excluye (valores arbitrarios del registry).
- `src/lib/auth/session-store.ts` — sesión persistida (`localStorage`, clave `athletecore.session`) con `expiresAt` + guard `RequireGuest`; expulsión proactiva por claim `exp`.
- `src/modules/auth/` — login, registro (`/registro`), `auth-api.ts` (mutaciones contra `POST /auth/login` y `POST /users`).
- `src/modules/training/` — entrenamientos (solo ADMIN/COACH): lista de planes con paginación client-side (`plans-list-page`), árbol del plan (`plan-detail-page`), formularios en dialog (`plan-form`, `cycle-form` con pre-validación de reglas 400, `session-form`), detalle de sesión con pase de lista upsert (`session-detail-page` + `attendance-grid`), bandeja de alertas con dismiss 100 % local (`alerts-page` + `alerts-ack-store`, clave `athletecore.alerts.ack`), capa de datos (`training-api.ts` con `fetchAllAthletes()`), formatos T10 (`format.ts`).
- `src/modules/checkups/` — chequeos mensuales: pestaña en la ficha del atleta (`/athletes/:id/chequeos`, `athlete-checkups-page` con filtros año/mes server-side + `projections-panel`), detalle con tiempos embebidos y comparación lazy (`/athletes/:id/chequeos/:checkupId`, `checkup-detail-page` + `time-form` + `comparison-panel`), borrado "corregir = borrar y recrear" (deuda T5, sin PUT), matriz ADMIN de tabla nacional (`/tabla-nacional`, `national-reference-page` + `reference-form`, agrupación client-side por `(style, distance, category)`), capa de datos (`checkups-api.ts`, comparación/proyección con 409 → estado "referencia incompleta"), parser de input `mm:ss.fff` (`format.ts` — el front nunca formatea tiempos).
- `src/modules/reports/` — reportes (contrato 07): dashboard del atleta en la ficha (`/athletes/:id/report`, `athlete-report-page` con `evolution-chart` Chart.js, `attendance-card` y `report-projections`), dashboard general `/` (`src/modules/dashboard/dashboard-page.tsx`: 3 KPIs agregadas en cliente del team report, distribución de clasificaciones y listas de reportes recientes/próximas ejecuciones), reporte de equipo (`/reports/equipo`, `team-report-page` con filtro de categoría server-side y ranking por prueba), biblioteca PDF (`/reports`, `reports-library-page` + `report-form` con generación síncrona y lectura del `status` de la 201; detalle `/reports/:reportId` con descarga por Blob y borrado), programaciones solo ADMIN (`/reports/programaciones`, `report-schedules-page` + `schedule-form` con presets traducidos a cron de 6 campos), sub-navegación `reports-tabs` (tab Programaciones oculta a no-ADMIN), capa de datos (`reports-api.ts`, `useTeamReport` con `staleTime` 5 min y `downloadReportExport` imperativa sobre `apiFetchBlob` de `src/lib/api/http.ts`), presets/etiquetas de presentación (`format.ts`) e infra de gráficas (`chart-theme.ts`: registro tree-shaken de Chart.js + tokens por `getComputedStyle`, cero literales).
- `src/shared/format/dates.ts` — `formatInstantDate`/`formatInstantDateTime` (Intl es-ES) y `humanFileSize` (KB/MB): SOLO presentación de timestamps y metadatos de archivos; los tiempos de nado siguen siendo siempre el `*Formatted` del servidor.
- `e2e/` — suite E2E Playwright (`npm run test:e2e`) contra el backend REAL en local (precondición: Postgres docker `athletecore-postgres` + API en :8080; el global-setup aborta con mensaje accionable si falta). `playwright.config.ts` en la raíz (workers=1, Chromium, retries 1); fixtures: `e2e/fixtures/session.ts` (login por API + siembra del envelope de `zustand persist`, builder puro compartido con el guard `src/lib/auth/session-store.shape.test.ts`) y `e2e/fixtures/api.ts` (fábricas con sufijos únicos `e2e-*`, triple de referencia reservado `MARIPOSA/999/INFANTIL`, cleanup best-effort). Specs: `login` (credenciales + nav por rol), `athlete-creation` (wizard 2 pasos), `attendance` (upsert + persistencia tras recargar), `checkup-comparison` (`*Formatted` del servidor exacto en DOM), `report-pdf` (GENERATED + descarga `%PDF`, fallo de generación con dialog persistente). Los specs E2E NO corren con `npm run test` (Vitest está scopeado a `src/**` vía `vitest.config.ts`).
- `components.json` — shadcn CLI (aliases `@/…`). Nota: el CLI v4.21 tuvo bugs de resolución de alias en este repo; si vuelve a crear un directorio literal `@/`, mover archivos a `src/` y borrarlo.
