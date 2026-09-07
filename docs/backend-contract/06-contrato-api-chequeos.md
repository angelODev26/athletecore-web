# 06 — Contrato API: Chequeos Mensuales (Checkup Domain)

> Fuentes: `CheckupController`, `NationalReferenceTimeController`, `CheckupService`,
> `TimeComparisonService`, `MedalProjectionService`, `ClassificationService`,
> `TimeFormatter`, enums `SwimmingStyle`, `CheckupCategory`, `Classification`,
> DTOs de `checkup/dto/`.
>
> 🔐 **Autorización mixta** (ojo, difiere del resto de módulos):
> - Crear/borrar chequeos y agregar tiempos: **ADMIN/COACH** (`@PreAuthorize`).
> - Lectura de chequeos, comparación y proyecciones: **cualquier autenticado**.
> - Tabla nacional: lectura **cualquier autenticado**; CRUD **solo ADMIN**.

---

## 1. Conceptos y enums (dominio de natación competitiva)

| Enum | Valores (string exacto) | Dónde se usa |
|------|------------------------|--------------|
| `SwimmingStyle` | `LIBRE`, `ESPALDA`, `BRAZA`, `MARIPOSA`, `COMBINADO` | `style` en tiempos y referencias |
| `CheckupCategory` | `INFANTIL`, `JUVENIL`, `MAYOR` | `category` en chequeo y referencias |
| `Classification` | `POR_ENCIMA_DEL_PODIO`, `CERCANO_A_MEDALLERIA`, `FUERA_DE_RANGO` | respuesta de proyección |

- Los enums en requests aceptan **minúsculas** (el servidor normaliza a mayúsculas antes
  de validar): `"libre"` → `LIBRE`. Aun así, el front debería enviar mayúsculas.
- Estos enums son **catálogo cerrado pero extensible sin migración** (se valida en DTO,
  no en DB): si el negocio agrega un estilo/categoría, el cambio es solo de código
  (decisión D1 del change de checkup).

### El modelo de tiempos: segundos decimales + string formateado

Esta es la convención más particular del módulo. **Toda respuesta trae doble representación:**

- `timeSeconds` — `BigDecimal`, segundos con hasta 3 decimales: `65.250`.
- `timeFormatted` — string `mm:ss.fff` (o `hh:mm:ss.fff` si ≥ 1 h): `"01:05.250"`.

**El front no debe formatear tiempos: usar `timeFormatted` tal cual.** Para cálculos
(ordenar, graficar) usar `timeSeconds`.

- En los **requests** se envía **solo `timeSeconds`** (número). Si el front ofrece input
  `mm:ss.ms`, debe convertirlo a segundos antes de enviar (regla del back: los dígitos
  tras el punto son milisegundos — "1.25" = 1.250 s).
- Los deltas (`diffVsBronzeSeconds`, `absoluteDiffSeconds`) vienen también en doble formato
  (`...Formatted` con signo explícito: `"-00:02.000"` = la prueba es **más rápida**;
  `+` = más lenta).

---

## 2. Chequeos — `/api/v1/athletes/{athleteId}/checkups` y `/api/v1/checkups`

| # | Método | Path | Rol | Descripción |
|---|--------|------|-----|-------------|
| 1 | `POST` | `/api/v1/athletes/{athleteId}/checkups` | ADMIN/COACH | Crear chequeo mensual → `201` |
| 2 | `GET` | `/api/v1/athletes/{athleteId}/checkups?year=&month=` | Auth | Lista (⚠️ sin paginar) con filtros opcionales |
| 3 | `GET` | `/api/v1/checkups/{id}` | Auth | Detalle **con tiempos embebidos** |
| 4 | `DELETE` | `/api/v1/checkups/{id}` | ADMIN/COACH | Soft delete → `204` |
| 5 | `POST` | `/api/v1/checkups/{checkupId}/times` | ADMIN/COACH | Agregar tiempo de prueba → `201` |
| 6 | `GET` | `/api/v1/checkups/{checkupId}/comparison` | Auth | Comparación vs tabla nacional |
| 7 | `GET` | `/api/v1/athletes/{athleteId}/projections` | Auth | Proyección de medallería |

> **No hay `PUT`** de chequeos ni de tiempos: para corregir un tiempo hay que… registrar
> otro (el duplicado da 409) o borrar el chequeo completo. Limitación a conocer antes de
> diseñar la pantalla de edición (ver `09`).

### `POST /api/v1/athletes/{athleteId}/checkups` → `201`

```json
{
  "athleteId": 1,
  "year": 2026,
  "month": 3,
  "category": "JUVENIL",
  "notes": "Chequeo de marzo"
}
```

| Campo | Validación |
|-------|-----------|
| `athleteId` | obligatorio, positivo; debe coincidir con el `{athleteId}` de la ruta |
| `year` | obligatorio, 1900–2100 |
| `month` | obligatorio, 1–12 |
| `category` | obligatorio, `INFANTIL|JUVENIL|MAYOR` (acepta minúsculas) |
| `notes` | opcional |

**Regla de unicidad:** un deportista solo puede tener UN chequeo activo por
`(athleteId, year, month, category)` → duplicado = `409`
(`"Checkup ya existe con athleteId/year/month/category..."`).

`CheckupResponse`:

```json
{ "id": 20, "athleteId": 1, "year": 2026, "month": 3, "category": "JUVENIL",
  "notes": "...", "createdAt": "2026-03-05T10:15:00Z", "updatedAt": "...",
  "active": true }
```

⚠️ **Excepción de convención:** este módulo SÍ expone `createdAt`/`updatedAt` (formato ISO
con zona, `Instant`). Útil para el timeline; no asumir que otros módulos lo hacen.

### `POST /api/v1/checkups/{checkupId}/times` → `201`

```json
{ "style": "LIBRE", "distance": 100, "timeSeconds": 65.250 }
```

- `style`: enum; `distance`: entero ≥ 1 (metros); `timeSeconds`: > 0.
- **Unicidad:** un chequeo no admite dos tiempos con el mismo `(style, distance)` → `409`.
  Registrar 50m y 100m libre sí es válido.

`CheckupTimeResponse`:

```json
{ "id": 30, "checkupId": 20, "style": "LIBRE", "distance": 100,
  "timeSeconds": 65.250, "timeFormatted": "01:05.250" }
```

### `GET /api/v1/checkups/{checkupId}/comparison` → `200` (una entrada por tiempo registrado)

```json
[
  {
    "style": "LIBRE",
    "distance": 100,
    "category": "JUVENIL",
    "trialTimeSeconds": 65.250,
    "trialTimeFormatted": "01:05.250",
    "positions": [
      { "position": 1, "referenceTimeSeconds": 60.000, "referenceTimeFormatted": "01:00.000",
        "absoluteDiffSeconds": 5.250, "absoluteDiffFormatted": "+00:05.250",
        "relativeDiffPercent": 8.750 },
      { "position": 2, "...": "..." },
      { "position": 3, "...": "..." }
    ]
  }
]
```

- `position` 1 = oro, 2 = plata, 3 = bronce de la tabla nacional.
- Signo del delta: **negativo = más rápido que la referencia** (bueno), positivo = más lento.
- ⚠️ **`409` si falta el triple de referencia**: la comparación exige que existan las 3
  posiciones (1°, 2°, 3°) activas para ese `(style, distance, category)`. Si el admin no
  cargó la tabla completa, este endpoint falla con 409 y mensaje explicativo — el front
  debe manejarlo como estado "referencia incompleta", no como error genérico.

### `GET /api/v1/athletes/{athleteId}/projections` → `200` (una entrada por style+distance
del último tiempo disponible del atleta)

```json
[
  {
    "style": "LIBRE",
    "distance": 100,
    "category": "JUVENIL",
    "classification": "CERCANO_A_MEDALLERIA",
    "timeSeconds": 63.800,
    "timeFormatted": "01:03.800",
    "diffVsBronzeSeconds": 0.500,
    "diffVsBronzeFormatted": "+00:00.500"
  }
]
```

- `classification` se calcula contra el **3° puesto** (bronce):
  - `POR_ENCIMA_DEL_PODIO` — tiempo ≤ bronce.
  - `CERCANO_A_MEDALLERIA` — por encima del bronce pero dentro del umbral
    (default **1.500 s**, configurable server-side con
    `CHECKUP_MEDAL_PROXIMITY_THRESHOLD_SECONDS`).
  - `FUERA_DE_RANGO` — resto.
- ⚠️ **No es histórico ni está persistido**: se calcula en el momento a partir de los
  tiempos activos (decisión D5 del módulo, sin tabla `medal_projections`). Cada llamada
  recalcula; puede ser costosa con muchos datos y NO se puede consultar "qué proyección
  tenía en marzo" (no hay snapshots).

---

## 3. Tabla nacional de referencia — `/api/v1/national-reference-times`

| Método | Path | Rol | Descripción |
|--------|------|-----|-------------|
| `POST` | `/api/v1/national-reference-times` | ADMIN | Crear → `201` |
| `GET` | `/api/v1/national-reference-times` | Auth | Lista (⚠️ sin paginar; DTO compacto) |
| `GET` | `/api/v1/national-reference-times/{id}` | Auth | Detalle |
| `PUT` | `/api/v1/national-reference-times/{id}` | ADMIN | Actualización **completa** |
| `DELETE` | `/api/v1/national-reference-times/{id}` | ADMIN | Soft delete → `204` |

### `NationalReferenceTimeRequest` (POST y PUT usan el mismo — 5 campos obligatorios)

```json
{ "style": "LIBRE", "distance": 100, "category": "JUVENIL", "position": 3, "timeSeconds": 63.300 }
```

`position`: 1–3. El modelo mental: **cada fila es una posición del podio** para una
combinación (style, distance, category). Cargar la tabla = crear 3 filas por combinación.

### Respuestas

```json
// Lista (compacta, sin timestamps)
{ "id": 7, "style": "LIBRE", "distance": 100, "category": "JUVENIL",
  "position": 3, "timeSeconds": 63.300, "timeFormatted": "01:03.300" }

// Detalle (CRUD) — añade createdAt / updatedAt
{ "id": 7, "...": "...", "createdAt": "...", "updatedAt": "..." }
```

### Implicación de UX para la pantalla de administración

La UI natural es una **matriz por (style, distance, category) con 3 celdas de tiempo**
(oro/plata/bronce). La API es por fila; el front debe:

1. `GET /national-reference-times` → agrupar por `(style, distance, category)`.
2. Crear/editar cada posición con un `POST`/`PUT` por celda.
3. Advertir que la comparación de chequeos exige el **triple completo** (§2, 409).

---

## 4. Flujo de UI típico del módulo

```
Ficha atleta → pestaña "Chequeos"
  GET /athletes/{id}/checkups (filtro año/mes)
    → detalle GET /checkups/{id} (tiempos embebidos, tabla con timeFormatted)
    → botón "Comparar con referencia" → GET /checkups/{id}/comparison (manejar 409)
  Panel "Proyección de medallería" → GET /athletes/{id}/projections
    (badge por classification: verde/ámbar/gris)
```

---

**Anterior:** `05-contrato-api-entrenamientos.md` · **Siguiente:** `07-contrato-api-reportes.md`
