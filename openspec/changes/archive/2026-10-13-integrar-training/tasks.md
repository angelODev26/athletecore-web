# Tasks: integrar-training

> Implementación completa del módulo de entrenamientos según `design.md` (decisiones
> T1–T10 vinculantes) y `specs/gestion-entrenamientos/spec.md`. Rama:
> `feature/integrar-training`. Trabajar solo dentro del alcance; desviaciones se anotan
> abajo. Verificación obligatoria al final: `npm run test`, `npm run build`,
> `npm run design:check` en verde.

## Fase 0 — Capa de datos y tipos

- [x] 0.1 Añadir a `src/lib/api/types.ts` los DTOs exactos de `design.md`
      (`CycleType`, `SessionStatus`, `AttendanceStatus`, `TrainingPlanResponse`,
      `TrainingPlanDetailResponse`, `TrainingCycleNode`, `CreateTrainingPlanRequest`,
      `CreateCycleRequest`, `SessionResponse`, `SessionDetailResponse`,
      `CreateSessionRequest`, `UpdateSessionRequest`, `AttendanceRecord`,
      `RegisterAttendanceRequest`, `AttendanceAlertResponse`).
- [x] 0.2 Crear `src/modules/training/training-api.ts` con las query keys y los hooks
      exactos de `design.md` (patrón de `athletes-api.ts`), incluido `fetchAllAthletes()`
      (agota `GET /athletes` size 100 hasta `last`) y las mutaciones con sus
      invalidaciones (lista raíz + detalle afectado).
- [x] 0.3 `training-api.test.tsx`: URL/método/body exactos de cada endpoint, invalidación
      tras mutación, y que el acknowledge NO genera llamada alguna.

## Fase 1 — Lista de planes y CRUD (T2, roles T8)

- [x] 1.1 Instalar vía MCP shadcn: `select`, `dialog` (y los estados compartidos que
      falten). Si aparece el directorio literal `@/` (bug CLI 4.21), mover a
      `src/components/ui/` y borrarlo.
- [x] 1.2 `plans-list-page.tsx`: tabla con `toPageModel` en cliente, skeleton, vacío con
      CTA (ADMIN), error con reintento, navegación a detalle. Borrar placeholder
      `training-page.tsx`.
- [x] 1.3 `plan-form.tsx` (dialog): alta/edición; validación local de rango de fechas;
      400 → `details` campo a campo. Borrado con `alert-dialog` existente (solo ADMIN).
- [x] 1.4 `plans-list-page.test.tsx`: paginación client-side sin nueva llamada, vacío,
      acciones visibles solo para ADMIN, flujo de borrado (cancelar/confirmar).

## Fase 2 — Detalle del plan y ciclos (T3, T5)

- [x] 2.1 `plan-detail-page.tsx`: cabecera del plan + árbol `cycles[].children[]` tal cual
      (sin reordenar), con acciones por rol: crear ciclo (ADMIN), crear sesión en micro
      (ADMIN/COACH), ir a sesión.
- [x] 2.2 `cycle-form.tsx`: pre-validación T5 completa (padre según tipo, fechas dentro de
      rango, nombre no duplicado en el plan); 400 → `details` por campo.
- [x] 2.3 Tests de detalle: jerarquía renderizada tal cual, bloqueos locales del
      formulario de ciclo, mapeo de 400.

## Fase 3 — Sesiones (T4, T10)

- [x] 3.1 `session-form.tsx`: crear (anidado en ciclo)/editar; `sessionDate` obligatoria;
      enums con etiquetas ES y valores exactos; sin sesiones sueltas en UI.
- [x] 3.2 Cambio de estado (`PUT .../status`) desde el detalle de la sesión; borrado con
      confirmación solo ADMIN.
- [x] 3.3 Formato de presentación T10 (fechas/hora por string, sin `new Date(YYYY-MM-DD)`).
- [x] 3.4 Tests: creación anidada (URL correcta), estado, borrado oculto a COACH,
      formato de fecha límite (`2026-01-06` → `06/01/2026`).

## Fase 4 — Pase de lista (T6)

- [x] 4.1 `session-detail-page.tsx` + `attendance-grid.tsx`: planilla combinando
      asistencia embebida + `fetchAllAthletes()`; tres estados + "sin marcar";
      `POST .../attendance` por marca con upsert; e invalidación del detalle.
- [x] 4.2 Sesión CANCELADA → aviso + controles deshabilitados; 400 con mensaje mapeado.
- [x] 4.3 Tests: planilla completa con "sin marcar", corrección por upsert (un POST,
      sin duplicar), bloqueo en cancelada.

## Fase 5 — Alertas (T7)

- [x] 5.1 Store local `alerts-ack-store.ts` (persistido en `localStorage`, clave
      `athletecore.alerts.ack`, entradas `(athleteId, lastAbsenceDate)`).
- [x] 5.2 `alerts-page.tsx`: tarjetas con racha y última fecha (formato T10), paginación
      client-side, dismiss local con copy honesto, estado vacío.
- [x] 5.3 Tests: dismiss oculta sin llamar al back; reaparición con `lastAbsenceDate`
      nuevo; vacío.

## Fase 6 — Cierre

- [x] 6.1 Rutas en `src/app/router.tsx`: `/training`, `/training/plans/:planId`,
      `/training/sessions/:sessionId`, `/training/alerts`, todas bajo
      `RequireRoles(["ADMIN","COACH"])`. Enlaces internos en la sección (Planes ↔ Alertas).
- [x] 6.2 Verificación visual con MCP playwright (snapshot/evaluate): lista, árbol,
      pase de lista y alertas; como ADMIN y como COACH (acciones por rol visibles/ocultas).
- [x] 6.3 `npm run test`, `npm run build`, `npm run design:check` en verde.
- [x] 6.4 Actualizar `AGENTS.md` (sección Estructura, módulo training).
- [x] 6.5 Commit/push/merge lo decide el humano; el change se archiva después.

## Desviaciones registradas

_(rellenar durante la implementación si algo difiere del design; si no, dejar vacío)_

- **400 → "details campo a campo" (T5/T9):** doc 08 §1 es explícito — el back concatena
  `details` SIN nombres de campo, así que no es mapeable a inputs concretos. El mapeo
  campo a campo real lo hace la pre-validación local (`validateCycleLocally`, schemas
  zod de `plan-form`/`session-form` con errores bajo cada campo); el 400 que se cuela se
  muestra como mensaje global seguro vía `toSubmitErrorMessage` → `toUserFacingMessage`
  (nunca texto crudo). Cumple el espíritu de T5/T9 y la convención del doc 08.
- **`toPageModel` no trocea arrays** (su propio test lo documenta como contrato del
  adapter): el slice vive en `paginateClientSide` dentro de `training-api.ts`, que envuelve
  `toPageModel` y trocea. La migración futura a server-side sigue siendo local al módulo (D2).
- **`useCreateSession` invalida `cycleSessionsKey`**, no el detalle del plan: las sesiones
  no forman parte del árbol (`cycles[].children[]` es de ciclos, T3); el árbol se refresca
  vía las sesiones por microciclo (`useCycleSessions`, endpoint plano permitido por el design).
- **Sesión dentro del árbol:** para listar sesiones bajo cada microciclo la UI sí usa
  `GET /training-cycles/{cycleId}/sessions` (el design lo deja "disponible si hiciera
  falta" — hacía falta para el botón "ir a sesión" y el listado por micro).
- **Datos demo creados en la BD de desarrollo** durante la verificación visual (6.2): plan
  "Plan Demo Training 2026" (id 1) → meso "Base Enero" → micro "Semana 1" → sesiones 1–3;
  atletas `demo.nadador1..3` (ids 66–68); asistencia de 66 (AUSENTE en 1–3 → alerta real
  de racha 3). Borrables sin problema; sirven de semilla para el E2E del `e2e-tester`.

### Deuda tras la revisión `/review` (review-fixes.md)

- **C1 — limpiar campos opcionales de una sesión**: el back aplica "null = omitir" por
  campo (`TrainingSessionService.updateSession`, `if (request.x() != null)`) y NO distingue
  campo ausente de campo a `null`, así que con el back actual es imposible limpiar un
  opcional ya guardado (startTime, volume, intensity, distance, observations). La UI lo
  comunica como error de campo ("Una vez guardado no se puede dejar vacío; solo puedes
  sustituirlo") en vez de descartar el cambio en silencio. **Prerrequisito de back**: que
  el DTO distinga `null` de ausente (Jackson `JsonNode`/`Optional`) — candidata para doc 09.
