# Tasks: integrar-reportes

> Implementación completa del módulo de reportes según `design.md` (decisiones
> C1–C11 vinculantes) y `specs/gestion-reportes/spec.md`. Rama:
> `feature/integrar-reportes`. Trabajar solo dentro del alcance; desviaciones se
> anotan abajo. Verificación obligatoria al final: `npm run test`, `npm run build`,
> `npm run design:check` en verde. Componentes shadcn SOLO vía MCP (los existentes
> cubren tabs/dialog/select/table/badge/alert-dialog/form; si falta alguno,
> instalar vía MCP y vigilar el bug del CLI 4.21: si crea un directorio literal
> `@/`, mover a `src/components/ui/` y borrarlo).
>
> **Propietarios por fase** (yo no implemento; orquesto y reviso):
> Fase 0 → `api-client-keeper`; Fases 1–7 → `reports-ui`; Fase 8 → quien
> implementó + `quality-reviewer` vía `/review`.

## Fase 0 — Capa de datos y tipos (api-client-keeper)

- [x] 0.1 Crear la rama `feature/integrar-reportes` (el pre-commit hook rechaza
      commits directos a `main`).
- [x] 0.2 Añadir a `src/lib/api/types.ts` los DTOs exactos de `design.md`:
      `ReportType`, `ReportStatus`, `TimeEvolutionEntry`, `AttendanceSummary`,
      `IndividualReportResponse`, `TeamAthleteEntry`, `TeamReportEntry`,
      `TeamReportResponse`, `GenerateReportRequest`, `ReportResponse`,
      `ReportExportResponse`, `ReportDetailResponse`,
      `CreateReportScheduleRequest`, `UpdateReportScheduleRequest`,
      `ReportScheduleResponse` (reutilizando `MedalProjectionResponse` y
      `Classification` existentes).
- [x] 0.3 `src/lib/api/http.ts`: añadir `apiFetchBlob(path, options)` según C6 —
      misma pipeline de auth/timeout/401/403 que `apiFetch` (refactor interno
      compartido, sin duplicar), `Content-Type` comprobado antes de devolver el
      blob, `fileName` parseado de `Content-Disposition`. Exportarlo desde
      `src/lib/api/index.ts` si aplica.
- [x] 0.4 Crear `src/shared/format/dates.ts` (C10): `formatInstantDate`,
      `formatInstantDateTime` (Intl es-ES) y `humanFileSize` (KB/MB), con sus
      tests.
- [x] 0.5 Añadir `"El reporte individual requiere un athleteId"` a
      `SPANISH_CONTRACT_MESSAGES` en `src/lib/api/messages.ts` (llega en español
      del back; la pre-validación local lo evita pero es red de seguridad).
- [x] 0.6 Crear `src/modules/reports/reports-api.ts` con keys y hooks EXACTOS de
      C8: `useAthleteReport`, `useTeamReport` (staleTime 5 min),
      `useReports` (query string condicional), `useReport`, `useReportSchedules`,
      `useGenerateReport` (invalida TODAS las variantes de la lista),
      `useDeleteReport` (lista + detalle), `useCreateReportSchedule`,
      `useUpdateReportSchedule` (body COMPLETO), `useDeleteReportSchedule`
      (invalidan `REPORT_SCHEDULES_KEY`), `isInvalidCronError` (C7) y
      `downloadReportExport` (apiFetchBlob, imperativa).
- [x] 0.7 `reports-api.test.tsx`: URL/método/body exactos de los endpoints, query
      string condicional de `useReports` (sin filtros / con combinación),
      invalidaciones tras cada mutación, `isInvalidCronError` (400 con/sin "cron",
      otros estados negativos) y `apiFetchBlob` (binario con filename,
      error JSON → ApiError, 404).

## Fase 1 — Infra de gráficas (reports-ui)

- [x] 1.1 Instalar `chart.js` + `react-chartjs-2` (dependencias aprobadas por el
      usuario; versiones actuales estables).
- [x] 1.2 `src/modules/reports/chart-theme.ts` (C2): registro tree-shaken de
      componentes Chart.js (`CategoryScale`, `LinearScale`, `PointElement`,
      `LineElement`, `BarElement`, `Tooltip`, `Legend`) y lectura cacheada de
      tokens por `getComputedStyle` (`--color-data-series-1..4`,
      `--color-border-default`, `--color-text-subtle`). Cero literales de color.

## Fase 2 — Dashboard del atleta (C1, C2, C9)

- [x] 2.1 `athlete-report-page.tsx` en `/athletes/:id/report`: cabecera con
      vuelta a la ficha, `useAthleteReport`, skeleton/vacío/error; 404 → estado
      "Deportista no encontrado" con enlace a la ficha.
- [x] 2.2 `evolution-chart.tsx`: una serie por `(style, distance)` etiquetada
      `${style} ${distance}m`, puntos ordenados por (year, month), eje Y invertido,
      colores series-1..4 cíclicos, leyenda arriba, tooltip con lookup del
      `timeFormatted` del servidor; estado vacío `evolution-empty` si no hay
      entradas.
- [x] 2.3 Tarjeta de asistencia (`attendance-card`): los 4 contadores +
      `currentAbsenceStreak` tal cual del servidor (nunca calcular rachas).
- [x] 2.4 Proyecciones (`report-projections`): render del array tal cual con
      `ClassificationBadge` reutilizado de checkups y `timeFormatted`/
      `diffVsBronzeFormatted` del servidor; estado vacío propio.
- [x] 2.5 `athlete-detail-page.tsx`: añadir enlace "Reporte"
      (`athlete-report-link`) junto a "Chequeos"; el resto intacto.
- [x] 2.6 Tests: página con datos (series por prueba, orden de puntos, tooltip usa
      `timeFormatted`), atleta sin datos (estados vacíos), 404 (estado dedicado),
      USER ve la página sin restricciones (es solo lectura), testids de C11.

## Fase 3 — Dashboard general `/` (C3)

- [x] 3.1 Rellenar `src/modules/dashboard/dashboard-page.tsx`: 3 KPI cards
      (`dashboard-kpis`) agregadas desde `useTeamReport()` sin filtro
      (atletas únicos / proyecciones al podio / pruebas con registro — solo
      conteo de datos ya clasificados por el servidor), chart card de
      distribución de clasificaciones (`dashboard-classification-chart`, dataset
      único series-1 con etiquetas directas), list cards "Reportes recientes"
      (`dashboard-recent-reports`, slice 5 con badge de estado y fecha) y
      "Próximas ejecuciones" (`dashboard-upcoming-schedules`, orden `nextRunAt`
      asc nulls last, slice 5).
- [x] 3.2 Estados por card: skeleton mientras carga, vacío cuando no hay datos
      (KPIs a 0 + chart card vacía).
- [x] 3.3 Tests: agregación de KPIs correcta con fixture (atletas únicos,
      conteos), orden de próximas ejecuciones con nulls al final, slices de 5,
      estados vacíos, USER ve el dashboard completo (solo lectura por definición).

## Fase 4 — Reporte de equipo (C4)

- [x] 4.1 `reports-tabs.tsx`: sub-navegación de la sección (Biblioteca/Equipo
      siempre; Programaciones solo ADMIN) con testid `reports-tabs`.
- [x] 4.2 `team-report-page.tsx`: filtro categoría server-side
      (`team-report-filter-category`, select Todas/INFANTIL/JUVENIL/MAYOR, param
      condicional), secciones por entrada con cabecera de prueba + `athleteCount`,
      tabla ranking ordenada por `bestTimeSeconds` asc con
      `bestTimeFormatted`/`diffVsBronzeFormatted` tal cual + `ClassificationBadge`;
      staleTime 5 min (misma query key que el dashboard); skeleton/vacío/error.
- [x] 4.3 Tests: URL con/sin `?category=`, ranking ordenado por `bestTimeSeconds`,
      badges del servidor, estados vacíos, COACH/USER ven la página (lectura).

## Fase 5 — Biblioteca PDF: lista, generación, detalle, descarga (C5, C6, C9, C10)

- [x] 5.1 `reports-library-page.tsx`: filtros server-side
      (`reports-filter-type`, `reports-filter-status`, `reports-filter-athlete`
      vía `fetchAllAthletes` reutilizado), tabla `reports-list` con título/tipo/
      objetivo/período/badge de estado/fecha, paginación client-side con
      `paginateClientSide` reutilizado (pageSize 10), skeleton/vacío (CTA
      "Generar reporte" solo ADMIN/COACH)/error, botón `report-new-button` solo
      ADMIN/COACH.
- [x] 5.2 `report-form.tsx` (dialog): select tipo; INDIVIDUAL → select atleta
      requerido; GENERAL → categoría opcional; `title` requerido ≤ 200;
      `year` opcional (input), `month` opcional (select 1–12); pre-validación
      local EXACTA (INDIVIDUAL sin atleta bloquea, title > 200 bloquea); envío
      con botón en loading durante toda la request síncrona (sin polling); 201
      `GENERATED` → cierra + invalida lista + navega al detalle; 201 `FAILED` →
      permanece con banner `role="alert"` (`report-generation-error`) mostrando
      `errorMessage`; 400/404 residuales → mensaje seguro vía
      `toUserFacingMessage`.
- [x] 5.3 `report-detail-page.tsx`: metadata completa, tabla `exports`
      (`fileName`, `format`, `humanFileSize(fileSizeBytes)`, fecha), botón
      "Descargar PDF" (`report-download-button`) deshabilitado si
      `status !== "GENERATED"` o `exports` vacío con texto explicativo;
      "Borrar" (`report-delete-button`, ADMIN/COACH) con `alert-dialog`
      (`report-delete-confirm`) → 204 → volver a la biblioteca; 404 → estado
      `report-not-found` con vuelta.
- [x] 5.4 Descarga (C6): `downloadReportExport(id)` → blob con
      `fileName` del `Content-Disposition` (fallback `reporte-{id}.pdf`),
      `URL.createObjectURL` + `<a download>` + `revokeObjectURL` tras el click;
      error (404/JSON) → mensaje seguro, ningún blob abierto.
- [x] 5.5 Tests: filtros condicionales (combinados y vacíos), paginación local sin
      nueva llamada, validación local del form (INDIVIDUAL sin atleta, title 201),
      spinner durante la mutación, 201 FAILED muestra banner con `errorMessage`,
      descarga happy path (blob + filename + revoke), 404 en export → mensaje
      seguro, botón deshabilitado, borrado (confirmar/cancelar + navegación),
      roles (USER sin "Generar"/"Borrar").

## Fase 6 — Programaciones (C7, C9)

- [x] 6.1 `src/modules/reports/format.ts`: `buildCronFromPreset` (diario
      `0 M H * * *` / semanal `0 M H * * DOW` con MON..SUN / mensual
      `0 M H DOM * *` con día 1–28) y `cronToHumanText` (parsea esos 3 patrones;
      desconocido → cron crudo), con tests de ida y vuelta.
- [x] 6.2 `report-schedules-page.tsx` bajo `RequireRoles(["ADMIN"])`: tabla
      `schedules-list` (tipo, objetivo, frecuencia legible, timezone, badge
      Activo/Pausado, `lastRunAt`/`nextRunAt` con `formatInstantDateTime`, tal
      cual del servidor), acciones editar/pausar-reanudar/borrar, skeleton/
      vacío/error, botón `schedule-new-button`.
- [x] 6.3 `schedule-form.tsx` (dialog): presets de C7 (frecuencia + hora/minuto
      en pasos de 5 + timezone select con `America/Bogota` default + tipo/objetivo
      + switch activo), cron generado visible read-only, `nextRunAt` mostrado
      tras guardar (`schedule-next-run`); edición pre-cargada con TODOS los
      campos (PUT completo); `isInvalidCronError` → mensaje seguro.
- [x] 6.4 Pausar/reanudar = PUT completo con `active` invertido (sin form);
      borrar con `alert-dialog` → 204.
- [x] 6.5 Tests: cron generado exacto por preset (los 3 patrones),
      `cronToHumanText` de ida y vuelta, PUT completo con todos los campos
      (ninguno omitido), pausar envía `active: false`, 400 "Expresión cron
      inválida" → mensaje seguro, borrado con confirmación, COACH/USER no ven
      la página (ruta protegida).

## Fase 7 — Rutas y navegación (C1)

- [x] 7.1 `src/app/router.tsx`: `athletes/:id/report` → `AthleteReportPage`
      (autenticada); `/reports` → `ReportsLibraryPage`;
      `/reports/equipo` → `TeamReportPage` (autenticadas);
      `/reports/:reportId` → `ReportDetailPage` (autenticada);
      `/reports/programaciones` → `ReportSchedulesPage` bajo
      `RequireRoles(["ADMIN"])`. Eliminar el import del placeholder.
- [x] 7.2 Borrar `src/modules/reports/reports-page.tsx` (placeholder). Los
      `NAV_ITEMS` NO cambian ("Reportes" ya existe).
- [x] 7.3 Tests de rutas: navegación entre tabs de la sección, USER por URL
      directa a `/reports/programaciones` → "sin permisos" sin cierre de sesión,
      ruta `/reports/:reportId` resuelve el detalle.

## Fase 8 — Cierre

- [x] 8.1 `npm run test`, `npm run build` y `npm run design:check` en verde.
- [ ] 8.2 Verificación visual con MCP playwright (`browser_snapshot` /
      `browser_evaluate`, nunca `browser_take_screenshot`) según
      `design.md` §Verificación visual: ADMIN — dashboard, ficha → Reporte,
      equipo con/sin filtro, generar INDIVIDUAL (spinner → detalle → descarga
      del PDF verificando nombre), generar con atleta sin datos (FAILED con
      `errorMessage`), borrar, programación mensual (cron visible + `nextRunAt`),
      pausar, borrar; USER — solo lectura, sin botones de escritura,
      programaciones por URL → "sin permisos".
      **PARCIAL (ver Desviación 8):** hecha con dev server + rutas reales y API
      interceptada (26/26 checks, 0 errores de consola, capturas); el MCP
      playwright no está disponible en esta sesión y el backend local no es
      levantable (sin Docker/Postgres), así que la generación/descarga/borrado
      reales quedan para `e2e-tester` con el back arriba.
- [x] 8.3 Actualizar `AGENTS.md` (sección Estructura) con el módulo reports y
      el helper `dates.ts`.
- [x] 8.4 Anotar aquí cualquier desviación del diseño antes de pedir `/review`.

## Desviaciones

Notas para `/review` (todas verificadas contra el código del back o contra el
entorno real; ninguna cambia el alcance del change):

1. **`ReportDetailResponse` no expone `active`.** El `design.md` lo declaraba
   `extends ReportResponse`, pero el record `ReportDetailResponse.java` del back
   omite `active` (un reporte borrado responde 404). Aplicada la regla "si el doc
   y el código difieren, gana el código": en `src/lib/api/types.ts` ahora es
   `extends Omit<ReportResponse, "active">` con comentario. Nada en la UI lee
   `active` del detalle.
2. **`POST /reports` responde `201 ReportDetailResponse`** (no `ReportResponse`):
   verificado en `ReportController.generateReport`. `useGenerateReport` tipa esa
   respuesta; el `status` final se lee de ahí (T3, sin polling).
3. **`(style, distance)` con el mismo `(year, month)` repetido** (dos chequeos del
   mes en categorías distintas): el eje X de la evolución es categórico y admite un
   punto por serie y período; se conserva la ÚLTIMA entrada del array del servidor
   (sin cálculo). Documentado y con test en `evolution-chart.tsx`.
4. **Leyenda de la evolución con el enum crudo** (`LIBRE 100m`) por mandato literal
   de C2/spec, mientras la tabla de proyecciones usa `styleLabel` (`Libre 100m`).
   Inconsistencia cosmética dentro de la misma página; se mantuvo el literal del
   diseño. Mejora futura de una línea si se acepta `styleLabel` en la leyenda.
5. **`Tabs` y `Switch` no estaban en `DESIGN.md` §6.** Añadidos al catálogo por
   `design-system-keeper` (junto al drift registry↔doc y la decisión abierta del
   `Button destructive` *soft*, registrada en §9). `src/shared/components/page-placeholder.tsx`
   quedó huérfano al borrar el placeholder y también se eliminó.
6. **`reports-tabs.tsx` inyecta `data-active`** desde la ruta: `@radix-ui/react-tabs`
   1.2.0 emite `data-state` y el styling del registry espera `data-active`.
   Workaround local documentado; normalizarlo exigiría forkar el registry.
7. **Edición de una programación cuyo cron no encaja en ningún preset**: el form
   entra en modo "personalizado" (muestra el cron crudo y bloquea el guardado hasta
   re-elegir frecuencia). Así el PUT completo nunca envía una expresión que la UI no
   pueda representar. No cubierto por C7; decisión documentada en `schedule-form.tsx`.
8. **Verificación visual (8.2) sin MCP playwright ni backend real**: el catálogo MCP
   de la sesión solo expone `opencode` y `shadcn`, y el back local no es levantable
   (sin demonio Docker, sin Postgres, sin `:8080`). Se ejecutó el equivalente con
   `playwright-core` contra el dev server y las RUTAS REALES (`/`, `/athletes/1/report`,
   `/reports`, `/reports/equipo`, `/reports/:id`, `/reports/programaciones`) con la API
   interceptada: 26/26 comprobaciones OK y 0 errores de consola, con capturas. Por lo
   mismo, **quedan sin verificar contra el backend real**: generación de un reporte
   INDIVIDUAL de verdad (incluido el `FAILED` con `errorMessage` y la descarga del PDF
   auténtico), el 204 del borrado y el CRUD de programaciones. Esas rutas felices son
   las que debe cubrir `e2e-tester` cuando el back esté arriba.
9. **Objetivo "Atleta #id"** cuando no hay nombre disponible (precedente D4): la
   biblioteca sí resuelve el nombre con `fetchAllAthletes()`; el detalle y las
   programaciones se quedan con el id técnico.
10. **Bundle**: `chart.js` queda en un chunk diferido vía `lazy()` en ambas páginas
    con gráfica (`athlete-report-page.tsx`, `dashboard-page.tsx`) y el registro
    tree-shaken de `chart-registry.ts`. Build medido: chunk principal ~790 kB +
    chunk de Chart.js ~174 kB diferido. (Corregido en la segunda pasada de `/review`:
    este texto declaraba antes "~966 kB sin code-splitting", que dejó de ser cierto
    al aterrizar el `lazy()`; el aviso de Vite por >500 kB persiste por otras
    dependencias, no por chart.js.) Deuda restante: repasar el resto de vendors.
11. **Hallazgos del `/review` aplicados tras 8.4** (Cuatro correcciones pequeñas,
    ninguna de alcance):
    - `apiFetchBlob` pedía la descarga con `Accept: application/json` (el default de
      la pipeline compartida): ahora las descargas binarias mandan `Accept: */*`
      (y un `Accept` explícito del caller se respeta en vez de pisarse).
    - El copy de `schedule-form` y `report-schedules-page` prometía que el servidor
      calculaba la próxima ejecución "con la zona horaria elegida": el back NO honra
      `timezone` (`computeNextRun` usa `clock.getZone()`). Copy neutralizado y
      prerrequisito registrado en `AGENTS.md` (**D6**) y en C7 del `design.md`.
    - El dashboard listaba una programación PAUSADA con `nextRunAt` futuro como si
      fuera una ejecución inminente (el back calcula `nextRunAt` sin mirar `active`):
      ahora toda fila inactiva lleva la marca "Pausada" junto a la fecha, igual que
      la tabla de programaciones (C3 del `design.md` actualizado).
    - `saveBlobAsFile` devolvía una Blob URL ya revocada: la firma ahora es `void`.
    - `design.md` C3 KPI-2 describía "proyecciones al podio" como conteo de entradas;
      el spec y la implementación cuentan **deportistas únicos** con su mejor
      clasificación (3 entradas / 9 atletas / 4 podio → 9/4/3). Documento reconciliado
      para que nadie "arregle" el código hacia el doble conteo.
12. **Segunda pasada de `/review` (resolución de hallazgos menores M1–M3)**:
    - **M1** (`report-detail-page.tsx`): el borrado con error 500/red dejaba el
      diálogo abierto sin feedback; ahora muestra un banner `Alert destructive`
      `role="alert"` (`report-delete-error`) con `toUserFacingMessage` + fallback
      seguro para errores que no son `ApiError` (red caída), limpiado en
      cancelar/reabrir. El camino 404 (cerrar + navegar) queda intacto.
    - **M3** (`schedule-form.tsx`): editar una programación con `timezone: null`
      pre-cargaba `America/Bogota` y el PUT completo la persistía sin que el
      usuario la eligiera; ahora existe la opción "Sin zona horaria" (centinela
      traducido a `null` al enviar) en alta y edición, el null hace round-trip
      fiel y el default de `America/Bogota` queda solo como valor inicial del alta.
      Copy neutro conforme a D6 (la etiqueta solo nombra la ausencia). El toggle
      pausar/reanudar ya reenviaba el valor tal cual — sin cambios.
    - **M2**: la desviación 10 anterior quedó corregida arriba (el code-splitting
      de chart.js SÍ está implementado; el texto previo quedó desactualizado).
    - Verificación: +11 tests (detalle de borrado y de timezone), suite completa
      379 OK, `typecheck` y `design:check` en verde, pasada visual con playwright
      MCP (rutas reales, API mockeada por `page.route`; el backend real seguía
      sin estar disponible — el 8.2 contra el back real sigue pendiente).
    - Observaciones del revisor pospuestas como deuda documentada: O2 (orden de
      `GET /reports` no documentado en el contrato 07 — cambiar docs del back),
      O3 (whitelist de Content-Type en `apiFetchBlob`), O5 (cerrar el dialog de
      generación por ESC/overlay durante el envío), 8.2/E2E contra backend real.
