# Propuesta: integrar-reportes

## Why

Auth, athletes, training y chequeos están integrados. Quedan dos placeholders del
shell ligados al último dominio pendiente del contrato: **reportes**
(`docs/backend-contract/07-contrato-api-reportes.md`, verificado contra el código del
back en `../athletecore-api`): la sección `/reports` y el Dashboard `/`. El dominio
tiene dos caras — datos estructurados para dashboards y gráficas
(`GET /athletes/{id}/report`, `GET /reports/team`) y artefactos PDF persistidos
(generación síncrona, biblioteca, descarga, programación cron). El front **nunca**
calcula clasificaciones ni formatea tiempos: todo tiempo visible usa el `*Formatted`
del servidor y toda clasificación llega hecha.

## What Changes

- Nueva capability **`gestion-reportes`**: dashboards + reporte de equipo +
  biblioteca PDF + programaciones.
- **Dashboard del atleta** (`/athletes/:id/report`, enlace "Reporte" desde la ficha):
  `GET /athletes/{id}/report` en UNA llamada — gráfica de evolución de tiempos por
  (estilo, distancia) con Chart.js (eje Y invertido: menor tiempo = mejor), resumen de
  asistencia con racha del servidor y proyecciones de medallería con badges
  (`classification` reutiliza el type y el badge del módulo chequeos).
- **Dashboard general** (`/`, reemplaza el placeholder): 3 KPI cards agregadas en
  cliente desde `GET /reports/team` (deportistas evaluados, pruebas con registro,
  proyecciones al podio), gráfica de distribución de clasificaciones y dos list cards
  (reportes recientes, próximas ejecuciones programadas). Disponible para cualquier
  autenticado.
- **Reporte de equipo** (`/reports/equipo`): `GET /reports/team?category=` con filtro
  server-side opcional; ranking por prueba `(style, distance, category)` con mejor
  tiempo `bestTimeFormatted` tal cual y badge de clasificación. Lectura pesada: se
  cachea con `staleTime` (sin polling agresivo).
- **Biblioteca PDF** (`/reports`): lista `GET /reports?type=&athleteId=&status=`
  (filtros server-side, paginación client-side según D2/deuda T9), "Generar reporte"
  (ADMIN/COACH) con generación **síncrona** (spinner + lectura de `status` de la
  respuesta 201; `FAILED` → `errorMessage`), detalle `/reports/:reportId` con metadata
  de exports y **descarga por Blob** (`fetch` + `Authorization`, comprobando
  `Content-Type` antes de abrir el blob), borrado soft con confirmación (ADMIN/COACH).
- **Programaciones** (`/reports/programaciones`, solo ADMIN): CRUD de
  `/report-schedules` con formulario de **presets** (diario/semanal/mensual + hora) que
  el front traduce a cron Spring de 6 campos — nunca cron crudo — mostrando
  `lastRunAt`/`nextRunAt` del servidor como confirmación.
- **Capa de datos**: DTOs exactos en `src/lib/api/types.ts`, nuevo
  `apiFetchBlob` en `src/lib/api/http.ts` (binario con la misma pipeline de
  auth/401/403) y hooks en `src/modules/reports/reports-api.ts` (patrón checkups).
- **Dependencia nueva (aprobada)**: `chart.js` + `react-chartjs-2` para las gráficas.
- Navegación: `NAV_ITEMS` sin cambios ("Reportes" ya existe); sub-navegación interna
  de la sección con "Programaciones" visible solo para ADMIN.

## Capabilities

### New Capabilities

- `gestion-reportes`: dashboard del atleta con gráfica de evolución, dashboard general
  del equipo, reporte de equipo comparativo, biblioteca de PDFs con generación
  síncrona y descarga Blob, y programaciones automáticas con presets de cron de 6
  campos; reglas por rol del contrato (generar/borrar = ADMIN/COACH, programaciones =
  ADMIN, lecturas = autenticado).

### Modified Capabilities

- Ninguna. El shell no cambia sus requisitos: ni `NAV_ITEMS` ni los guards de
  `app-shell-navigation` se ven afectados (la sección "Reportes" ya existe y las
  rutas nuevas heredan el `RequireAuth` existente).

## Impact

- **Rutas**: `/` rellenada; `/athletes/:id/report` (autenticada); `/reports` pasa de
  placeholder a biblioteca; `/reports/equipo` (autenticada); `/reports/programaciones`
  bajo `RequireRoles(["ADMIN"])`; `/reports/:reportId` (autenticada).
- **Capa de datos**: `apiFetchBlob` nuevo en `http.ts`; DTOs nuevos
  (`ReportType`, `ReportStatus`, `TimeEvolutionEntry`, `AttendanceSummary`,
  `IndividualReportResponse`, `TeamReportEntry`, `TeamAthleteEntry`,
  `TeamReportResponse`, `GenerateReportRequest`, `ReportResponse`,
  `ReportDetailResponse`, `ReportExportResponse`, `CreateReportScheduleRequest`,
  `UpdateReportScheduleRequest`, `ReportScheduleResponse`); hooks de módulo en
  `reports-api.ts`; helper `isInvalidCronError` (400 dinámico del back).
- **Módulos**: `src/modules/reports/` completo (páginas + forms + api + format);
  `src/modules/dashboard/dashboard-page.tsx` reemplaza su placeholder (dueño del
  cambio: reports-ui); `athlete-detail-page.tsx` gana el enlace "Reporte".
- **Dependencias**: `chart.js` y `react-chartjs-2` (aprobadas por el usuario).
  Componentes shadcn existentes cubren lo necesario (tabs, dialog, select, table,
  badge, alert-dialog, form); cualquier faltante solo vía MCP shadcn.
- **AGENTS.md**: actualizar sección Estructura con el módulo reports al finalizar.
