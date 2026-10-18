# Diseño: integrar-reportes

## Contexto

Contrato: `docs/backend-contract/07-contrato-api-reportes.md` (fuente de verdad, junto
a `08` transversales y `09` deudas), verificado contra el código del back:
`ReportController`, `ReportScheduleController`, `ReportGenerationService`,
`ReportScheduleService`, DTOs de `report/dto/` (`GenerateReportRequest`,
`CreateReportScheduleRequest`, `UpdateReportScheduleRequest` — el doc 07 los nombra
distinto, gana el código).

El módulo tiene dos caras (no confundir):

1. **Datos estructurados JSON** (dashboards, gráficas):
   `GET /athletes/{id}/report` y `GET /reports/team`.
2. **Artefactos PDF persistidos** (generación síncrona, historial, descarga, cron):
   `/api/v1/reports` + `/api/v1/report-schedules`.

**Autorización (verificada con `@PreAuthorize` en los controllers):**

| Acción | Rol |
|---|---|
| Generar reporte (`POST /reports`), borrar (`DELETE /reports/{id}`) | ADMIN/COACH |
| CRUD de programaciones (`/report-schedules`) | solo ADMIN |
| Todas las lecturas (dashboards, equipo, biblioteca, exports, schedules) | cualquier autenticado |

Decisiones heredadas: **D2** (listados sin paginar → paginación client-side con
adapter; aquí aplican `GET /reports` y `GET /report-schedules`, deuda T9). Deuda **T3**
(doc 09): generación de reportes es SÍNCRONA (puede tardar segundos) → spinner +
lectura de `status` de la respuesta; nunca polling.

Dependencia nueva **aprobada por el usuario**: `chart.js` + `react-chartjs-2`.

## Goals / Non-Goals

**Goals:**

- Rellenar los dos placeholders restantes del shell: `/reports` y `/` (Dashboard).
- Cubrir TODO el contrato 07: dashboard del atleta, dashboard general, reporte de
  equipo, biblioteca PDF con generación/descarga/borrado y programaciones cron.
- Descarga de PDF con `fetch` + `Authorization` → Blob (un `<a href>` simple no lleva
  JWT), comprobando `Content-Type` antes de abrir el blob.

**Non-Goals:**

- Polling de estado de generación (hoy es síncrono; la UI queda compatible leyendo
  `status`).
- Edición de cron crudo (el form usa presets; el cron generado se muestra read-only).
- "Próximas sesiones" en el Dashboard `/` (los endpoints de training son
  ADMIN/COACH y el dashboard es para cualquier autenticado).
- Migrar la paginación a server-side (D2 lo deja como cambio local futuro del
  adapter).

## Decisiones (vinculantes para la implementación)

### C1. Ubicación y navegación

- **Dashboard del atleta**: sub-ruta de la ficha `athletes/:id/report`
  (`AthleteReportPage`), con enlace "Reporte" (`athlete-report-link`) en
  `athlete-detail-page.tsx` junto al de "Chequeos".
- **Sección `/reports`** con sub-navegación interna tipo tabs (componente
  `reports-tabs.tsx`, presente en todas las páginas de la sección):
  - `/reports` (index) = **Biblioteca de PDFs**.
  - `/reports/equipo` = reporte de equipo.
  - `/reports/programaciones` = programaciones, **tab y ruta solo ADMIN**
    (`RequireRoles(["ADMIN"])`; el tab se oculta a COACH/USER — mismo patrón que
    "Tabla nacional": el GET es abierto pero la sección de gestión es de ADMIN).
- **Dashboard general**: se rellena `src/modules/dashboard/dashboard-page.tsx` en su
  ubicación actual (dueño del cambio: reports-ui, que es dueño de dashboards).
- `NAV_ITEMS` **no cambia** ("Reportes" ya existe para cualquier autenticado). Se
  elimina el placeholder `src/modules/reports/reports-page.tsx`.

### C2. Gráficas: Chart.js tree-shaken + tokens por `getComputedStyle`

- Instalar `chart.js` + `react-chartjs-2` (aprobadas). Registro **manual** de
  componentes (tree-shaking): `CategoryScale`, `LinearScale`, `PointElement`,
  `LineElement`, `BarElement`, `Tooltip`, `Legend` — en un `chart-theme.ts`.
- **Colores SIEMPRE desde tokens**: el canvas no soporta `var()`. Helper
  `src/modules/reports/chart-theme.ts` lee las CSS variables del archivo generado
  (`getComputedStyle(document.documentElement)`) — `--color-data-series-1..4`,
  `--color-border-default` (gridlines), `--color-text-subtle` (ejes) — con caché por
  render. Prohibido hex/rgb literales (regla dura de `DESIGN.md`).
- **Evolución** (`evolution-chart.tsx`, `<Line/>`): una serie (dataset) por
  `(style, distance)` con etiqueta `${style} ${distance}m`; puntos ordenados por
  `(year, month)`; eje Y en `timeSeconds` con `reverse: true` (menor tiempo = mejor);
  series con `data.series-1..4` **cíclicas** (`i % 4`) — legend labels siempre
  visibles (regla "nunca solo color"); legend arriba; tooltip **nativo sin estilar**
  cuyo callback hace lookup del entry y muestra `timeFormatted` del servidor (el
  front nunca formatea tiempos; mostrar segundos crudos en tooltip estaría mal).
- **Distribución de clasificaciones** (Dashboard `/`, `<Bar/>`): dataset único con
  fill `data.series-1`, 3 barras (Podio/Cercano/Fuera) con etiquetas directas.
- Eje X de la evolución: etiqueta `${month}/${year}` formateada con
  `Intl.DateTimeFormat` mes abreviado es-ES (presentación de fecha, NO tiempo de
  nado — permitido).
- Deuda aceptada: tooltips de chart sin tokens propios (`DESIGN.md` §9 los deja
  pendientes) → se usa el tooltip nativo de Chart.js (oscuro por defecto).

### C3. Dashboard general `/` (cualquier autenticado)

- **3 KPI cards** agregadas en cliente desde `GET /reports/team` (agregar datos que
  el servidor YA clasificó es presentación; el front NO calcula clasificaciones):
  1. "Deportistas evaluados" — `athleteId` únicos en `entries[].athletes`.
  2. "Proyecciones al podio" — deportistas distintos (en `entries[].athletes`) cuya
     MEJOR clasificación es `POR_ENCIMA_DEL_PODIO`, contados UNA vez por
     `athleteId` (un deportista aparece en varias entradas si compite en varias
     pruebas). Elegir la mejor de las clasificaciones que el servidor ya calculó es
     agregación, nunca cálculo local; así la barra "Podio" de la gráfica coincide
     con esta KPI y las 3 barras suman los deportistas evaluados. Escenario
     vinculante del spec: 3 entradas / 9 atletas únicos / 4 podio → 9 / 4 / 3.
  3. "Pruebas con registro" — `entries.length`.
- **Chart card**: distribución de clasificaciones (C2) + estado vacío si no hay datos.
- **2 list cards**:
  - "Reportes recientes": `useReports({})`, slice 5, título + badge de estado
    (C10) + fecha `createdAt` formateada (C10).
  - "Próximas ejecuciones": `useReportSchedules()`, orden por `nextRunAt` asc
    (nulls al final), slice 5, título del objetivo + "próxima ejecución"; las
    programaciones pausadas se marcan como "Pausada" aunque traigan `nextRunAt`
    (el back lo calcula sin mirar `active`) — ver C7.
- `useTeamReport` con `staleTime: 5 * 60_000` (lectura pesada — aviso del contrato:
  cachear y no adjuntar a polling agresivo). `GET /reports/team` sin filtro (todas).

### C4. Reporte de equipo `/reports/equipo`

- Filtro de categoría (`select`: Todas / INFANTIL / JUVENIL / MAYOR) server-side:
  `?category=` condicional (mismo patrón que los filtros de chequeos).
- Render tal cual llega (el back ya agrega por `(style, distance, category)`):
  una sección por entrada con cabecera de prueba (`style`, `distance`, `category`,
  `athleteCount`) y tabla ranking **ordenada por `bestTimeSeconds` asc** (ordenar
  datos del servidor = presentación). Columnas: atleta, `bestTimeFormatted` tal
  cual, `ClassificationBadge` (reutilizado de checkups), `diffVsBronzeFormatted`
  tal cual.
- `staleTime` 5 min; skeleton/vacío ("sin chequeos registrados")/error con reintento.

### C5. Biblioteca PDF + generación síncrona

- **Lista** (`reports-library-page.tsx`): `GET /reports?type=&athleteId=&status=` con
  filtros server-side condicionales (select de tipo, select de estado, select de
  atleta vía `fetchAllAthletes()` reutilizado de `training-api.ts`). Paginación
  client-side con `paginateClientSide()` reutilizado de `training-api.ts` (D2/T9,
  pageSize 10 — cap de resultados en UI).
- Columnas: título, tipo (badge), objetivo (atleta o categoría), período (si trae
  `year`/`month`), estado (badge C10), fecha (C10), acciones (ver).
- **"Generar reporte"** (`report-form.tsx`, dialog, visible solo ADMIN/COACH):
  - `reportType` (select INDIVIDUAL/GENERAL). Si INDIVIDUAL → select de atleta
    (`fetchAllAthletes`) **requerido**. Si GENERAL → select de categoría **opcional**.
  - `title` obligatorio, máx 200 (`@NotBlank @Size(200)` — validación local exacta).
    `year`/`month` opcionales (month como select 1–12 por UX; el DTO no valida
    rangos — no inventar reglas de año).
  - Envío: botón en estado loading durante TODA la request (T3 síncrono, puede
    tardar segundos; **sin polling**). La `201` ya trae `status` final:
    - `GENERATED` → cierra el dialog, invalida la lista y navega al detalle.
    - `FAILED` → el dialog permanece con banner `role="alert"` mostrando el
      `errorMessage` del servidor (lo emite el back para el usuario).
  - Pre-validación local: INDIVIDUAL sin atleta bloquea el envío (el 400 residual
    `"El reporte individual requiere un athleteId"` está ya en español en el back —
    añadir a `SPANISH_CONTRACT_MESSAGES`).
- **Detalle** (`report-detail-page.tsx`, `/reports/:reportId`): metadata completa +
  tabla de `exports` (`fileName`, `format`, `fileSizeBytes` humanizado, `createdAt`)
  + "Descargar PDF" (C6; deshabilitado si `status !== "GENERATED"` o `exports` vacío,
  con texto que lo explique) + "Borrar" (ADMIN/COACH, `alert-dialog` → `DELETE` 204
  → volver a la biblioteca; 404 posterior es consistente con soft delete).
  - Se usa `GET /reports/{id}` (el detalle YA incluye `exports`; el endpoint
    `GET /{id}/exports` queda sin consumir — decisión: no duplicar llamada).
  - `404` → estado "Reporte no encontrado" con vuelta a la biblioteca.

### C6. Descarga por Blob (`apiFetchBlob` — dueño api-client-keeper)

`src/lib/api/http.ts` gana:

```ts
/** GET binario con la MISMA pipeline de auth/timeout/errores que apiFetch. */
export async function apiFetchBlob(
  path: string,
  options?: ApiRequestOptions,
): Promise<{ blob: Blob; fileName: string | null }>
```

- Comportamiento exigido (el refactor interno es decisión del api-client-keeper,
  pero SIN duplicar la pipeline): header `Authorization` + timeout + `401` →
  `clearSession` + redirect a login + `403` → `forbiddenHandler` (los dos handlers
  compartidos existentes).
- `!response.ok` → parsear el body como JSON (`ErrorResponse`) y lanzar `ApiError`
  (ante 401 el body es JSON de error, NO PDF).
- `response.ok` + `Content-Type` JSON → error inesperado: `ApiError` genérico
  (nunca abrir un blob que no es binario).
- `response.ok` + binario → `blob()` + `fileName` parseado de
  `Content-Disposition` (`/filename="([^"]+)"/`).
- UI (`report-detail-page.tsx`): función imperativa `downloadReportExport(id)` →
  `URL.createObjectURL(blob)` → `<a download={fileName ?? `reporte-${id}.pdf`}>`
  + click + `revokeObjectURL` inmediato tras el click. Estados: loading en el botón,
  error → mensaje seguro vía `toUserFacingMessage` (p. ej. 404 "reporte sin
  exports / FAILED").

### C7. Programaciones (solo ADMIN): presets → cron de 6 campos

- **Tabla** (`report-schedules-page.tsx`): tipo, objetivo (atleta o categoría),
  frecuencia legible (`cronToHumanText` — parsea los 3 presets generados; patrón
  desconocido → muestra el cron crudo), timezone, estado (badge Activo/Pausado),
  última/próxima ejecución (`lastRunAt`/`nextRunAt` del servidor, tal cual — nunca
  calcularlas), acciones editar / pausar-reanudar / borrar.
- **Form de presets** (`schedule-form.tsx`) — el usuario JAMÁS escribe cron:
  - Frecuencia: **Diario** | **Semanal** (+ select LUN..DOM) | **Mensual** (+ día 1–28).
  - Hora (0–23) y minuto (select 0–55 en pasos de 5).
  - Cron generado: `0 M H * * *` (diario) / `0 M H * * DOW` (semanal) /
    `0 M H DOM * *` (mensual). Se muestra **read-only** en el form (transparencia).
  - Timezone: `select` con lista corta IANA (`America/Bogota` por defecto,
    `America/Mexico_City`, `America/Santiago`, `Europe/Madrid`, `UTC`). El valor se
    envía y se persiste (el contrato lo exige), pero **el back todavía NO lo honra**:
    `ReportScheduleService.computeNextRun` usa `after.atZone(clock.getZone())`, así
    que la próxima ejecución se calcula en la zona del servidor. La UI no debe
    prometer lo contrario en su copy. Prerrequisito registrado en `AGENTS.md` (D6).
  - `active`: switch (default activo). Tipo/objetivo igual que la generación (C5).
    Ojo: el back calcula `nextRunAt` SIN mirar `active` (una pausada sí trae fecha
    futura, aunque `findDueActiveSchedules` no la ejecute) → toda superficie que
    muestre "próxima ejecución" debe marcar el estado pausado, nunca presentarla
    como una ejecución inminente.
- **Tras guardar**: la respuesta trae `nextRunAt` → se muestra como confirmación
  ("Próxima ejecución: ...") antes de volver a la tabla.
- **PUT COMPLETO** (`UpdateReportScheduleRequest`, todos los campos — como C7 de
  chequeos): el form de edición parte pre-cargado con TODOS los campos de la fila.
  "Pausar/Reanudar" = mismo PUT completo con `active` invertido (sin form).
- **DELETE** con `alert-dialog` → 204.
- **400 cron dinámico** (`"Expresión cron inválida: ..."` / `"...no produce una
  próxima ejecución"`): helper en `reports-api.ts`:

  ```ts
  /** 400 del back por cron inválido (mensaje dinámico, no clave de diccionario). */
  export function isInvalidCronError(error: unknown): boolean {
    return isApiError(error) && error.status === 400 &&
      (error.payload.message ?? "").includes("cron");
  }
  ```

  → mensaje seguro "La programación no es válida; revisa la frecuencia y la hora".
  Los presets lo hacen casi imposible; es red de seguridad.

### C8. Capa de datos (hooks exactos, patrón `checkups-api.ts`)

`src/modules/reports/reports-api.ts`:

```ts
const REPORTS_ROOT_KEY = moduleQueryKey("reports");
export function athleteReportKey(athleteId: number);       // [...root, "athlete-report", id]
export function teamReportKey(category?: string);          // [...root, "team", category ?? "all"]
export function reportsListKey(filters: ReportsFilters);   // [...root, "list", filters]
export function reportDetailKey(id: number);               // [...root, "detail", id]
export const REPORT_SCHEDULES_KEY = [...REPORTS_ROOT_KEY, "schedules"] as const;

// Queries
useAthleteReport(athleteId)      // GET /athletes/{id}/report
useTeamReport(category?)         // GET /reports/team — staleTime 5 min (C3/C4)
useReports(filters)              // GET /reports — query string CONDICIONAL (C5)
useReport(id)                    // GET /reports/{id}
useReportSchedules()             // GET /report-schedules (sin paginar)

// Mutaciones (invalidaciones exactas)
useGenerateReport()        // POST /reports → invalida reportsListKey (TODAS las variantes de filtro)
useDeleteReport(id)        // DELETE /reports/{id} → invalida lista + reportDetailKey(id)
useCreateReportSchedule()  // POST /report-schedules → invalida REPORT_SCHEDULES_KEY
useUpdateReportSchedule(id)// PUT /report-schedules/{id} (body COMPLETO) → invalida REPORT_SCHEDULES_KEY
useDeleteReportSchedule(id)// DELETE /report-schedules/{id} → invalida REPORT_SCHEDULES_KEY

// Imperativa (no es hook de query)
downloadReportExport(id)   // apiFetchBlob → GET /reports/{id}/export (C6)
```

Los tipos de filtros: `type ReportsFilters = { type?: ReportType; athleteId?: number; status?: ReportStatus }`.

### C9. Roles

- Todas las rutas nuevas son autenticadas; solo `/reports/programaciones` lleva
  `RequireRoles(["ADMIN"])` y su tab se oculta a no-ADMIN.
- "Generar reporte" y "Borrar": visibles solo con `hasAnyRole(roles, ["ADMIN", "COACH"])`.
  El back es la autoridad: 403 → estado "sin permisos" del shell (handler global
  existente, no se reinventa).

### C10. Fechas, tamaños de archivo y badges de estado

- Helper compartido nuevo `src/shared/format/dates.ts`:
  `formatInstantDate(iso)` / `formatInstantDateTime(iso)` con `Intl.DateTimeFormat`
  es-ES (presentación de timestamps, NO tiempos de nado — permitido; los tiempos de
  nado SIEMPRE son el `*Formatted` del servidor).
- `humanFileSize(bytes)` (`Intl.NumberFormat` es-ES, KB/MB) en el mismo helper.
- Badge de estado (`status`): `GENERATED` → success "Generado"; `FAILED` → danger
  "Fallido" (+ `errorMessage` visible en el detalle); `PENDING` → warning
  "Pendiente" (hoy no debería aparecer — generación síncrona — pero MUST renderizar).

### C11. Testids obligatorios

| testid | Dónde |
|---|---|
| `athlete-report-link` | ficha del atleta → dashboard de reporte |
| `athlete-report-page`, `evolution-chart`, `evolution-empty`, `attendance-card`, `report-projections` | dashboard del atleta |
| `dashboard-page`, `dashboard-kpis`, `dashboard-classification-chart`, `dashboard-recent-reports`, `dashboard-upcoming-schedules` | dashboard `/` |
| `team-report-page`, `team-report-filter-category`, `team-report-entries` | reporte de equipo |
| `reports-library-page`, `reports-filter-type`, `reports-filter-status`, `reports-filter-athlete`, `reports-list`, `report-new-button` | biblioteca |
| `report-form`, `report-type-select`, `report-athlete-select`, `report-title-input`, `report-submit`, `report-generation-error` | generación |
| `report-detail-page`, `report-exports-table`, `report-download-button`, `report-delete-button`, `report-delete-confirm`, `report-not-found` | detalle |
| `schedules-page`, `schedules-list`, `schedule-new-button`, `schedule-form`, `schedule-frequency-select`, `schedule-next-run` | programaciones |
| `reports-tabs` | sub-navegación de la sección |

## DTOs exactos (añadir a `src/lib/api/types.ts`)

Verificados contra `report/dto/*.java`. Se reutilizan los existentes
`MedalProjectionResponse` y `Classification` (módulo chequeos).

```ts
// --- Reportes (contrato 07) ---
export type ReportType = "INDIVIDUAL" | "GENERAL";
export type ReportStatus = "PENDING" | "GENERATED" | "FAILED";

export interface TimeEvolutionEntry {
  year: number;
  month: number;
  style: string; // valores de SwimmingStyle; string para tolerar extensión (doc 06 §1)
  distance: number;
  timeSeconds: number; // BigDecimal → JSON number (doc 08 §4)
  timeFormatted: string; // SIEMPRE del servidor
}

export interface AttendanceSummary {
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  justifiedCount: number;
  currentAbsenceStreak: number; // racha calculada por el servidor — nunca local
}

export interface IndividualReportResponse {
  athleteId: number;
  athleteFullName: string;
  timeEvolution: TimeEvolutionEntry[];
  attendance: AttendanceSummary;
  projections: MedalProjectionResponse[]; // reusa el type de chequeos
}

export interface TeamAthleteEntry {
  athleteId: number;
  athleteFullName: string;
  bestTimeSeconds: number;
  bestTimeFormatted: string;
  classification: Classification;
  diffVsBronzeSeconds: number;
  diffVsBronzeFormatted: string;
}

export interface TeamReportEntry {
  style: string;
  distance: number;
  category: string;
  athleteCount: number;
  athletes: TeamAthleteEntry[];
}

export interface TeamReportResponse {
  category: string | null; // null = sin filtro (todas)
  entries: TeamReportEntry[];
}

export interface GenerateReportRequest {
  reportType: ReportType; // @NotNull
  athleteId?: number | null; // requerido si INDIVIDUAL (regla de servicio, 400)
  category?: string | null;
  year?: number | null;
  month?: number | null;
  title: string; // @NotBlank, @Size(max = 200)
}

export interface ReportResponse {
  id: number;
  reportType: ReportType;
  athleteId: number | null;
  category: string | null;
  year: number | null;
  month: number | null;
  title: string;
  status: ReportStatus;
  errorMessage: string | null; // visible cuando status === "FAILED"
  createdAt: string; // Instant ISO-8601 UTC
  updatedAt: string;
  active: boolean;
}

export interface ReportExportResponse {
  id: number;
  reportId: number;
  format: string; // "PDF"
  fileName: string;
  fileSizeBytes: number;
  contentType: string; // "application/pdf"
  createdAt: string;
}

export interface ReportDetailResponse extends ReportResponse {
  exports: ReportExportResponse[];
}

export interface CreateReportScheduleRequest {
  reportType: ReportType; // @NotNull
  athleteId?: number | null;
  category?: string | null;
  cronExpression: string; // @NotBlank @Size(100) — Spring 6 campos, construido por presets
  timezone?: string | null; // @Size(63), nombre IANA
  active?: boolean | null;
}

// El update EXIGE todos los campos (PUT completo); misma forma que create.
export type UpdateReportScheduleRequest = CreateReportScheduleRequest;

export interface ReportScheduleResponse {
  id: number;
  reportType: ReportType;
  athleteId: number | null;
  category: string | null;
  cronExpression: string;
  timezone: string | null;
  active: boolean;
  lastRunAt: string | null; // precalculados por el servidor — solo mostrar
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Validaciones locales a replicar (leídas de los DTOs Java — no inventar):

- `GenerateReportRequest`: `title` no vacío y ≤ 200; `reportType` ∈ enum;
  INDIVIDUAL requiere `athleteId` (regla de servicio). `year`/`month`/`category`
  sin restricciones en el DTO — el month como select 1–12 es UX, no regla del back.
- Schedules: `cronExpression` ≤ 100 (siempre válido por construcción de presets);
  `timezone` ≤ 63 (select cerrado, lo garantiza).
- Envío de enums SIEMPRE en mayúsculas (convención transversal doc 08 §4).

## Estructura de archivos

```
src/modules/reports/
  reports-api.ts             — C8 (keys, hooks, isInvalidCronError, downloadReportExport)
  chart-theme.ts             — C2 (registro Chart.js + tokens vía getComputedStyle cacheado)
  format.ts                  — C7 (buildCronFromPreset, cronToHumanText) + C10 (labels)
  reports-tabs.tsx           — C1 sub-navegación de la sección
  reports-library-page.tsx    — C5 lista + filtros + paginación client-side
  report-form.tsx            — C5 generación síncrona (dialog ADMIN/COACH)
  report-detail-page.tsx     — C5 metadata + exports + descarga C6 + borrado
  team-report-page.tsx       — C4 ranking por prueba
  report-schedules-page.tsx  — C7 tabla + pausar/reanudar
  schedule-form.tsx          — C7 presets → cron (dialog)
  athlete-report-page.tsx    — C1 dashboard del atleta
  evolution-chart.tsx        — C2 gráfica de evolución
  *.test.tsx                 — tests por archivo (ver tasks.md)
```

Compartidos: `src/shared/format/dates.ts` (C10, nuevo); `apiFetchBlob` en
`src/lib/api/http.ts` (C6). Se REUTILIZAN sin tocarlos: `ClassificationBadge`
(checkups), `paginateClientSide` + `fetchAllAthletes` (training-api), estados
compartidos (`src/shared/components/states.tsx`). `dashboard-page.tsx` se rellena
en `src/modules/dashboard/` (ubicación actual). Componentes shadcn existentes
cubren todo (tabs/dialog/select/table/badge/alert-dialog/form); faltante → MCP
shadcn con vigilancia del bug del CLI 4.21.

## Verificación visual

Back local corriendo (`cd ~/athletecore-api && export $(grep -v '^#' .env | xargs) &&
SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run`, docker `athletecore-postgres`
arriba) y `npm run dev`:

- Login `admin.demo/secret123` (ADMIN): Dashboard `/` (KPIs + chart + listas);
  ficha atleta → "Reporte" (evolución con datos, asistencia, proyecciones);
  `/reports/equipo` con y sin filtro; `/reports` → generar INDIVIDUAL (spinner →
  detalle → descargar PDF → verificar blob y nombre de archivo) y generar con
  atleta sin chequeos (FAILED con `errorMessage` visible); borrar con confirmación;
  `/reports/programaciones` → crear mensual día 1 06:00 (ver cron generado y
  `nextRunAt`), pausar, reanudar, borrar.
- Login `demo.user/secret123` (USER): Dashboard y biblioteca en solo lectura (sin
  "Generar reporte" ni "Borrar"); `/reports/programaciones` por URL directa →
  "sin permisos" y sin cierre de sesión.
- MCP playwright con `browser_snapshot`/`browser_evaluate` (nunca
  `browser_take_screenshot`).

## Riesgos / Trade-offs

- [Canvas no soporta CSS vars] → `chart-theme.ts` lee tokens por `getComputedStyle`
  con caché; nunca literales. Si el tema cambia en caliente, se recalcula al montar.
- [> 4 series (style, distance) en la evolución] → colores cíclicos series-1..4 con
  legend labels siempre visibles; riesgo aceptado, documentado.
- [`GET /reports/team` es pesada] → `staleTime` 5 min, sin refetch agresivo; el
  dashboard y la vista de equipo comparten la misma query (misma key) → una sola
  llamada.
- [Descarga con sesión expirada a mitad] → `apiFetchBlob` comparte el pipeline 401
  (clear + redirect); el blob jamás se abre si el `Content-Type` es JSON.
- [400 de cron con mensaje dinámico] → `isInvalidCronError` + mensaje seguro; los
  presets evitan el caso en la práctica.

## Deuda registrada (no se implementa)

- Tooltips de chart sin tokens propios (`DESIGN.md` §9 pendiente) → tooltip nativo.
- `GET /reports` y `GET /report-schedules` sin paginar (T9) → client-side hoy;
  migración server-side = cambio local del adapter (D2).
- Generación síncrona (T3) → la UI lee `status` y es compatible con un futuro
  async (POST → PENDING → poll), pero no implementa polling.
- Dashboard `/` sin card de "próximas sesiones" (training es ADMIN/COACH): se usan
  "próximas ejecuciones programadas"; una card de sesiones exigiría abrir el
  endpoint o condicionar por rol.

## Preguntas abiertas

Ninguna bloqueante. El set de iconos (lucide, outlined 18px en nav) y el tipo de
grafía son provisionales de `DESIGN.md` y no afectan a este cambio.
