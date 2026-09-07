# AthleteCore — Flujo completo del sistema (diagramas)

> Estado **actual y verificado contra el código** (`develop` @ `293f0dd`, vía CodeGraph).
> 6 diagramas de secuencia: el 1 es la vista general; 2–6 detallan cada subsistema.
> Documentación de apoyo: `docs/frontend-handoff/` (00–09) en el repo del backend.
>
> **Leyenda:** ⚠️ rama de error · ⏱️ proceso programado · 🔒 restricción de rol ·
> 🕳️ comportamiento marcado como deuda técnica.

---

## 1. Vista general: anatomía de una request

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    autonumber
    actor C as Cliente (front)
    participant SEC as Filtro de seguridad
    participant CTL as Controller
    participant SVC as Service (negocio)
    participant DB as PostgreSQL

    C->>SEC: request con Authorization Bearer
    Note over SEC: Puntos de corte antes de la lógica de negocio
    alt ruta pública (registro o login)
        SEC->>CTL: pasa sin token
    else token ausente, inválido o expirado
        SEC-->>C: ⚠️ 401 Autenticación requerida
    else rol insuficiente para la ruta
        SEC-->>C: ⚠️ 403 Acceso denegado
    else token válido y rol correcto
        SEC->>CTL: request autorizada
    end

    CTL->>CTL: validación Jakarta del DTO
    alt validación falla
        CTL-->>C: ⚠️ 400 Error de validación
    else DTO válido
        CTL->>SVC: llama al servicio
        SVC->>DB: consulta o escritura (excluye soft-deleted)
        alt regla de negocio violada
            SVC-->>C: ⚠️ 404 / 409 / 400 vía GlobalExceptionHandler
        else OK
            SVC-->>CTL: datos
            CTL-->>C: 200/201/204 + DTO
        end
    end
```

**Notas:**
- Stateless total: sin sesiones, cookies ni CSRF; cada request se valida de cero (ver `02`).
- El filtro de soft delete (`deleted_at IS NULL`) está en JPA: ningún borrado lógico es
  visible en ningún paso posterior.
- Los errores llegan al front siempre con el mismo shape `ErrorResponse`, incluso los
  401/403 del filtro (ver `08` §1–2).
- Toda respuesta exitosa es un DTO recortado: el front nunca ve la entidad (ver `00` §4).

---

## 2. Autenticación y ciclo de vida de la sesión

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    autonumber
    actor U as Usuario
    participant F as Front
    participant L as AuthController
    participant J as AuthService + JwtService
    participant API as Endpoints protegidos

    U->>F: usuario y contraseña
    F->>L: POST /api/v1/auth/login
    L->>J: authenticate y generar token
    alt credenciales incorrectas o usuario inexistente
        J-->>F: ⚠️ 401 Credenciales inválidas (mismo mensaje en ambos casos)
    else autenticado
        J-->>F: 200 con token, expiresIn (24 h) y user
        Note over F: Token HS256 con claims sub, userId, roles, iat, exp.<br/>Sin refresh, sin logout, sin /me 🕳️
        loop cada llamada posterior
            F->>API: Authorization Bearer (token)
            alt token vigente
                API-->>F: 200/201/204 + DTO
            else expirado (24 h por defecto)
                API-->>F: ⚠️ 401 Autenticación requerida
                F->>U: 🕳️ re-login obligatorio (decisión D1)
            end
        end
    end
```

**Notas:**
- La sesión del lado del front vive en el token: "quién soy" = decodificar `sub`,
  `userId`, `roles` del JWT, o el objeto `user` guardado del login (ver `03` §2).
- El mensaje 401 del login es deliberadamente ambiguo (anti-enumeración): el front no debe
  intentar distinguir "usuario no existe" de "password incorrecta".
- `401` → redirigir a login. `403` → pantalla de sin permisos. Nunca mezclarlos (ver `02` §5).
- Registro (`POST /api/v1/users`) es público pero no encadena login: crea siempre con
  `ROLE_USER` y el usuario debe loguearse después (ver `03` §3, §6).

---

## 3. Deportistas: ciclo de vida de un atleta

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    autonumber
    actor F as Front (cualquier rol)
    participant AC as AthleteController
    participant REG as AthleteRegistrationService
    participant PROF as AthleteProfileService
    participant SPO as AthleteSportService
    participant DB as PostgreSQL

    F->>AC: POST /api/v1/athletes
    AC->>REG: registerAthlete (username, email, nombres, photoUrl)
    REG->>DB: buscar username/email
    alt ya existe alguno
        DB-->>REG: encontrado
        REG-->>F: ⚠️ 409 already exists
    else libre
        DB-->>REG: libre
        REG->>DB: insert
        REG-->>F: 201 AthleteResponse
    end

    Note over F,REG: birthDate no entra en el alta 🕳️<br/>se envía después por PUT (deuda T6)
    F->>AC: PUT /api/v1/athletes/{id} (parcial)
    AC->>REG: updateAthlete
    REG-->>F: 200 AthleteResponse

    F->>AC: POST /api/v1/athletes/{id}/profile
    AC->>PROF: upsertProfile (crea o reemplaza)
    PROF->>PROF: calcula BMI y categoría OMS
    PROF-->>F: 200 con bmi, bmiCategory, isComplete

    F->>AC: POST /api/v1/athletes/{id}/sports (1 a 10 IDs)
    AC->>SPO: assignSportsToAthlete
    SPO->>DB: verificar deportes activos
    alt algún sportId no existe
        SPO-->>F: ⚠️ 404 Sport not found
    else todos válidos
        SPO->>DB: 🕳️ REEMPLAZA el set completo (no agrega)
        SPO-->>F: 200 lista de IDs asignados
    end

    F->>AC: DELETE /api/v1/athletes/{id}
    AC->>REG: softDeleteAthlete
    REG->>DB: marcar deleted_at
    REG-->>F: 204 (desaparece de listados, GET da 404)
```

**Notas:**
- `GET /api/v1/athletes` es el **único listado paginado** de la API (`page/size/sort`,
  shape `Page` de Spring — ver `04` §2).
- La ficha completa de un atleta requiere 3–4 llamadas: detalle + perfil (tolerar 404 =
  "sin perfil") + sports + catálogo `GET /api/v1/athletes/sports` (cacheable, ver `04` §5).
- El BMI y su categoría se calculan **en el servidor**; el front solo los muestra, nunca
  los recalcula.
- La foto es solo una URL en `photoUrl`: no hay subida de archivos (decisión D5 pendiente).

---

## 4. Entrenamientos: planificación, asistencia y alertas

🔒 Todo este módulo exige rol **ADMIN o COACH**. Las escrituras marcadas 🔒🔒 son solo ADMIN.

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    autonumber
    actor CO as Coach/Admin
    participant PC as TrainingPlanController
    participant PS as TrainingPlanService
    participant SC as TrainingSessionController
    participant SS as TrainingSessionService
    participant A as AttendanceController/Service
    participant AL as AlertService
    participant DB as PostgreSQL

    Note over CO,AL: Fase 1 — Planificación
    CO->>PC: 🔒🔒 POST /training-plans
    PC->>PS: createPlan (nombre, fechas)
    PS-->>CO: ⚠️ 400 si endDate anterior a startDate
    PS-->>CO: 201 plan anual

    CO->>PC: 🔒🔒 POST /training-plans/{id}/cycles
    PC->>PS: addCycle (type, fechas, parentCycleId?)
    PS-->>CO: ⚠️ 400 si: microciclo sin padre, mesociclo con padre,<br/>fechas fuera del padre, o nombre repetido en el plan
    PS-->>CO: 201 ciclo (MESOCICLO o MICROCICLO)

    CO->>SC: POST sesión (en ciclo o suelta)
    SC->>SS: createSession
    SS-->>CO: 201 sesión PROGRAMADA

    Note over CO,AL: Fase 2 — Día de entrenamiento
    SC-->>CO: si sesión CANCELADA, toda asistencia lanza ⚠️ 400
    CO->>A: POST /training-sessions/{id}/attendance
    A->>DB: upsert por (sessionId, athleteId)
    A-->>CO: 201 asistencia (PRESENTE / AUSENTE / JUSTIFICADO)
    Note over CO,A: 🔁 Corrección = repetir el POST con otro estado

    Note over CO,AL: Fase 3 — Alertas (derivadas, no persistidas 🕳️)
    A->>DB: racha de AUSENTE ≥ 3 (umbral config)
    CO->>AL: GET /alerts/attendance
    AL-->>CO: 200 alertas activas (racha + última ausencia)
    CO->>AL: 🔒🔒 POST /alerts/attendance/{athleteId}/acknowledge
    AL-->>CO: 200 pero NO persiste nada 🕳️ (deuda D3)
    Note over A,AL: La alerta solo desaparece cuando<br/>se registra PRESENTE o JUSTIFICADO
```

**Notas:**
- `GET /training-plans/{id}` devuelve el árbol mesociclo→microciclo ya montado y ordenado
  (por `orderIndex`, luego fecha): el front no re-ensambla (ver `05` §2).
- El pase de lista se arma cruzando `GET /training-sessions/{id}` (trae la asistencia
  registrada) con el catálogo de atletas; quien no está marcado simplemente no aparece.
- Sesiones pueden existir sin ciclo (sueltas) y opcionalmente con `disciplineId` — pero
  las disciplinas no tienen endpoint de consulta (decisión D4 pendiente).
- El acknowledge es el único endpoint "falso mutante" de la API: tratarlo como acción
  visual/local hasta que el back lo persista (ver `09` D3).

---

## 5. Chequeos: del tiempo registrado a la proyección de medalla

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    autonumber
    actor CO as Coach/Admin
    participant CC as CheckupController
    participant CS as CheckupService
    participant TC as TimeComparisonService
    participant MP as MedalProjectionService
    participant DB as PostgreSQL

    CO->>CC: 🔒 POST /athletes/{id}/checkups (año, mes, categoría)
    CC->>CS: createCheckup
    CS->>DB: ¿ya existe (atleta, año, mes, categoría)?
    alt duplicado
        CS-->>CO: ⚠️ 409
    else libre
        CS-->>CO: 201 chequeo
    end

    loop 🔒 por cada prueba (style, distance)
        CO->>CC: POST /checkups/{id}/times (timeSeconds)
        CC->>CS: addCheckupTime
        CS-->>CO: ⚠️ 400 estilo/distancia/tiempo inválidos
        CS-->>CO: ⚠️ 409 si (style,distance) ya registrado 🕳️ no hay PUT (T5)
        CS-->>CO: 201 con timeSeconds + timeFormatted
    end

    CO->>CC: GET /checkups/{id}/comparison
    CC->>TC: compareCheckup
    TC->>DB: triple de referencia (1°,2°,3°) por (style,distance,category)
    alt triple incompleto
        TC-->>CO: ⚠️ 409 referencia nacional incompleta
    else completo
        TC-->>CO: 200 deltas vs oro/plata/bronce (negativo = más rápido)
    end

    CO->>CC: GET /athletes/{id}/projections
    CC->>MP: getProjectionsForAthlete
    MP->>DB: últimos tiempos activos + referencias
    MP->>MP: clasificar vs 3° puesto (umbral 1.5 s)
    MP-->>CO: 200 🕳️ cálculo en vivo, sin histórico (D5 checkup)
```

**Notas:**
- Prerequisito oculto de todo el módulo: la **tabla nacional** (`/national-reference-times`,
  CRUD 🔒 ADMIN) debe tener triples completos por combinación; si falta una posición, la
  comparación responde 409 — el front debe mostrar "referencia incompleta", no error (ver
  `06` §2–3).
- Tiempos siempre en doble formato: enviar `timeSeconds` (número), mostrar `timeFormatted`
  ("mm:ss.fff") tal cual (ver `06` §1).
- Clasificaciones posibles: `POR_ENCIMA_DEL_PODIO`, `CERCANO_A_MEDALLERIA`,
  `FUERA_DE_RANGO` (el umbral de 1.5 s es configurable en el servidor).
- Corregir un tiempo = borrar el chequeo y recrearlo; no existe edición (deuda T5).

---

## 6. Reportes: JSON vivo, PDF síncrono y scheduler

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    autonumber
    actor US as Usuario (autenticado)
    actor AD as Admin
    participant RC as ReportController
    participant RG as ReportGenerationService
    participant EX as ExportService (OpenPDF)
    participant RS as ReportScheduleController
    participant SCH as Scheduler (poll 60 s)
    participant DB as PostgreSQL

    Note over US,DB: A) Datos vivos para dashboards (sin PDF)
    US->>RC: GET /athletes/{id}/report
    RC-->>US: 200 evolución tiempos + asistencia + proyección
    US->>RC: GET /reports/team (category opcional)
    RC-->>US: 200 comparativo por (style,distance,category)

    Note over US,DB: B) Generación de PDF — síncrona 🕳️ (T3)
    US->>RC: 🔒 POST /reports (reportType, filtros, título)
    RC->>RG: generateReport
    RG->>DB: persiste PENDING
    RG->>EX: ensamblar datos y renderizar PDF
    EX->>DB: guarda binario en report_exports
    alt éxito
        RG-->>US: 201 con status GENERATED
    else fallo de ensamblado
        RG-->>US: 201 con status FAILED + errorMessage ⚠️
    end

    US->>RC: GET /reports/{id}/export
    RC->>DB: último export (binario)
    RC-->>US: 200 application/pdf + Content-Disposition
    Note over US: descargar con fetch + Bearer + Blob URL<br/>(un enlace <a> no lleva el JWT)

    Note over AD,DB: C) Programación ⏱️ (CRUD 🔒 ADMIN en escritura)
    AD->>RS: 🔒 POST /report-schedules (cron 6 campos, timezone, active)
    RS-->>AD: ⚠️ 400 si cron inválida — si no, 201 con nextRunAt
    loop ⏱️ cada 60 segundos
        SCH->>DB: schedulers con nextRunAt vencido
        SCH->>RG: ejecuta generación (mismo motor de B)
    end
    Note over US: los reportes programados aparecen en GET /reports
```

**Notas:**
- La generación responde 201 aunque falle por dentro: el front debe **leer `status`**
  (`GENERATED`/`FAILED`) en vez de asumir éxito por el 201 (ver `07` §3).
- El ciclo es síncrono hoy (PENDING→final dentro de la request); diseñar la UI con
  spinner + lectura de `status` deja lista la transición a async futuro.
- La expresión cron es de **6 campos (Spring)**, no la de 5 de Unix: la UI debería
  ocultarla tras presets y mostrar `nextRunAt` como confirmación.
- Los PDF se persisten como BYTEA en la base de datos (no hay S3/disco).

---

*Generado: 2026-09-06 · Fuente: código de `develop` verificado vía CodeGraph.*
