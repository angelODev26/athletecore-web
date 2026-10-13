# Diseño: integrar-training

## Contexto

Contrato: `docs/backend-contract/05-contrato-api-entrenamientos.md` (fuente de verdad,
junto a `08` transversales). Jerarquía: `TrainingPlan` → `TrainingCycle(MESOCICLO)` →
`TrainingCycle(MICROCICLO, parentCycleId)` → `TrainingSession` → `Attendance`.
Todo el módulo es **staff-only** (ADMIN/COACH); las escrituras de plan/ciclo, el borrado
de sesiones y el acknowledge de alertas son **solo ADMIN**.

Decisiones heredadas que aplican: **D2** (paginación client-side donde el back no pagina),
**D3** (acknowledge de alertas local; la UI nunca promete persistencia), **D5** no aplica.

## Decisiones (vinculantes para la implementación)

### T1. Sección completa bajo `RequireRoles(["ADMIN","COACH"])`

Reutilizar el guard existente (`src/app/guards`). La navegación ya oculta
"Entrenamientos" a USER (de `integrar-autenticacion`); aquí se garantiza que las 4 rutas
internas están protegidas y que un 403 real muestra el estado "sin permisos" (nunca
redirige a login).

### T2. Paginación client-side donde el back no pagina (D2)

`GET /training-plans` y `GET /alerts/attendance` devuelven arrays completos. La UI pagina
en cliente usando el adapter existente: `toPageModel(array, page, size)` de
`src/lib/api/pagination.ts` (acepta `T[]` y hace el slice) — mismo contrato de UI que la
lista de athletes (`Anterior/Siguiente`, estados `first/last`, total visible). Si el back
pagina algún día, solo cambia la llamada, no la UI.

### T3. Árbol del plan = única fuente `GET /training-plans/{id}`

La jerarquía viene montada y ordenada (`orderIndex`, luego `startDate`). El front NO
re-ensambla nada ni ordena: renderiza `cycles[].children[]` tal cual. El endpoint plano
`GET /{planId}/cycles` NO se usa en la UI (queda disponible en la capa de datos solo si
hiciera falta).

### T4. Las sesiones solo se crean dentro de microciclos

`POST /training-cycles/{cycleId}/sessions` es el único camino de alta en UI. La sesión
"suelta" (`POST /training-sessions`) **no se expone**: el back no tiene listado global de
sesiones, así que una suelta sería inalcanzable desde la interfaz. Se registra como
prerrequisito de back (`GET /training-sessions?...`) y se deja el hook implementado pero
sin consumidores de UI.

### T5. Creación de ciclo con pre-validación local de las reglas 400

El formulario de ciclo valida ANTES de enviar (tiene el árbol del plan en memoria):

- `MESOCICLO` → sin `parentCycleId`; `MICROCICLO` → padre obligatorio y debe ser
  `MESOCICLO` del mismo plan.
- `startDate ≤ endDate`; fechas dentro del rango del plan (meso) o del mesociclo padre
  (micro).
- Nombre de ciclo no duplicado dentro del plan.

Si aun así llega `400`, mapear `details` campo a campo (convención doc 08), nunca
`message` crudo.

### T6. Pase de lista: upsert por atleta, corrección sin borrado

- Planilla = `GET /training-sessions/{id}` (trae `attendance` embebida; los atletas sin
  marcar no aparecen) combinada con el listado completo de deportistas: helper
  `fetchAllAthletes()` que pagina `GET /athletes` (size 100) hasta `last` — la lista
  sigue siendo server-side en el back; aquí solo se agota para armar la planilla.
- Cada atleta tiene tres estados de marca: `PRESENTE` / `AUSENTE` / `JUSTIFICADO`, más
  "sin marcar" (ausencia de registro). Un `POST .../attendance` por cambio (upsert:
  re-marcar corrige sin duplicar). Marcar es optimista solo en el estado local de la fila;
  la fuente de verdad se re-sincroniza con `invalidateQueries` del detalle de sesión.
- Sesión en estado `CANCELADA` → pase bloqueado: aviso visible "La sesión está cancelada;
  no admite asistencia", controles deshabilitados. Si igualmente llega `400`, mensaje
  mapeado, nunca crudo.

### T7. Alertas: acknowledge 100 % local (D3)

- `GET /alerts/attendance` es derivada (no hay filas en DB) y el `POST .../acknowledge`
  **no persiste nada**. Por tanto la UI **no llama al endpoint**: "marcar como vista" es
  un dismiss local.
- Store persistido (`localStorage`, clave `athletecore.alerts.ack`) con entradas
  `(athleteId, lastAbsenceDate)`. Una alerta queda oculta solo si su par coincide; si la
  racha crece (nuevo `lastAbsenceDate`) reaparece sola.
- Copy honesto obligatorio junto a la acción: "Oculta la alerta solo en este navegador;
  puede reaparecer si continúan las ausencias".

### T8. Acciones por rol, tal cual el contrato

| Acción | Rol UI |
|---|---|
| Crear/editar/borrar plan, crear ciclo | solo ADMIN (oculto a COACH) |
| Crear/editar sesión, cambiar estado, pasar lista | ADMIN y COACH |
| Borrar sesión | solo ADMIN |
| Ver planes/sesiones/alertas | ADMIN y COACH |

Implementado con el helper de roles existente (`hasAnyRole` / `useSessionRoles`), igual
que en la navegación. El back sigue siendo la autoridad (403 → "sin permisos").

### T9. Errores: helpers existentes + `details` en 400

Reutilizar `toUserFacingMessage` (mensajes seguros, nunca texto crudo). En 400 de
validación/reglas de negocio mostrar `details` campo a campo bajo cada input (convención
doc 08). `409` no está documentado en este módulo (no usar `getDuplicateField` aquí; el
nombre duplicado de ciclo llega como 400 con `details`).

### T10. Formatos de presentación sin cálculo

- Fechas `YYYY-MM-DD` → mostrar `DD/MM/YYYY` **por manipulación de string** (nunca
  `new Date("2026-01-06")`: desfasa un día en zonas horarias negativas).
- Hora `HH:mm:ss` → `HH:mm` (string slice).
- `volume`, `intensity`, `distance` se muestran tal cual (el front no calcula nada).
- Enums: valores exactos del servidor; etiquetas ES solo en presentación
  (`PROGRAMADA` → "Programada", etc.).

## DTOs exactos (añadir a `src/lib/api/types.ts`)

```ts
export type CycleType = "MESOCICLO" | "MICROCICLO";
export type SessionStatus = "PROGRAMADA" | "EJECUTADA" | "CANCELADA";
export type AttendanceStatus = "PRESENTE" | "AUSENTE" | "JUSTIFICADO";

export interface TrainingPlanResponse {
  id: number; name: string; startDate: string; endDate: string;
  description: string | null; active: boolean;
}
export interface CreateTrainingPlanRequest {
  name: string; startDate: string; endDate: string; description?: string;
}
export interface TrainingCycleNode {
  id: number; type: CycleType; name: string;
  startDate: string; endDate: string; orderIndex: number;
  parentCycleId: number | null; children: TrainingCycleNode[];
}
export interface TrainingPlanDetailResponse extends TrainingPlanResponse {
  cycles: TrainingCycleNode[];
}
export interface CreateCycleRequest {
  type: CycleType; name: string; startDate: string; endDate: string;
  orderIndex: number; parentCycleId?: number;
}

export interface SessionResponse {
  id: number; cycleId: number | null; disciplineId: number | null;
  sessionDate: string; startTime: string | null; status: SessionStatus;
  volume: number | null; intensity: number | null; distance: number | null;
  observations: string | null; active: boolean;
}
export interface CreateSessionRequest {
  cycleId?: number; disciplineId?: number; sessionDate: string;
  startTime?: string; status?: SessionStatus; volume?: number;
  intensity?: number; distance?: number; observations?: string;
}
export type UpdateSessionRequest = Partial<CreateSessionRequest>;

export interface AttendanceRecord {
  id: number; sessionId: number; sessionDate: string;
  athleteId: number; athleteFullName: string; status: AttendanceStatus;
}
export interface SessionDetailResponse extends SessionResponse {
  attendance: AttendanceRecord[];
}
export interface RegisterAttendanceRequest {
  athleteId: number; status: AttendanceStatus;
}

export interface AttendanceAlertResponse {
  athleteId: number; athleteFullName: string;
  consecutiveAbsenceCount: number; lastAbsenceDate: string;
}
```

> `SessionDetailResponse.attendance` reutiliza el shape de `AttendanceResponse` del
> contrato (id, sessionId, sessionDate, athleteId, athleteFullName, status). Si el tipeo
> real del back difiere, gana el código del back.

## Hooks exactos (`src/modules/training/training-api.ts`, patrón de `athletes-api.ts`)

Query keys jerárquicas: `TRAINING_ROOT_KEY = moduleQueryKey("training")`, más
`trainingPlansListKey`, `trainingPlanDetailKey(id)`, `sessionDetailKey(id)`,
`attendanceAlertsKey`.

- `useTrainingPlans()` → lista completa (la paginación es client-side en la página).
- `useTrainingPlan(id)` → detalle con jerarquía. `useSession(id)` → detalle con asistencia.
- `useAttendanceAlerts()` → alertas activas.
- Mutaciones (todas invalidan la lista raíz + el detalle afectado):
  `useCreateTrainingPlan`, `useUpdateTrainingPlan(id)`, `useDeleteTrainingPlan(id)`,
  `useCreateCycle(planId)`, `useCreateSession(cycleId)`, `useUpdateSession(id)`,
  `useUpdateSessionStatus(id)`, `useDeleteSession(id)`, `useUpsertAttendance(sessionId)`.
- Helper compartido en la página de pase de lista (o `athletes-api.ts`):
  `fetchAllAthletes()` — itera `GET /athletes?page=n&size=100` hasta `last`.

## Estructura de archivos a crear

```
src/modules/training/
  training-api.ts            # hooks + keys + fetchAllAthletes
  training-api.test.tsx
  training-page.tsx          # SE ELIMINA (placeholder) → lista de planes
  plans-list-page.tsx        # /training
  plans-list-page.test.tsx
  plan-detail-page.tsx       # /training/plans/:id (árbol + acciones)
  plan-detail-page.test.tsx
  plan-form.tsx              # dialog crear/editar plan (ADMIN)
  cycle-form.tsx             # dialog crear ciclo con pre-validación T5
  session-form.tsx           # dialog crear/editar sesión
  session-detail-page.tsx    # /training/sessions/:id (detalle + pase lista)
  session-detail-page.test.tsx
  attendance-grid.tsx        # planilla de pase (por atleta, 3 estados + sin marcar)
  alerts-page.tsx            # /training/alerts
  alerts-page.test.tsx
```

## `data-testid` obligatorios (convención con e2e-tester)

`plans-list`, `plan-row-{id}`, `plan-create`, `plan-form-dialog`, `plan-delete-confirm`,
`plan-tree`, `cycle-node-{id}`, `cycle-create-{parentId|root}`, `session-row-{id}`,
`session-form-dialog`, `session-status-select`, `session-delete-confirm`,
`attendance-grid`, `attendance-row-{athleteId}`, `attendance-mark-{athleteId}`,
`alerts-list`, `alert-card-{athleteId}`, `alert-ack-{athleteId}`, más los estados
compartidos (`*-empty`, `*-error`). Si falta un estado en el shell, añadirlo (es de
todos).

## Reglas duras de UI (AGENTS.md) — recordatorio expreso

- Tokens semánticos exclusivamente; acento violeta solo según `DESIGN.md`.
- Componentes shadcn SOLO vía MCP (`select`, `dialog` nuevos; si el CLI recrea el
  directorio literal `@/`, mover a `src/components/ui/` y borrarlo — bug documentado).
- Tras cambios visuales: verificación con MCP playwright (snapshot/evaluate, NO
  screenshots masivos).

## Alternativas consideradas y descartadas

- **Sesiones sueltas visibles**: sin listado global en el back son inalcanzables → fuera
  (T4), prerrequisito registrado.
- **Llamar a `POST .../acknowledge`**: no persiste; llamarlo fingiría persistencia (T7).
- **Re-montar el árbol desde el endpoint plano**: trabajo redundante; el detalle ya viene
  ordenado (T3).

## Deuda registrada que queda tras el change

- Back: sin `GET /training-sessions` global → sesiones sueltas sin UI (prerrequisito).
- Back: acknowledge sin persistencia (D3, ya documentada en `09`).
- Historial de asistencia del atleta (`GET /athletes/{id}/attendance`): fuera de alcance;
  si se quiere en la ficha, será un change pequeño sobre `gestion-deportistas`.
