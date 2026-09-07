# 02 — Autenticación y Seguridad (impacto directo en el front)

> Fuentes: `SecurityConfig.java`, `JwtService.java`, `AuthService.java`,
> `RestAuthenticationEntryPoint.java`, `RestAccessDeniedHandler.java`, migraciones V2/V3.
> Este es **el archivo más importante del paquete** junto con el `08`: define cómo el front
> se autentica, qué pasa cuando el token expira y qué puede ver cada rol.

---

## 1. Modelo: JWT stateless, solo access token

- Login emite **un único access token JWT firmado con HS256**. **NO existe refresh token.**
- Expiración configurada: **`JWT_EXPIRATION`, default 24 h** (`86400000` ms).
- **No hay endpoint de logout** (stateless: el servidor no guarda sesiones; "cerrar sesión"
  es simplemente que el front descarte el token).
- **No hay endpoint `/me`** — los datos del usuario vienen dentro de la respuesta del login
  (ver archivo `03`).

### Claims del token (decodificable en el front)

```json
{
  "sub": "<username>",
  "userId": 123,
  "roles": ["ROLE_USER", "ROLE_ADMIN"],
  "iat": 1757193600,
  "exp": 1757280000
}
```

El front **puede decodificar el JWT** para obtener username, userId, roles y expiración
sin ninguna llamada extra. Eso es intencional: no hay endpoint alternativo para obtenerlos.

### Cómo enviar el token

```
Authorization: Bearer <token>
```

en todas las peticiones excepto las públicas (§3).

---

## 2. ⚠️ Expiración de sesión — la decisión de UX más importante

Como **no hay refresh token**, cuando el token expira (24 h) cualquier petición devuelve
**401** y el usuario debe **volver a hacer login**. Esto está marcado en `TASKS.md` como
bloqueante a decidir ANTES de construir las pantallas de auth (ver archivo `09`, D1).

Comportamiento que el front debe implementar hoy:

1. Guardar token + `expiresIn` (ms) que devuelve el login.
2. Interceptor/outbound: adjuntar `Authorization` si hay token.
3. Interceptor/inbound: **ante cualquier `401` → limpiar sesión y redirigir a login**
   (el API no distingue "token expirado" de "token inválido": ambos son 401).
4. Opcional pero recomendado: usar el claim `exp` para avisar/redirigir antes de expirar.

---

## 3. Matriz de acceso (exacta, del `SecurityConfig`)

### Públicos (sin token)

| Método | Path |
|--------|------|
| `POST` | `/api/v1/auth/login` |
| `POST` | `/api/v1/users` (registro — siempre crea con `ROLE_USER`) |

### Restringidos por rol a nivel de URL (`hasAnyRole("ADMIN","COACH")`)

| Path pattern | Roles |
|---|---|
| `/api/v1/training-plans/**` | ADMIN, COACH |
| `/api/v1/training-cycles/**` | ADMIN, COACH |
| `/api/v1/training-sessions/**` | ADMIN, COACH |
| `/api/v1/alerts/attendance/**` | ADMIN, COACH |
| `/api/v1/athletes/*/attendance` | ADMIN, COACH |

> Un usuario `ROLE_USER` autenticado recibe **403** en cualquiera de estos paths.

### Restringidos por `@PreAuthorize` a nivel de método (en los controllers)

| Endpoint | Rol |
|---|---|
| `GET /api/v1/users` | ADMIN |
| `POST/PUT/DELETE /api/v1/national-reference-times/**` (tabla nacional) | ADMIN |

(La lista completa por endpoint está en los archivos `03`–`07`.)

### Todo lo demás: solo requiere estar autenticado

Athletes CRUD, checkups, reportes… cualquier rol válido (`ROLE_USER` incluido) accede.
**No hay restricción de propiedad** (un USER puede ver todos los deportistas, no solo "los suyos").

---

## 4. Roles existentes en el sistema

| Rol | Sembrado en | Qué puede hacer (resumen) |
|-----|------------|---------------------------|
| `ROLE_USER` | Migración V2 | Todo lo autenticado excepto lo restringido arriba |
| `ROLE_ADMIN` | Migración V2 | Todo + gestión de usuarios + tabla nacional de referencia |
| `ROLE_COACH` | Migración V3 | Entrenamientos, asistencia y alertas |

- Un usuario puede tener **varios roles** (claim `roles` es un array).
- **Todo registro público recibe únicamente `ROLE_USER`** (`UserService.createUser`, hardcoded).
  No existe endpoint para cambiar roles → los ADMIN/COACH se crean a mano en DB (ver `01` §5).
- Si en el futuro se quieren "entrenadores se registran solos", hace falta cambio de backend
  (decisión pendiente, ver `09`).

### Modelo sugerido de roles en el front

```
USER  → dashboards de consulta (deportistas, chequeos, reportes)
COACH → + planificación, sesiones, asistencia, alertas
ADMIN → + gestión de usuarios + tabla nacional de referencia
```

El front debe ocultar/deshabilitar rutas por rol usando el claim `roles` del JWT,
sabiendo que **el back siempre re-valida** (ocultar es UX, no seguridad).

---

## 5. Formato de errores de autenticación/autorización

Los handlers de seguridad devuelven el **mismo `ErrorResponse` JSON que el resto de la API**
(formato completo en archivo `08`):

### `401 Unauthorized` — sin token, token inválido o expirado

```json
{ "status": 401, "error": "Unauthorized", "message": "Autenticación requerida" }
```

- Origen: `RestAuthenticationEntryPoint` (filtro de seguridad).
- También 401 con `"message": "Credenciales inválidas"` en login fallido
  (`InvalidCredentialsException` — no distingue usuario inexistente de password errónea,
  deliberadamente, para no filtrar usuarios).

### `403 Forbidden` — autenticado pero sin el rol

```json
{ "status": 403, "error": "Forbidden", "message": "Acceso denegado" }
```

- Origen: `RestAccessDeniedHandler`.

**Distinción clave para el front:** `401` → a login; `403` → pantalla de "sin permisos",
NO a login.

---

## 6. Otros hechos de seguridad que afectan al front

- **CSRF deshabilitado** (API stateless con Bearer, no cookies): el front puede llamar
  desde cualquier origen permitido sin tokens CSRF.
- **`allow-credentials: true`** está activo cuando CORS está habilitado — compatible con
  bearer tokens en header. La elección de dónde guardar el token (memoria vs
  `localStorage`) es del front; el back es agnóstico. (Recomendación estándar:
  `localStorage` aquí es aceptable dado el perfil de riesgo y que no hay refresh token
  que proteger; decisión final del equipo front.)
- **Contraseñas**: BCrypt(12). Política de password en registro: mínimo 6 caracteres
  (débil — la robustez extra, si se quiere, se valida en front; ver `03`).
- **No hay** rate limiting ni bloqueo por fuerza bruta (backlog POST-v1.0.0). El front
  puede implementar su propio "debounce"/deshabilitar botón tras N intentos, pero no debe
  esperar 429 del servidor.
- **Swagger UI y `/v3/api-docs` también exigen JWT** — no asumir que son públicos.

---

**Anterior:** `01-infraestructura-y-setup.md` · **Siguiente:** `03-contrato-api-usuarios.md`
