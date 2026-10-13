# Diseño: integrar-checkups

## Contexto

Contrato: `docs/backend-contract/06-contrato-api-chequeos.md` (fuente de verdad, junto a
`08` transversales y `09` deudas), verificado contra el código del back:
`CheckupController`, `NationalReferenceTimeController`, DTOs de `checkup/dto/`,
`TimeComparisonService.loadReferenceTriple` y `MedalProjectionService`.

**Autorización (doc 06, distinctiva del módulo):**

| Acción | Rol |
|---|---|
| Crear/borrar chequeo, agregar tiempo | ADMIN/COACH (`@PreAuthorize`) |
| Leer chequeos/detalle/comparación/proyección | cualquier autenticado |
| Leer tabla nacional | cualquier autenticado (pero la UI solo la muestra a ADMIN, C3) |
| CRUD tabla nacional | solo ADMIN |

Decisiones heredadas que aplican: **D2** (todo listado sin paginar en back salvo
athletes → client-side donde haga falta) y **D5** no aplica. Deuda **T5** (doc 09):
no hay `PUT` de chequeos ni tiempos, ni `DELETE` de tiempo individual → "corregir"
= borrar y recrear (C4).

## Decisiones (vinculantes para la implementación)

### C1. Ubicación de la UI: sub-ruta de la ficha + matriz en ruta propia

- Pestaña de chequeos: `athletes/:id/chequeos` (`AthleteCheckupsPage`), con enlace
  "Chequeos" desde `athlete-detail-page.tsx` (`data-testid="athlete-checkups-link"`).
- Detalle: `athletes/:id/chequeos/:checkupId` (`CheckupDetailPage`).
- Matriz: `tabla-nacional` (`NationalReferencePage`) bajo `RequireRoles(["ADMIN"])`.
- Se retira el ítem `{ to: "/checkups", label: "Chequeos" }` de `NAV_ITEMS` y se añade
  `{ to: "/tabla-nacional", label: "Tabla nacional", roles: ["ADMIN"] }`. Se borran la
  ruta `/checkups` del router y el placeholder `src/modules/checkups/checkups-page.tsx`.

### C2. Tiempos: el servidor formatea, el front solo parsea el input

- **Nunca** formatear un tiempo para mostrarlo: usar `timeFormatted`,
  `trialTimeFormatted`, `referenceTimeFormatted`, `absoluteDiffFormatted`,
  `diffVsBronzeFormatted` tal cual. Para ordenar tiempos usar `timeSeconds`
  (nunca comparar el `*Formatted`).
- Input en formularios: texto `mm:ss.fff` (acepta también `h:mm:ss.fff` y
  `m:ss.fff`), siempre con **exactamente 3 dígitos** tras el punto. Parser local
  estricto en `src/modules/checkups/format.ts`:

  ```ts
  export function parseTimeToSeconds(value: string): number | null
  // Acepta /^([0-5]?\d|[1-9]\d+):[0-5]\d\.\d{3}$/ con horas opcionales
  // /^(\d+):([0-5]?\d):([0-5]\d)\.(\d{3})$/; devuelve segundos (number) o null.
  // "01:05.250" → 65.25; "1:05.250" → 65.25; "0:12.000" → 12
  ```

- Al enviar, `timeSeconds` es un número (JSON number; BigDecimal del back serializa
  `63.300` como `63.3`, doc 08 §4 — no importa la representación decimal).
- Enums: el front **siempre envía mayúsculas** (el back normaliza, pero no depender
  de ello). Catálogo cerrado hoy; las etiquetas ES son solo presentación
  (`ESPALDA` → "Espalda", etc.; desconocido → mostrar el valor crudo para tolerar
  la extensión sin migración del doc 06 §1).

### C3. Roles: lectura abierta, escritura condicionada

- Las tres rutas son autenticadas; solo `/tabla-nacional` lleva
  `RequireRoles(["ADMIN"])`.
- Botones "Nuevo chequeo", "Agregar tiempo", "Corregir/Borrar": visibles solo con
  `hasAnyRole(roles, ["ADMIN", "COACH"])`. Acciones de celda en la matriz: la página
  entera es ADMIN. El back sigue siendo la autoridad: 403 → estado "sin permisos"
  del shell (handler global ya existente, no se reinventa).

### C4. Sin PUT de chequeos/tiempos (deuda T5): corregir = borrar y recrear

- No existe edición de chequeo ni de tiempo, ni borrado de un tiempo individual
  (verificado en `CheckupController`: solo POST/GET/DELETE). **Consecuencia dura:**
  corregir un solo tiempo implica borrar el chequeo completo (con todos sus tiempos)
  y recrearlo.
- La UI NO ofrece "editar". El detalle ofrece **"Borrar chequeo"** (ADMIN/COACH) con
  `alert-dialog` y copy explícita:

  > "No se pueden editar chequeos ni tiempos: borrar este chequeo elimina todos sus
  > tiempos. Para corregir un dato, vuelve a crear el chequeo tras borrarlo."

- Tras el `DELETE` (204) se navega de vuelta a la pestaña de chequeos del atleta.
- Deuda registrada en el change (no se corrige en este repo): pedir al back
  `PUT /checkups/{id}` / `DELETE /checkups/{id}/times/{timeId}`.

### C5. Errores: validación local completa + mensajes seguros

- Los 400 del back no son mapeables por campo (`details` concatena sin nombres,
  doc 08 §1 / deuda T1). **Los formularios validan en cliente las reglas EXACTAS del
  contrato** (verificadas en los DTOs Java, C8) y el 400 residual se muestra como
  mensaje global seguro vía `toUserFacingMessage` — nunca texto crudo.
- `src/lib/api/messages.ts`: añadir a `KNOWN_BACKEND_MESSAGES` los duplicados en
  inglés (emitidos por `DuplicateResourceException(String, String)`):
  - `"Checkup with athleteId/year/month/category already exists"` →
    "Ya existe un chequeo de ese año y mes para esta categoría"
  - `"CheckupTime with checkupId/style/distance already exists"` →
    "Ya existe un tiempo registrado para ese estilo y distancia en este chequeo"
  - `"NationalReferenceTime with style/distance/category/position already exists"` →
    "Ya existe una referencia para ese estilo, distancia, categoría y posición"
- **409 "triple incompleto"** de comparación/proyección: el mensaje es dinámico
  (`"No existe el triple completo ... para LIBRE 100m en categoría JUVENIL"`), no es
  clave de diccionario → helper nuevo en `checkups-api.ts`:

  ```ts
  /** 409 del contrato por triple de referencia incompleto (comparación/proyección). */
  export function isIncompleteReferenceError(error: unknown): boolean {
    return isApiError(error) && error.status === 409 &&
      error.payload.message.includes("triple completo");
  }
  ```

  Ambas vistas lo traducen a un **estado dedicado** "Referencia incompleta" (no un
  toast de error) con texto seguro y, si el usuario es ADMIN, enlace a
  `/tabla-nacional`.

### C6. Proyección: se renderiza tal cual llega (divergencia doc/código)

`docs/backend-contract/06` dice "una entrada por style+distance del último tiempo",
pero `MedalProjectionService.getProjectionsForAthlete` genera **una entrada por tiempo
activo de TODOS los chequeos del atleta** (puede repetir `(style, distance)` entre
meses distintos). **Gana el código**: la UI renderiza el array tal cual, sin
desduplicar ni seleccionar "el último". `classification` se muestra como badge
semántico (tokens de `DESIGN.md`, nunca colores literales):

| `classification` | Badge | Etiqueta ES |
|---|---|---|
| `POR_ENCIMA_DEL_PODIO` | `success` | "Por encima del podio" |
| `CERCANO_A_MEDALLERIA` | `warning` | "Cercano a medallería" |
| `FUERA_DE_RANGO` | variante neutra (sin relleno de status) | "Fuera de rango" |

El umbral de proximidad (1.5 s por defecto) **nunca** se replica en el front (regla
transversal: el front no calcula clasificaciones).

### C7. PUT de referencia es COMPLETO (los 5 campos)

`NationalReferenceTimeRequest` se usa tanto en POST como en PUT y **todos los campos
son obligatorios** (`@NotNull`/`@NotBlank` en los 5). En edición, el front envía los 5
campos de la fila (el form parte pre-cargado con los valores actuales). No existe el
problema "null = omitir" de otros módulos porque ningún campo es opcional; aun así,
el formulario impide dejar campos vacíos (validación local).

### C8. Capa de datos (hooks exactos, patrón `training-api.ts`)

Archivo `src/modules/checkups/checkups-api.ts`:

```ts
// Query keys
const CHECKUPS_ROOT_KEY = moduleQueryKey("checkups");
export function athleteCheckupsKey(athleteId: number, year?: number, month?: number);
export function checkupDetailKey(id: number);
export function athleteProjectionsKey(athleteId: number);
export const NATIONAL_REFERENCE_LIST_KEY = [...CHECKUPS_ROOT_KEY, "national-reference"] as const;

// Queries
useAthleteCheckups(athleteId, filters: { year?: number; month?: number })
// GET /athletes/{athleteId}/checkups — incluye `year`/`month` en la query string
// SOLO si están presentes (URLSearchParams condicional).
useCheckup(id)                       // GET /checkups/{id}
useAthleteProjections(athleteId)     // GET /athletes/{athleteId}/projections
useNationalReferenceTimes()          // GET /national-reference-times (sin paginar)

// Mutaciones (invalidaciones exactas)
useCreateCheckup(athleteId)    // POST /athletes/{athleteId}/checkups → invalida athleteCheckupsKey(athleteId) (todas las variantes de filtro)
useDeleteCheckup(id, athleteId) // DELETE /checkups/{id} → invalida athleteCheckupsKey(athleteId) + checkupDetailKey(id)
useAddCheckupTime(checkupId)   // POST /checkups/{checkupId}/times → invalida checkupDetailKey(checkupId)
useCreateReferenceTime()       // POST /national-reference-times → invalida NATIONAL_REFERENCE_LIST_KEY
useUpdateReferenceTime(id)     // PUT /national-reference-times/{id} (body COMPLETO) → invalida NATIONAL_REFERENCE_LIST_KEY
useDeleteReferenceTime(id)     // DELETE /national-reference-times/{id} → invalida NATIONAL_REFERENCE_LIST_KEY
```

`useCheckupComparison(checkupId, enabled: boolean)`: `GET /checkups/{id}/comparison`
con `enabled` controlado por el botón "Comparar" (**lazy**: no se dispara al entrar al
detalle), `retry: false` (el 409 es un estado de datos, no un fallo transitorio).
Invalidaciones de athletes: ninguna en este módulo (los chequeos no mutan athletes).

### C9. Matriz nacional: agrupación en memoria + aviso de triple incompleto

- `GET /national-reference-times` devuelve la lista plana (compacta, sin timestamps).
  El front agrupa en memoria por clave `${style}|${distance}|${category}`; cada grupo
  tiene hasta 3 celdas (position 1/2/3). Orden estable: `style`, `distance`,
  `category` (la lista puede ser grande (~5 estilos × n distancias × 3 categorías);
  se ofrecen filtros por estilo y categoría en cliente — sin paginación de momento,
  el volumen real es bajo y el filtro la reduce; si crece, migrar a slice como training).
- Si un grupo tiene < 3 posiciones activas → aviso en la fila: "Triple incompleto: la
  comparación de este estilo/distancia/categoría fallará" (testid por grupo).
- Alta/edición por celda en dialog (`position` viene fijada por la celda, no editable
  en edición; en alta sobre celda vacía de un grupo existente, style/distance/category
  pre-cargados y bloqueados; el select de posición solo en "nueva combinación").
  Borrado con `alert-dialog`.

### C10. Testids obligatorios

Convención del proyecto (los usan e2e-tester y los tests de módulo):

| testid | Dónde |
|---|---|
| `athlete-checkups-link` | ficha del atleta → pestaña chequeos |
| `athlete-checkups-page`, `checkups-filter-year`, `checkups-filter-month`, `checkups-list`, `checkup-new-button` | lista de chequeos |
| `projections-panel`, `projection-badge-{index}` | panel de proyección |
| `checkup-detail-page`, `checkup-times-table`, `time-style-select`, `time-distance-input`, `time-input`, `time-submit-button` | detalle del chequeo |
| `comparison-button`, `comparison-panel`, `comparison-incomplete-state`, `projections-incomplete-state` | comparación/proyección |
| `checkup-delete-button`, `checkup-delete-confirm` | borrado T5 |
| `reference-page`, `reference-matrix`, `reference-incomplete-warning-{style\|distance\|category}`, `reference-new-button`, `reference-form`, `reference-delete-confirm` | matriz nacional |

## DTOs exactos (añadir a `src/lib/api/types.ts`)

```ts
// --- Chequeos (contrato 06) ---
export type SwimmingStyle = "LIBRE" | "ESPALDA" | "BRAZA" | "MARIPOSA" | "COMBINADO";
export type CheckupCategory = "INFANTIL" | "JUVENIL" | "MAYOR";
export type Classification =
  | "POR_ENCIMA_DEL_PODIO"
  | "CERCANO_A_MEDALLERIA"
  | "FUERA_DE_RANGO";

export interface CheckupResponse {
  id: number;
  athleteId: number;
  year: number;
  month: number;
  category: string; // valores del enum; string para tolerar extensión sin migración (doc 06 §1)
  notes: string | null;
  createdAt: string; // Instant ISO-8601 UTC ("2026-03-05T10:15:00Z")
  updatedAt: string;
  active: boolean;
}

export interface CheckupTimeResponse {
  id: number;
  checkupId: number;
  style: string;
  distance: number;
  timeSeconds: number; // BigDecimal llega como JSON number (doc 08 §4)
  timeFormatted: string; // "mm:ss.fff" o "hh:mm:ss.fff" — usar tal cual
}

export interface CheckupDetailResponse extends CheckupResponse {
  times: CheckupTimeResponse[];
}

export interface CreateCheckupRequest {
  athleteId: number;
  year: number; // 1900–2100
  month: number; // 1–12
  category: CheckupCategory;
  notes?: string;
}

export interface AddCheckupTimeRequest {
  style: SwimmingStyle;
  distance: number; // entero >= 1
  timeSeconds: number; // > 0
}

export interface PositionComparison {
  position: number; // 1=oro, 2=plata, 3=bronce
  referenceTimeSeconds: number;
  referenceTimeFormatted: string;
  absoluteDiffSeconds: number; // negativo = prueba más rápida
  absoluteDiffFormatted: string; // con signo explícito ("+00:05.250")
  relativeDiffPercent: number;
}

export interface TimeComparisonResponse {
  style: string;
  distance: number;
  category: string;
  trialTimeSeconds: number;
  trialTimeFormatted: string;
  positions: PositionComparison[];
}

export interface MedalProjectionResponse {
  style: string;
  distance: number;
  category: string;
  classification: Classification;
  timeSeconds: number;
  timeFormatted: string;
  diffVsBronzeSeconds: number; // negativo = mejor que el bronce
  diffVsBronzeFormatted: string;
}

export interface NationalReferenceTimeListItemResponse {
  id: number;
  style: string;
  distance: number;
  category: string;
  position: number; // 1..3
  timeSeconds: number;
  timeFormatted: string;
}

export interface NationalReferenceTimeRequest {
  style: SwimmingStyle;
  distance: number; // entero >= 1
  category: CheckupCategory;
  position: number; // 1–3
  timeSeconds: number; // > 0
}
```

Validaciones locales a replicar (leídas de los DTOs Java — no inventar):

- `CreateCheckupRequest`: `year` 1900–2100, `month` 1–12, `category` ∈ enum,
  `notes` sin restricción (opcional, sin `@Size`). `athleteId` se toma de la ruta y
  se envía igual en el body (el back exige que coincidan).
- `AddCheckupTimeRequest`: `style` ∈ enum, `distance` entero ≥ 1, `timeSeconds` > 0
  (`@DecimalMin("0.0", inclusive = false)`).
- `NationalReferenceTimeRequest`: mismos + `position` 1–3. **No hay límites
  superiores** de distancia ni de tiempo: no inventarlos.
- Unicidad pre-validable en cliente con datos ya cargados:
  - Chequeo duplicado `(athleteId, year, month, category)` → el form de alta lo puede
    detectar con la lista ya cargada (sin filtro aplicado en ese momento); igualmente
    el 409 residual se mapea vía `KNOWN_BACKEND_MESSAGES`.
  - Tiempo duplicado `(style, distance)` dentro del chequeo → detectar contra
    `detail.times` antes de enviar.
  - Referencia duplicada `(style, distance, category, position)` → detectar contra la
    lista agrupada de la matriz.

## Estructura de archivos

```
src/modules/checkups/
  checkups-api.ts            — C8 (keys, hooks, isIncompleteReferenceError)
  format.ts                  — C2 (parseTimeToSeconds, etiquetas ES de enums)
  athlete-checkups-page.tsx  — C1 lista + filtros año/mes + alta dialog + proyección
  checkup-form.tsx           — dialog alta (ADMIN/COACH), validación local C5
  checkup-detail-page.tsx    — tiempos embebidos + comparación lazy + borrado T5
  time-form.tsx              — alta de tiempo (input mm:ss.fff → C2)
  projections-panel.tsx      — C6 badges semánticos
  comparison-panel.tsx       — tabla por posición, deltas con signo del servidor
  classification-badge.tsx   — badge por classification
  national-reference-page.tsx— C9 matriz ADMIN
  reference-form.tsx         — C7 alta/edición completa por celda
  *.test.tsx                 — tests por archivo (ver tasks.md)
```

Estados compartidos (`src/shared/components/states.tsx`) para carga/vacío/error en
todas las páginas; componentes shadcn existentes (`dialog`, `select`, `input`, `table`,
`badge`, `alert-dialog`, `form`) — instalar vía MCP solo si falta alguno.

## Verificación visual

Con el back local corriendo (`cd ~/athletecore-api && export $(grep -v '^#' .env | xargs) && SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run`, docker
`athletecore-postgres` arriba) y `npm run dev`:

- Login `admin.demo/secret123` (ADMIN): ficha atleta → Chequeos → alta + tiempo +
  comparación; `/tabla-nacional` matriz + alta/edición/borrado de celda.
- Login `demo.user/secret123` (USER): ve la pestaña y comparación en solo lectura;
  sin botones de escritura; `/tabla-nacional` por URL directa → "sin permisos".
- MCP playwright con `browser_snapshot`/`browser_evaluate` (nunca
  `browser_take_screenshot`).

## Deuda registrada (no se implementa)

- `PUT` de chequeos y tiempos, `DELETE` de tiempo individual (T5): pedir al back.
- Umbral de proyección configurable solo server-side (`CHECKUP_MEDAL_PROXIMITY_THRESHOLD_SECONDS`);
  el front no lo muestra ni lo asume.
