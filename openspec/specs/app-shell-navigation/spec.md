# app-shell-navigation Specification

## Purpose
Define el shell de la aplicación: navegación principal persistente, separación de rutas públicas y privadas con guards, filtrado de navegación por roles del JWT y los estados compartidos de UI (carga, vacío, error, sin permisos) que consumen todos los módulos.

## Requirements

### Requirement: Shell con navegación principal
El sistema SHALL renderizar un shell persistente con navegación a las secciones principales: dashboard, deportistas, entrenamientos, chequeos y reportes.

#### Scenario: Navegar entre secciones
- **WHEN** el usuario selecciona "Deportistas" en la navegación
- **THEN** la ruta cambia a la sección de deportistas y muestra su pantalla placeholder

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

### Requirement: Estados compartidos de UI
El sistema MUST proveer componentes compartidos para estados de carga, vacío y error reutilizables por todos los módulos.

#### Scenario: Reutilizar estado vacío
- **WHEN** una lista de un módulo no tiene datos
- **THEN** el módulo puede renderizar el estado vacío compartido sin duplicar markup
