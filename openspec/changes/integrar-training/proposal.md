# Propuesta: integrar-training

## Why

Auth y athletes están integrados. El siguiente dominio en el orden de dependencias es
**entrenamientos** (`docs/backend-contract/05-contrato-api-entrenamientos.md`), toda la
sección solo para ADMIN/COACH. Hoy `/training` es un placeholder del shell (`TrainingPage`).
El staff necesita planificar (plan anual → mesociclo → microciclo → sesión), pasar lista
con upsert de asistencia y atender la bandeja de alertas de ausencias consecutivas.

## What Changes

- Nueva capability **`gestion-entrenamientos`**: planificación + sesiones + asistencia + alertas.
- Reemplazar el placeholder `/training` por la **lista de planes anuales** (sin paginar en
  back → **paginación client-side** vía `toPageModel`, D2) con alta/edición/borrado
  (escrituras de plan **solo ADMIN**).
- **Detalle del plan** (`/training/plans/:id`): árbol mesociclo → microciclo montado por el
  back (`GET /training-plans/{id}`), con creación de ciclos pre-validando las reglas 400
  del contrato (micro exige padre MESOCICLO, meso sin padre, fechas dentro del rango,
  nombre no duplicado en el plan).
- **Sesiones**: crear/editar dentro de un microciclo (endpoint anidado), cambio de estado
  (`PUT .../status`, incl. `CANCELADA`) y borrado (solo ADMIN). Las sesiones **sueltas
  quedan fuera del alcance visual** (no existe listado global en el back; serían
  inalcanzables desde la UI — deuda registrada).
- **Pase de lista** (`/training/sessions/:id`): planilla = detalle de sesión (asistencia
  embebida) + listado completo de deportistas (todas las páginas de `GET /athletes`);
  `POST .../attendance` por atleta con upsert (re-marcar = corregir). Sesión `CANCELADA`
  bloquea el pase.
- **Bandeja de alertas** (`/training/alerts`): `GET /alerts/attendance` (sin paginar →
  client-side), tarjetas con racha y última fecha; "marcar vista" **100 % local** (D3) —
  NO se llama al endpoint de acknowledge (no persiste nada); store persistido con clave
  `(athleteId, lastAbsenceDate)`.
- Tipos TS de los DTOs del módulo en `src/lib/api/types.ts` y hooks TanStack Query en
  `src/modules/training/training-api.ts`, siguiendo el patrón de `athletes-api.ts`.
- Componentes shadcn **solo vía MCP shadcn**: `select`, `dialog` (ver Impact).

## Capabilities

### New Capabilities

- `gestion-entrenamientos`: gestión de planes/ciclos/sesiones, pase de lista con upsert,
  bandeja de alertas con acknowledge local. Todo bajo guard `RequireRoles(["ADMIN","COACH"])`.

### Modified Capabilities

- `app-shell-navigation`: la ruta `/training` ya existe y ya está oculta a USER; cambian
  los destinos internos (subrutas `/training/plans/:id`, `/training/sessions/:id`,
  `/training/alerts`), sin cambio de requisito a nivel de spec (nada que modificar).

## Impact

- **Rutas**: `/training` (lista), `/training/plans/:planId`, `/training/sessions/:sessionId`,
  `/training/alerts` — todas bajo `RequireRoles(["ADMIN","COACH"])` (guard ya implementado).
- **Capa de datos**: DTOs nuevos (`TrainingPlanResponse/Detail`, `CycleType`,
  `CreateTrainingPlanRequest`, `CreateCycleRequest`, `SessionResponse/Detail`,
  `CreateSessionRequest/Update`, `SessionStatus`, `AttendanceStatus`,
  `RegisterAttendanceRequest/Response`, `AttendanceAlertResponse`) y hooks de módulo.
- **Dependencias**: solo componentes shadcn nuevos (`select`, `dialog`) vía CLI/MCP;
  ninguna dependencia npm fuera de ese registry.
- **Módulos**: `src/modules/training/` completo (páginas + forms + api + tests);
  placeholder `training-page.tsx` se elimina.
- **AGENTS.md**: actualizar sección Estructura con el módulo training al finalizar.
