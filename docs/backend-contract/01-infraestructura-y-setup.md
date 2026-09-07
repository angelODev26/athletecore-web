# 01 — Infraestructura y Setup (levantar el backend para desarrollar el front)

> Este archivo explica cómo tener el backend corriendo en `localhost:8080` para desarrollar
> el frontend contra él. Extraído de `application.properties`, `application-local.properties`,
> `docker-compose.yml`, `.env.example`, `CorsConfig.java` y `OpenApiConfig.java`.

---

## 1. Formas de levantar el backend (elige UNA)

### Opción A — Recomendada para dev de front: BD en Docker + app con Maven

```bash
# 1. Levantar solo PostgreSQL (Flyway corre al arrancar la app)
docker-compose up -d postgres

# 2. Crear .env desde la plantilla (solo la primera vez)
cp .env.example .env   # edita DB_USER/DB_PASSWORD/JWT_SECRET si quieres

# 3. Arrancar la API con el perfil local (fallbacks de dev, CORS habilitado)
export SPRING_PROFILES_ACTIVE=local
export $(grep -v '^#' .env | xargs)   # o exporta las vars una a una
./mvnw spring-boot:run
```

El perfil `local` (`application-local.properties`) es el pensado para esto:
sondea credenciales con fallback (`postgres`/`postgres`), habilita **CORS para
`http://localhost:3000` y `http://localhost:5173`**, expone Actuator
(`health`, `info`, `metrics`) y deja logging DEBUG de SQL/seguridad.

### Opción B — Todo en Docker

```bash
docker-compose --profile development up -d --build
```

⚠️ El "hot-reload" de `app-dev` es manual: monta `./target/classes`, así que tras
cambiar código hay que `./mvnw package -DskipTests && docker-compose restart app-dev`.
Para un dev de front que **no toca el back**, la Opción A es más simple.

### Verificación rápida

```bash
curl http://localhost:8080/api/v1/users               # → 401 (es lo correcto: requiere JWT)
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"...","password":"..."}'            # → 200 con token
```

---

## 2. Variables de entorno relevantes

| Variable | Para qué | Default dev (perfil `local`) |
|----------|----------|------------------------------|
| `DB_URL` | JDBC de PostgreSQL | `jdbc:postgresql://localhost:5432/athletecore` |
| `DB_USER` / `DB_PASSWORD` | Credenciales DB | `postgres` / `postgres` (solo local) |
| `JWT_SECRET` | Firma de tokens (mín. 32 chars) | fallback inseguro solo en `local` ⚠️ |
| `JWT_EXPIRATION` | Expiración del token en ms | `86400000` (24 h) |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma | `http://localhost:3000,http://localhost:5173` (solo `local`) |
| `SERVER_PORT` | Puerto HTTP | `8080` |

### ⚠️ Inconsistencia conocida de nombres de variable (deuda)

El código lee **`CORS_ORIGINS`** y **`JWT_EXPIRATION`**, pero `docker-compose.yml`
inyecta **`CORS_ALLOWED_ORIGINS`** y **`JWT_EXPIRATION_MS`**. Consecuencia práctica:

- En **Opción A** todo funciona (usa los nombres correctos).
- En **Opción B** (Docker `app-dev`), CORS queda **sin orígenes** → CORS deshabilitado →
  el navegador bloqueará las llamadas del front. Workaround: añadir también
  `CORS_ORIGINS`/`JWT_EXPIRATION` al `environment` de `app-dev`, o usar Opción A.
  (Documentado como pendiente en `09-decisiones-deuda-y-pendientes.md`.)

---

## 3. CORS — comportamiento exacto

La política vive en `CorsConfig.java` + `CorsProperties`:

- **Sin orígenes configurados → CORS deshabilitado por completo** (filtro devuelve `null`;
  el navegador bloquea toda llamada cross-origin). Este es el default fuera del perfil `local`.
- Con orígenes configurados: `allowed-methods: GET,POST,PUT,DELETE,OPTIONS`,
  `allowed-headers: *`, `allow-credentials: true`, aplicado a `/**`.
- Perfil `local` ya trae `http://localhost:3000` y `http://localhost:5173` (Vite) listos.
  Si el front usa otro puerto: `CORS_ORIGINS=http://localhost:PUERTO`.

**Implicación para el front:** en desarrollo basta el perfil `local`. En cualquier despliegue
real (staging/prod) CORS estará deshabilitado salvo que se configure `CORS_ORIGINS`
explícitamente — no es un bug, es la política de seguridad elegida.

---

## 4. Swagger / OpenAPI

- Dependencia **springdoc** configurada (`OpenApiConfig.java`).
- UI: `http://localhost:8080/swagger-ui.html` · JSON: `http://localhost:8080/v3/api-docs`.
- ⚠️ **Están protegidos por JWT** como cualquier endpoint de esta API privada
  (decisión explícita, ver comentario de `OpenApiConfig`). Para usarlos: login →
  botón "Authorize" en Swagger UI con `Bearer <token>`.
- El esquema de seguridad declarado es `bearerAuth` (HTTP Bearer JWT).
- El contrato OpenAPI es generado del código (anotaciones mínimas); los archivos
  `03`–`07` de este handoff son la referencia curada y más legible.

---

## 5. Base de datos

- PostgreSQL 15. Migraciones Flyway `V1`→`V5` **se aplican solas al arrancar la app**
  (no hace falta el servicio `flyway` de compose para dev).
- `ddl-auto=validate`: Hibernate nunca toca el esquema.
- Los **roles se seedean por migración**: `ROLE_USER` y `ROLE_ADMIN` (V2), `ROLE_COACH` (V3).
- ⚠️ **No hay usuario admin seedeado.** Todos los registros vía `POST /api/v1/users` reciben
  siempre `ROLE_USER`. Para tener un ADMIN o COACH en local hay que asignarlo a mano en la DB:

  ```sql
  INSERT INTO user_roles (user_id, role_id)
  VALUES (<user_id>, (SELECT id FROM roles WHERE name = 'ROLE_ADMIN'));
  ```

  (verificar nombre exacto de la tabla puente en V1 — puede variar; esto está detallado
  en el archivo `02`.)

---

## 6. Puertos y URLs de referencia

| Servicio | URL |
|----------|-----|
| API | `http://localhost:8080` |
| PostgreSQL | `localhost:5432` (db `athletecore`) |
| Swagger UI | `http://localhost:8080/swagger-ui.html` (requiere JWT) |
| Actuator (solo perfil `local`) | `/actuator/health`, `/actuator/info`, `/actuator/metrics` |

---

**Anterior:** `00-vision-general.md` · **Siguiente:** `02-autenticacion-y-seguridad.md`
