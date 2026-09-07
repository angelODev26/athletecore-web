# 03 — Contrato API: Autenticación y Usuarios

> Fuentes: `AuthController`, `UserController`, `UserService`, `AuthService` y los DTOs de
> `user/dto/`. Convenciones de error y tipos comunes: archivo `08`.
> Base URL: `http://localhost:8080`

---

## 1. Resumen de endpoints

| # | Método | Path | Auth | Descripción |
|---|--------|------|------|-------------|
| 1 | `POST` | `/api/v1/auth/login` | 🌐 Público | Login → JWT |
| 2 | `POST` | `/api/v1/users` | 🌐 Público | Registro de usuario (siempre `ROLE_USER`) |
| 3 | `GET` | `/api/v1/users` | 🔒 `ROLE_ADMIN` | Lista completa de usuarios (⚠️ sin paginar) |

**No existen** (no los diseñes en el front): `GET /users/{id}`, `PUT`, `DELETE`,
cambio de password, `/me`, logout, refresh. Si el front los necesita, son features
de backend nuevas (ver `09`).

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
  "type": "Bearer",
  "expiresIn": 86400000,
  "user": {
    "id": 1,
    "username": "jdoe",
    "email": "jdoe@mail.com",
    "firstName": "John",
    "lastName": "Doe",
    "enabled": true,
    "active": true
  }
}
```

| Campo | Tipo | Notas |
|-------|------|-------|
| `token` | string | JWT HS256; claims: `sub`, `userId`, `roles[]`, `iat`, `exp` |
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

## 3. `POST /api/v1/users` 🌐 — Registro

Crea un usuario nuevo. **Público por diseño** (registro abierto). El usuario creado
recibe **siempre y solo `ROLE_USER`** — esto está hardcodeado en `UserService.createUser`.

### Request body

```json
{
  "username": "jdoe",
  "email": "jdoe@mail.com",
  "firstName": "John",
  "lastName": "Doe",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

| Campo | Tipo | Validación (mensaje exacto) |
|-------|------|------------------------------|
| `username` | string | obligatorio, **3–50 chars** — `"Username must be between 3 and 50 characters"` |
| `email` | string | obligatorio, formato email — `"Email should be valid"` |
| `firstName` | string | obligatorio, máx 100 chars |
| `lastName` | string | obligatorio, máx 100 chars |
| `password` | string | obligatorio, **mín 6 chars** — `"Password must be at least 6 characters"` |
| `confirmPassword` | string | obligatorio; debe igualar `password` (validado en servicio, no en DTO) |

> Nota: los mensajes de validación de este DTO están en **inglés** (mejorable; el front
> debería mapear por campo y no mostrar el texto crudo — estrategia en archivo `08`).

### Response `201 Created`

Devuelve `UserResponse` (§4) del usuario creado. **No devuelve token**: tras registrarse,
el flujo esperado es que el front haga login (o mueva al usuario a la pantalla de login).

### Errores

| Status | Cuándo | `message` |
|--------|--------|-----------|
| `400` | Validación de campos fallida | Mensaje(es) por campo |
| `400` | `password` ≠ `confirmPassword` | `"Las contraseñas no coinciden"` |
| `409` | Username ya existe | `"User with username already exists"` |
| `409` | Email ya existe | `"User with email already exists"` |

---

## 4. `GET /api/v1/users` 🔒 `ROLE_ADMIN`

Lista **todos** los usuarios activos. Uso previsto: pantalla de administración de usuarios.

```json
[
  { "id": 1, "username": "jdoe", "email": "jdoe@mail.com", "firstName": "John",
    "lastName": "Doe", "enabled": true, "active": true }
]
```

- ⚠️ **Sin paginación** — lista completa en memoria. Bloqueante conocido (ver `08`/TASKS):
  el front debe renderizar con virtualización/paginación client-side hasta que el back pagine.
- ⚠️ **La respuesta NO incluye los roles del usuario** — `UserResponse` no tiene campo
  `roles`. Una tabla de admin "con columna de rol" no es posible hoy sin cambio de backend
  (candidato a decisión pendiente, ver `09`).

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
  "active": true
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

---

## 6. Flujo de UI sugerido (derivado del contrato)

```
[Login] ──POST /auth/login──► guarda token+user → app
[Registro] ──POST /users──► OK → redirige a Login (no hay auto-login)
[Sesión expirada] cualquier 401 → borra token → Login
[Rol insuficiente] 403 → pantalla "Acceso denegado"
```

- El estado "quién soy" se reconstruye del `user` guardado en el login o decodificando
  el JWT (`sub`, `userId`, `roles`). Sin endpoint `/me`, ésa es la única fuente.
- Tras F5, el front recupera la sesión leyendo el token persistido (si lo guardó) y
  validando `exp` localmente.

---

**Anterior:** `02-autenticacion-y-seguridad.md` · **Siguiente:** `04-contrato-api-deportistas.md`
