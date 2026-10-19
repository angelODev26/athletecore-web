# specs/app-shell-navigation/spec.md (delta)

## MODIFIED Requirements

### Requirement: Rutas públicas y privadas
El sistema SHALL exponer únicamente `/login` como ruta pública y proteger el
resto; un usuario sin sesión o con token expirado MUST ser redirigido a
`/login`. La ruta pública de registro `/registro` MUST desaparecer (el registro
abierto se cierra: la creación de usuarios vive en `/usuarios` solo para ADMIN,
tras el prerrequisito P1 del back que cierra `POST /users` público).

#### Scenario: Acceder sin sesión
- **WHEN** un usuario sin token navega a una ruta privada
- **THEN** es redirigido a `/login`

#### Scenario: Token expirado en arranque
- **WHEN** el token persistido ha pasado su `exp`
- **THEN** la sesión se limpia y redirige a `/login`

#### Scenario: Usuario autenticado va al login
- **WHEN** un usuario con sesión vigente navega a `/login`
- **THEN** es redirigido al dashboard

#### Scenario: La ruta de registro ya no existe
- **WHEN** cualquiera navega a `/registro`
- **THEN** no existe ruta de registro y se muestra el estado de error de ruta

### Requirement: Navegación filtrada por rol
El sistema SHALL mostrar únicamente las opciones de navegación permitidas para
los roles presentes en el JWT; entrenamientos SHALL ser visible solo para
ADMIN/COACH, tabla nacional SHALL ser visible solo para ADMIN, y usuarios SHALL
ser visible solo para ADMIN.

#### Scenario: Usuario sin rol de entrenamiento
- **WHEN** un usuario sin rol COACH ni ADMIN abre la app
- **THEN** la opción de entrenamientos no aparece en la navegación

#### Scenario: Tabla nacional solo para ADMIN
- **WHEN** un COACH o USER abre la app
- **THEN** la opción "Tabla nacional" no aparece en la navegación

#### Scenario: ADMIN ve tabla nacional
- **WHEN** un ADMIN abre la app
- **THEN** la opción "Tabla nacional" aparece en la navegación y lleva a
  `/tabla-nacional`

#### Scenario: Usuarios solo para ADMIN
- **WHEN** un COACH o USER abre la app
- **THEN** la opción "Usuarios" no aparece en la navegación

#### Scenario: ADMIN ve usuarios
- **WHEN** un ADMIN abre la app
- **THEN** la opción "Usuarios" aparece en la navegación y lleva a `/usuarios`
