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
