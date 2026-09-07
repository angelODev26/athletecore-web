# 04 — Contrato API: Deportistas (Athlete Domain)

> Fuentes: `AthleteController`, `AthleteRegistrationService`, `AthleteProfileService`,
> `AthleteSportService`, `SportService`, DTOs de `athlete/dto/`, entidades `Athlete`,
> `AthleteProfile`, `Sport`, `Discipline`.
> Acceso: **todos los endpoints de este módulo solo requieren autenticación** (cualquier rol),
> salvo `POST /api/v1/athletes/sports` que es **solo ADMIN**.

---

## 1. Resumen de endpoints

| # | Método | Path | Auth | Descripción |
|---|--------|------|------|-------------|
| 1 | `POST` | `/api/v1/athletes` | Auth | Crear deportista |
| 2 | `GET` | `/api/v1/athletes?page=&size=&sort=` | Auth | **Único listado paginado de la API** |
| 3 | `GET` | `/api/v1/athletes/{id}` | Auth | Detalle de deportista |
| 4 | `PUT` | `/api/v1/athletes/{id}` | Auth | Actualización parcial |
| 5 | `DELETE` | `/api/v1/athletes/{id}` | Auth | Soft delete → `204 No Content` |
| 6 | `POST` | `/api/v1/athletes/{id}/profile` | Auth | Upsert perfil antropométrico |
| 7 | `GET` | `/api/v1/athletes/{id}/profile` | Auth | Consultar perfil |
| 8 | `POST` | `/api/v1/athletes/{id}/sports` | Auth | Reemplazar deportes asignados |
| 9 | `GET` | `/api/v1/athletes/{id}/sports` | Auth | IDs de deportes del deportista |
| 10 | `GET` | `/api/v1/athletes/sports` | Auth | Catálogo de deportes activos |
| 11 | `POST` | `/api/v1/athletes/sports` | 🔒 ADMIN | Crear deporte en el catálogo |

> ⚠️ Ojo con el orden de rutas: `GET /api/v1/athletes/sports` (catálogo) vs
> `GET /api/v1/athletes/{id}/sports` (de un atleta). Spring los resuelve bien; el front
> debe cuidar no confundirlos al generar URLs.

**No existen:** CRUD de disciplinas (las disciplinas existen en DB y aparecen como IDs en
`SportResponse`, pero la API no expone cómo crearlas/editarlas), subida de foto (solo URL),
búsqueda/filtro de deportistas (solo paginación), relación deportista↔usuario (son tablas
independientes: un `Athlete` NO está vinculado a una cuenta `User`).

---

## 2. Deportistas

### `POST /api/v1/athletes` → `201 Created`

```json
{
  "username": "mphelps",
  "email": "mphelps@club.com",
  "firstName": "Michael",
  "lastName": "Phelps",
  "photoUrl": "https://cdn.ejemplo.com/fotos/mphelps.jpg"
}
```

| Campo | Tipo | Validación |
|-------|------|-----------|
| `username` | string | obligatorio, 3–255 chars |
| `email` | string | obligatorio, formato email, máx 255 |
| `firstName` / `lastName` | string | obligatorio, máx 100 |
| `photoUrl` | string | opcional — **es solo una URL; no hay upload de archivos** |

> ⚠️ **`birthDate` NO se puede enviar en el create** (el DTO no lo tiene). Solo se puede
> establecer vía `PUT` posterior. Si el formulario de alta incluye fecha de nacimiento,
> el front debe encadenar `POST` + `PUT` (o pedir cambio de back — ver `09`).

**Errores:** `400` validación · `409` username o email duplicado
(`"Athlete with username already exists"` / `"Athlete with email already exists"`).

### `GET /api/v1/athletes` → `200 OK` — paginado (Spring `Page`)

Query params estándar de Spring Data: `page` (0-based), `size` (default 20),
`sort=campo,asc|desc` (p.ej. `sort=lastName,asc`).

```json
{
  "content": [ { "id": 1, "username": "mphelps", "...": "..." } ],
  "pageable": { "pageNumber": 0, "pageSize": 20, "sort": { "sorted": false, ... } },
  "totalElements": 57,
  "totalPages": 3,
  "last": false,
  "first": true,
  "numberOfElements": 20,
  "size": 20,
  "number": 0,
  "empty": false
}
```

El front solo necesita `content`, `totalElements`, `totalPages`, `number` (página actual)
y `last`/`first`. **Este es EL modelo de paginación de referencia**; los demás listados de
la API aún no lo usan (ver `08`).

### `GET /api/v1/athletes/{id}` → `200 OK` · 404 si no existe o está borrado

### `PUT /api/v1/athletes/{id}` → `200 OK` — actualización parcial

Solo se actualizan los campos enviados no nulos:

```json
{ "firstName": "Michael", "lastName": "Phelps", "birthDate": "1985-06-30", "photoUrl": "..." }
```

Todos opcionales; `birthDate` es `LocalDate` ISO (`YYYY-MM-DD`). No se puede cambiar
`username` ni `email` por API.

### `DELETE /api/v1/athletes/{id}` → `204 No Content`

Soft delete: desaparece de listados y su `GET` da 404. Sin undo. El front debe pedir
confirmación antes de llamarlo.

### `AthleteResponse` (respuesta de crear/obtener/actualizar/listar)

```json
{
  "id": 1,
  "username": "mphelps",
  "email": "mphelps@club.com",
  "firstName": "Michael",
  "lastName": "Phelps",
  "fullName": "Michael Phelps",
  "birthDate": "1985-06-30",
  "photoUrl": "https://...",
  "active": true
}
```

`fullName` ya viene concatenado (no hace falta componerlo en el front).
**No incluye** deportes ni perfil: hay que llamar a los endpoints 6–9 por separado.

---

## 3. Perfil antropométrico (1:1 con deportista)

### `POST /api/v1/athletes/{id}/profile` → `200 OK` (upsert)

Crea el perfil si no existe, lo actualiza si existe. **No es `PUT` ni cambia de status code.**

```json
{
  "weightKgs": 79.50,
  "heightCm": 193.0,
  "armSpanCm": 203.0,
  "notes": "Medición pre-temporada"
}
```

| Campo | Tipo | Validación |
|-------|------|-----------|
| `weightKgs` | number | **obligatorio**, 1.0–500.0 kg (2 decimales) |
| `heightCm` | number | **obligatorio**, 10.0–300.0 cm (1 decimal) |
| `armSpanCm` | number | opcional, 10.0–300.0 cm |
| `notes` | string | opcional, texto libre |

### `GET /api/v1/athletes/{id}/profile` → `200 OK` · 404 si el atleta no tiene perfil aún

```json
{
  "id": 5,
  "weightKgs": 79.50,
  "heightCm": 193.0,
  "armSpanCm": 203.0,
  "bmi": 21.24,
  "bmiCategory": "Normal",
  "notes": "Medición pre-temporada",
  "isComplete": true
}
```

- `bmi` y `bmiCategory` los **calcula el servidor** (no enviarlos). `bmiCategory` es uno de:
  `"Bajo peso"` (<18.5), `"Normal"` (<25), `"Sobrepeso"` (<30), `"Obesidad"` (≥30) — strings
  en español, literales, aptos para mostrar tal cual.
- `isComplete` = tiene peso + talla + envergadura.
- Si falta peso o talla, `bmi` y `bmiCategory` vienen en `null`.

---

## 4. Deportes (catálogo) y asignación

### `GET /api/v1/athletes/sports` → `200 OK` (catálogo completo, sin paginar)

```json
[
  { "id": 1, "name": "Natación", "description": "...", "active": true, "disciplineIds": [10, 11] }
]
```

`disciplineIds` es solo una lista de IDs — **no hay endpoint para resolver el nombre de una
disciplina** (deuda UX conocida, ver `09`/D4). Las disciplinas se crean por DB/seed.

### `POST /api/v1/athletes/{id}/sports` → `200 OK` — **reemplazo total**

```json
{ "sportIds": [1, 3] }
```

- `sportIds`: set obligatorio, **mínimo 1, máximo 10**.
- ⚠️ Semántica de **reemplazo**: la asignación anterior se sustituye por completo
  (`athlete.setSports(...)`). Para "quitar un deporte" hay que reenviar la lista sin él.
  Conflicto de dominio: no se puede dejar al atleta sin deportes por este endpoint
  (mín 1).
- Respuesta: `[1, 3]` — **lista de IDs**, no objetos.
- Errores: `404` si el atleta o algún `sportId` no existe (o está borrado).

### `GET /api/v1/athletes/{id}/sports` → `200 OK` → `[1, 3]` (solo IDs)

El front resuelve nombres cruzando con el catálogo (`GET /api/v1/athletes/sports`),
que cabe en memoria fácilmente (cachearlo client-side).

### `POST /api/v1/athletes/sports` 🔒 ADMIN → `201 Created`

```json
{ "name": "Natación", "description": "Piscina 50m" }
```

`name` obligatorio (máx 100), `description` opcional. No hay edición ni borrado de
deportes por API.

---

## 5. Implicaciones de UX derivadas del contrato

- **Ficha de deportista** necesita hasta 4 llamadas: `GET /{id}` + `GET /{id}/profile`
  (tolerar 404 = "sin perfil") + `GET /{id}/sports` + catálogo de deportes cacheado.
- Formulario de alta en **2 pasos** (datos básicos → `PUT` con `birthDate`) o pedir el
  cambio del DTO al back antes de diseñar el wizard definitivo (decisión en `09`).
- El avatar es un `<img src={photoUrl}>` con fallback; no hay endpoint de subida.
- El selector de deportes debe operar sobre **conjunto completo** (enviar siempre la
  selección final, 1–10).

---

**Anterior:** `03-contrato-api-usuarios.md` · **Siguiente:** `05-contrato-api-entrenamientos.md`
