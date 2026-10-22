# autenticacion-sesion Specification

## Purpose

Autenticación y sesión del SPA contra `POST /api/v1/auth/login`: login real,
ciclo de vida del token persistido con expiración proactiva por claim `exp`, y
autorización por claims `roles[]` (ocultar es UX; el back siempre re-valida). El
registro público está cerrado: la creación de usuarios vive en `gestion-usuarios`
(solo ADMIN). Sin refresh token hoy (D1) — la capa de sesión vive tras la
abstracción `AuthTokens { access, refresh? }`: la expiración termina en re-login.

## Requirements
### Requirement: Login real contra la API
El sistema SHALL autenticar al usuario contra `POST /api/v1/auth/login` con `username` y `password`; ante 200 SHALL persistir el token y el resto de claims decodificables; ante 401 SHALL mostrar "Credenciales inválidas" en un validation banner con `role="alert"` situado sobre las acciones del formulario.

#### Scenario: Credenciales correctas
- **WHEN** el usuario envía credenciales válidas
- **THEN** el sistema guarda el token y redirige al dashboard

#### Scenario: Credenciales incorrectas
- **WHEN** el servidor responde 401
- **THEN** se muestra un validation banner con `role="alert"` y el formulario conserva el username (no la password)

#### Scenario: Sin distinción anti-enumeración
- **WHEN** el usuario no existe o la password es errónea
- **THEN** el mensaje mostrado es idéntico en ambos casos

### Requirement: Ciclo de vida de la sesión
El sistema SHALL persistir el token en `localStorage` y SHALL considerar vencida la sesión usando el claim `exp` (o `expiresIn` en ms si falta el claim); al expirar SHALL limpiar la sesión y redirigir a `/login` sin esperar una llamada fallida.

#### Scenario: Hidratación con token vigente
- **WHEN** la app arranca con un token sin expirar en `localStorage`
- **THEN** la sesión se restaura sin pasar por login

#### Scenario: Expiración proactiva
- **WHEN** llega el instante `exp` con la app abierta
- **THEN** la sesión se limpia y el usuario va a `/login`

### Requirement: Autorización por claims
El sistema SHALL derivar roles del JWT (`roles[]`, prefijo `ROLE_` normalizado) y SHALL ocultar la navegación no permitida; en URL restringida por rol SHALL mostrar el estado "sin permisos" si el servidor responde 403, nunca redirigir a login.

#### Scenario: Usuario sin rol de entrenamientos
- **WHEN** un USER ve la navegación
- **THEN** no aparece el ítem "Entrenamientos"

#### Scenario: 403 en una ruta protegida
- **WHEN** el backend responde 403
- **THEN** se muestra el estado "sin permisos" permaneciendo en la ruta

#### Scenario: Logout
- **WHEN** el usuario pulsa "Cerrar sesión"
- **THEN** el token se descarta localmente y va a `/login` (el back es stateless)
