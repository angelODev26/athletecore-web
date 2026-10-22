# 03 — Contrato API: Autenticación y Usuarios

> Fuentes: `AuthController`, `UserController`, `UserService`, `AuthService` y los DTOs de
> `user/dto/`. Convenciones de error y tipos comunes: archivo `08`.
> Base URL: `http://localhost:8080`

---

## 1. Resumen de endpoints

| # | Método | Path | Auth | Descripción |
|---|--------|------|------|-------------|
| 1 | `POST` | `/api/v1/auth/login` | 🌐 Público | Login → JWT + refresh token |
| 2 | `POST` | `/api/v1/auth/refresh` | 🌐 Público | Renueva el access token |
| 3 | `POST` | `/api/v1/users` | 🔒 `ROLE_ADMIN` | Alta de usuario con roles (registro público cerrado) |
| 4 | `GET` | `/api/v1/users` | 🔒 `ROLE_ADMIN` | Lista completa de usuarios (⚠️ sin paginar) |

**No existen** (no los diseñes en el front): `GET /users/{id}`, `PUT`, `DELETE`,
cambio de password, `/me`, logout. Si el front los necesita, son features de
backend nuevas (ver `09`).

---

## 2. `POST /api/v1/auth/login` 🌐

Autentica y devuelve el token JWT. Único camino para obtener token.

### Request body

```json
{
  "username": "jdoe",
  "password": "secret123"
}
```

| Campo | Tipo | Validación |
|-------|------|-----------|
| `username` | string | `@NotBlank` — "El nombre de usuario es obligatorio" |
| `password` | string | `@NotBlank` — "La contraseña es obligatoria" |

### Response `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
  "type": "Bearer",
  "expiresIn": 86400000,
  "user": {
    "id": 1,
    "username": "jdoe",
    "email": "jdoe@mail.com",
    "firstName": "John",
    "lastName": "Doe",
    "enabled": true,
    "active": true,
    "roles": ["ROLE_ADMIN"]
  }
}
```

| Campo | Tipo | Notas |
|-------|------|-------|
| `token` | string | JWT HS256; claims: `sub`, `userId`, `roles[]`, `iat`, `exp` |
| `refreshToken` | string | JWT para `POST /auth/refresh` |
| `type` | string | Siempre literal `"Bearer"` |
| `expiresIn` | number (long) | **Milisegundos** de vigencia (default `86400000` = 24 h). NO es timestamp; es duración |
| `user` | `UserResponse` | Ver §4 |

### Errores

| Status | Cuándo | `message` |
|--------|--------|-----------|
| `400` | username/password vacíos | Mensaje de validación correspondiente |
| `401` | Credenciales incorrectas | `"Credenciales inválidas"` |

> ⚠️ Usuario inexistente y password errónea devuelven **el mismo 401 con el mismo mensaje**
> (deliberado, anti-enumeración). El front no puede distinguirlos ni debe intentarlo.

---

## 3. `POST /api/v1/users` 🔒 `ROLE_ADMIN` — Alta de usuario

Crea un usuario nuevo con los roles indicados. **El registro público está cerrado**:
la regla de URL y el `@PreAuthorize` exigen `ROLE_ADMIN`. El primer ADMIN nace del
seed Flyway del back (P3), no de esta pantalla ni de un flujo de bootstrap del front.

### Request body

```json
{
  "username": "jdoe",
  "email": "jdoe@mail.com",
  "firstName": "John",
  "lastName": "Doe",
  "password": "secret123",
  "confirmPassword": "secret123",
  "roles": ["COACH"]
}
```

| Campo | Tipo | Validación (mensaje exacto) |
|-------|------|------------------------------|
| `username` | string | obligatorio, **3–50 chars** — `"Username must be between 3 and 50 characters"` |
| `email` | string | obligatorio, formato email — `"Email should be valid"` |
| `firstName` | string | obligatorio, máx 100 chars |
| `lastName` | string | obligatorio, máx 100 chars |
| `password` | string | obligatorio, **mín 8 chars** — `"Password must be at least 8 characters"` |
| `confirmPassword` | string | obligatorio; debe igualar `password` (validado en servicio, no en DTO) |
| `roles` | string[] | **opcional**; `ADMIN`/`COACH`/`USER` o `ROLE_*`, sin distinguir mayúsculas. Se normaliza a `ROLE_*`, se deduplica y se ordena. Ausente o vacío → `ROLE_USER`. Un valor fuera del catálogo → `400` `"Rol inválido: <valor>"` |

> Nota: los mensajes de validación de este DTO están en **inglés** (mejorable; el front
> debería mapear por campo y no mostrar el texto crudo — estrategia en archivo `08`).

### Response `201 Created`

Devuelve `UserResponse` (§4) del usuario creado, con `roles` en orden alfabético.
**No devuelve token**: el ADMIN crea la cuenta y el usuario inicia sesión después.

### Errores

| Status | Cuándo | `message` |
|--------|--------|-----------|
| `400` | Validación de campos fallida | Mensaje(es) por campo |
| `400` | `password` ≠ `confirmPassword` | `"Las contraseñas no coinciden"` |
| `400` | Rol fuera del catálogo | `"Rol inválido: <valor>"` |
| `401` | Sin token / token expirado | `"Autenticación requerida"` |
| `403` | Autenticado sin `ROLE_ADMIN` | `"Acceso denegado"` |
| `409` | Username ya existe | `"User with username already exists"` |
| `409` | Email ya existe | `"User with email already exists"` |
| `409` | Conflicto de integridad (p. ej. username de una cuenta con soft delete o carrera) | `"El recurso ya existe o entra en conflicto con una restricción de integridad"` |

---

## 4. `GET /api/v1/users` 🔒 `ROLE_ADMIN`

Lista **todos** los usuarios activos. Uso previsto: pantalla de administración de usuarios.

```json
[
  { "id": 1, "username": "jdoe", "email": "jdoe@mail.com", "firstName": "John",
    "lastName": "Doe", "enabled": true, "active": true, "roles": ["ROLE_ADMIN"] }
]
```

- ⚠️ **Sin paginación** — lista completa en memoria. Bloqueante conocido (ver `08`/TASKS):
  el front debe renderizar con virtualización/paginación client-side hasta que el back pagine.
- `roles` viaja ordenado alfabéticamente (`ROLE_ADMIN`, `ROLE_COACH`, `ROLE_USER`) y
  coincide con el claim `roles` del JWT.

### Errores

| Status | Cuándo |
|--------|--------|
| `401` | Sin token / token expirado |
| `403` | Autenticado sin `ROLE_ADMIN` |

---

## 5. `UserResponse` — shape completo

```json
{
  "id": 1,
  "username": "jdoe",
  "email": "jdoe@mail.com",
  "firstName": "John",
  "lastName": "Doe",
  "enabled": true,
  "active": true,
  "roles": ["ROLE_ADMIN"]
}
```

| Campo | Tipo | Significado |
|-------|------|-------------|
| `id` | number (Long) | ID interno |
| `username` | string | Único |
| `email` | string | Único |
| `firstName` / `lastName` | string | |
| `enabled` | boolean | Cuenta habilitada (flag de la entidad) |
| `active` | boolean | `!deleted` — derivado del soft delete; siempre `true` en la práctica (los borrados se filtran) |
| `roles` | string[] | Nombres `ROLE_*` persistidos, ordenados alfabéticamente; mismo contenido que el claim `roles` del JWT |

---

## 6. Flujo de UI sugerido (derivado del contrato)

```
[Login] ──POST /auth/login──► guarda tokens+user → app
[ADMIN] /usuarios ──dialog──► POST /users (roles) → 201 → lista invalidada
[Primer admin] seed Flyway del back → login → /usuarios operativo
[Sesión expirada] cualquier 401 → borra token → Login
[Rol insuficiente] 403 → pantalla "Acceso denegado"
```

- El estado "quién soy" se reconstruye del `user` guardado en el login o decodificando
  el JWT (`sub`, `userId`, `roles`). Sin endpoint `/me`, ésa es la única fuente.
- El front recupera la sesión leyendo el token persistido (si lo guardó) y validando
  `exp` localmente.
- No existe `/registro`: la creación de cuentas vive SOLO en el dialog de `/usuarios`
  para ADMIN. El registro público se retiró en el mismo corte que cerró `POST /users`.

---

**Anterior:** `02-autenticacion-y-seguridad.md` · **Siguiente:** `04-contrato-api-deportistas.md`
