# 05 — Contrato API: Entrenamientos, Asistencia y Alertas (Training Domain)

> Fuentes: `TrainingPlanController`, `TrainingSessionController`, `AttendanceController`,
> `AlertController`, servicios y DTOs de `training/dto/`, enums `CycleType`,
> `SessionStatus`, `AttendanceStatus`.
>
> 🔐 **Todo este módulo es staff-only**: la clase raíz de cada controller lleva
> `@PreAuthorize("hasAnyRole('ADMIN','COACH')")` (además de la regla de URL en
> `SecurityConfig`). Las operaciones de escritura sensibles (crear/editar/borrar planes,
> borrar sesiones, acknowledge de alertas) son **solo ADMIN**. Un `ROLE_USER` recibe 403
> en todo este módulo → el front debe **ocultar la sección completa de entrenamientos**
> a usuarios sin rol staff.

---

## 1. Modelo jerárquico (clave para entender las URLs)

```
TrainingPlan (año)
└── TrainingCycle (MESOCICLO)
    └── TrainingCycle (MICROCICLO, parentCycleId → mesociclo)
        └── TrainingSession (fecha, hora, volumen, intensidad…)
            └── Attendance (un registro por deportista y sesión)
```

- Las sesiones **pueden existir sin ciclo** (`cycleId` opcional): son "sesiones sueltas".
- Las sesiones pueden referenciar una `disciplineId` (del catálogo de sports — IDs sin
  endpoint propio, ver `04` §4).
- Enums exactos (strings en mayúsculas, `EnumType.STRING`):

| Enum | Valores |
|------|---------|
| `CycleType` | `MESOCICLO`, `MICROCICLO` |
| `SessionStatus` | `PROGRAMADA`, `EJECUTADA`, `CANCELADA` |
| `AttendanceStatus` | `PRESENTE`, `AUSENTE`, `JUSTIFICADO` |

---

## 2. Planes anuales — `/api/v1/training-plans`

| Método | Path | Rol | Descripción |
|--------|------|-----|-------------|
| `POST` | `/api/v1/training-plans` | ADMIN | Crear plan → `201` |
| `GET` | `/api/v1/training-plans` | ADMIN/COACH | Lista (⚠️ sin paginar) |
| `GET` | `/api/v1/training-plans/{id}` | ADMIN/COACH | Detalle **con jerarquía de ciclos** |
| `PUT` | `/api/v1/training-plans/{id}` | ADMIN | Parcial (solo campos no nulos) |
| `DELETE` | `/api/v1/training-plans/{id}` | ADMIN | Soft delete → `204` |
| `POST` | `/api/v1/training-plans/{planId}/cycles` | ADMIN | Agregar ciclo → `201` |
| `GET` | `/api/v1/training-plans/{planId}/cycles` | ADMIN/COACH | Ciclos del plan (lista plana) |

### `CreateTrainingPlanRequest`

```json
{ "name": "Plan 2026", "startDate": "2026-01-01", "endDate": "2026-12-31", "description": "..." }
```

`name` obligatorio (máx 150), `startDate`/`endDate` obligatorias (`YYYY-MM-DD`),
`endDate ≥ startDate` (si no: `400` con mensaje en `errors`). **No hay duplicado de
nombre validado a nivel de plan.**

### `TrainingPlanResponse` y `TrainingPlanDetailResponse`

```json
// TrainingPlanResponse (lista/crear/editar)
{ "id": 1, "name": "Plan 2026", "startDate": "2026-01-01", "endDate": "2026-12-31",
  "description": "...", "active": true }

// TrainingPlanDetailResponse (GET /{id}) — mesociclos con microciclos anidados
{
  "id": 1, "name": "Plan 2026", "startDate": "...", "endDate": "...",
  "description": "...", "active": true,
  "cycles": [
    { "id": 10, "type": "MESOCICLO", "name": "Base Enero", "startDate": "...",
      "endDate": "...", "orderIndex": 1, "parentCycleId": null,
      "children": [
        { "id": 11, "type": "MICROCICLO", "name": "Semana 1", "orderIndex": 1,
          "parentCycleId": 10, "children": [] }
      ] }
  ]
}
```

La jerarquía viene **ya montada y ordenada** (`orderIndex`, luego `startDate`) — el front
no necesita re-ensamblarla. `GET /{planId}/cycles` devuelve la lista **plana** (con
`parentCycleId`) por si se prefiere.

### `CreateCycleRequest` y reglas de jerarquía (respuestas `400`)

```json
{ "type": "MICROCICLO", "name": "Semana 1", "startDate": "2026-01-05",
  "endDate": "2026-01-11", "orderIndex": 1, "parentCycleId": 10 }
```

Reglas de negocio que devuelven `400` (`ValidationException`, campo `errors`):

- Un `MICROCICLO` **exige `parentCycleId`** apuntando a un `MESOCICLO` del mismo plan.
- Un `MESOCICLO` **no puede tener padre**.
- `endDate < startDate` → error.
- **Nombre de ciclo duplicado dentro del mismo plan** → error.
- Las fechas del ciclo deben estar dentro del rango de su padre/plan (validación de rango).

El front puede pre-validar todas estas reglas porque tiene el árbol del plan en memoria.

---

## 3. Sesiones — `/api/v1/training-sessions` y `/api/v1/training-cycles/{cycleId}/sessions`

| Método | Path | Rol | Descripción |
|--------|------|-----|-------------|
| `POST` | `/api/v1/training-cycles/{cycleId}/sessions` | ADMIN/COACH | Crear sesión en ciclo → `201` |
| `GET` | `/api/v1/training-cycles/{cycleId}/sessions` | ADMIN/COACH | Sesiones del ciclo, ordenadas por fecha |
| `POST` | `/api/v1/training-sessions` | ADMIN/COACH | Crear sesión suelta (puede llevar `cycleId`) |
| `GET` | `/api/v1/training-sessions/{id}` | ADMIN/COACH | Detalle **con asistencia embebida** |
| `PUT` | `/api/v1/training-sessions/{id}` | ADMIN/COACH | Parcial |
| `PUT` | `/api/v1/training-sessions/{id}/status` | ADMIN/COACH | Cambio de estado |
| `DELETE` | `/api/v1/training-sessions/{id}` | ADMIN | Soft delete → `204` |

> Si en `POST /training-sessions` el body trae `cycleId`, debe coincidir con el de la ruta
> cuando se usa el endpoint anidado (si no: `400`).

### `CreateSessionRequest` / `UpdateSessionRequest`

```json
{
  "cycleId": 10,
  "disciplineId": 11,
  "sessionDate": "2026-01-06",
  "startTime": "07:30:00",
  "status": "PROGRAMADA",
  "volume": 4000,
  "intensity": 75,
  "distance": 3000.0,
  "observations": "Trabajo aeróbico"
}
```

| Campo | Tipo | Validación |
|-------|------|-----------|
| `cycleId`, `disciplineId` | number | opcionales |
| `sessionDate` | `YYYY-MM-DD` | **obligatoria** |
| `startTime` | `HH:mm:ss` | opcional |
| `status` | enum | opcional (default `PROGRAMADA` en servidor) |
| `volume` | int | 0–100000 (p.ej. metros) |
| `intensity` | int | 0–100 (%) |
| `distance` | number | ≥ 0 |
| `observations` | string | libre |

`UpdateSessionRequest` = mismos campos, todos opcionales (parcial). `PUT .../status` recibe
solo `{ "status": "EJECUTADA" }`.

### `SessionResponse` / `SessionDetailResponse`

```json
{ "id": 100, "cycleId": 10, "disciplineId": 11, "sessionDate": "2026-01-06",
  "startTime": "07:30:00", "status": "PROGRAMADA", "volume": 4000, "intensity": 75,
  "distance": 3000.0, "observations": "...", "active": true
  // SessionDetailResponse añade: "attendance": [ AttendanceResponse... ]
}
```

---

## 4. Asistencia — upsert por `(sessionId, athleteId)`

| Método | Path | Rol | Descripción |
|--------|------|-----|-------------|
| `POST` | `/api/v1/training-sessions/{sessionId}/attendance` | ADMIN/COACH | **Upsert** asistencia → `201` (aunque actualice) |
| `GET` | `/api/v1/training-sessions/{sessionId}/attendance` | ADMIN/COACH | Lista de la sesión |
| `GET` | `/api/v1/athletes/{athleteId}/attendance` | ADMIN/COACH | Historial del deportista, ordenado por fecha |

### `RegisterAttendanceRequest` / `AttendanceResponse`

```json
// request
{ "athleteId": 1, "status": "PRESENTE" }

// response
{ "id": 55, "sessionId": 100, "sessionDate": "2026-01-06", "athleteId": 1,
  "athleteFullName": "Michael Phelps", "status": "PRESENTE" }
```

- Es **upsert**: registrar dos veces al mismo atleta en la misma sesión **actualiza** el
  estado (no duplica). El front puede re-marcar asistencia sin borrar nada.
- `400` si la sesión está `CANCELADA` — no admite asistencia.
- Para armar la planilla de pase de lista: `GET /training-sessions/{id}` ya trae la
  asistencia; los atletas **sin marcar simplemente no aparecen**.

---

## 5. Alertas de ausencias consecutivas — `/api/v1/alerts/attendance`

| Método | Path | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/v1/alerts/attendance` | ADMIN/COACH | Alertas activas (⚠️ sin paginar) |
| `POST` | `/api/v1/alerts/attendance/{athleteId}/acknowledge` | ADMIN | "Reconocer" alerta |

### `AttendanceAlertResponse`

```json
{ "athleteId": 1, "athleteFullName": "Michael Phelps",
  "consecutiveAbsenceCount": 4, "lastAbsenceDate": "2026-01-20" }
```

### ⚠️ DEUDA — semántica del acknowledge (crítico para la UX)

- Las alertas **no son filas de DB**: se derivan calculando rachas de `AUSENTE`
  consecutivos sobre el historial. Umbral configurable `TRAINING_ABSENCE_THRESHOLD`
  (default **3**).
- La racha la rompe un `PRESENTE` **o un `JUSTIFICADO`**.
- `POST .../acknowledge` **no persiste nada** (deuda conocida, `AlertService` es
  read-only): la próxima vez que se consulte `GET /alerts/attendance`, **la alerta
  reaparecerá** si la racha sigue viva.
- **Implicación para el front:** el acknowledge actual solo sirve como validación/vista
  previa. Si la UI necesita "marcar como vista", debe hacerlo **localmente** (store con
  `athleteId` + `lastAbsenceDate` como clave) y NO confiar en el servidor. Visible con
  más detalle en `09`/D3.

---

## 6. Flujos de UI típicos

- **Planificación:** árbol Plan → mesociclos → microciclos desde `GET /training-plans/{id}`;
  crear sesión desde el nodo del microciclo (endpoint anidado) o suelta.
- **Pase de lista:** abrir sesión (`GET /training-sessions/{id}`) → listar deportistas
  (de `GET /athletes`) → marcar PRESENTE/AUSENTE/JUSTIFICado con un `POST` por atleta
  (el upsert permite correcciones).
- **Bandeja de alertas:** `GET /alerts/attendance` → tarjeta por deportista con racha y
  fecha; botón "reconocer" solo visible para ADMIN y con comportamiento local (⚠️ arriba).

---

**Anterior:** `04-contrato-api-deportistas.md` · **Siguiente:** `06-contrato-api-chequeos.md`
