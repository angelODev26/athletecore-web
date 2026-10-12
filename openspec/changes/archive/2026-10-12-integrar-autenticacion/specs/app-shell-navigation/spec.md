# specs/app-shell-navigation/spec.md (delta)

## MODIFIED Requirements

### Requirement: Rutas públicas y privadas
El sistema SHALL exponer `/login` y `/registro` como rutas públicas y proteger el resto; un usuario sin sesión o con token expirado MUST ser redirigido a `/login`.

#### Scenario: Acceder sin sesión
- **WHEN** un usuario sin token navega a una ruta privada
- **THEN** es redirigido a `/login`

#### Scenario: Token expirado en arranque
- **WHEN** el token persistido ha pasado su `exp`
- **THEN** la sesión se limpia y redirige a `/login`

#### Scenario: Usuario autenticado va al login
- **WHEN** un usuario con sesión vigente navega a `/login` o `/registro`
- **THEN** es redirigido al dashboard

### Requirement: Navegación filtrada por rol
El sistema SHALL mostrar únicamente las opciones de navegación permitidas para los roles presentes en el JWT; entrenamientos SHALL ser visible solo para ADMIN/COACH.

#### Scenario: Usuario sin rol de entrenamiento
- **WHEN** un usuario sin rol COACH ni ADMIN abre la app
- **THEN** la opción de entrenamientos no aparece en la navegación
