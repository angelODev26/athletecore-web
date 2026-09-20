## ADDED Requirements

### Requirement: Shell con navegación principal
El sistema SHALL renderizar un shell persistente con navegación a las secciones principales: dashboard, deportistas, entrenamientos, chequeos y reportes.

#### Scenario: Navegar entre secciones
- **WHEN** el usuario selecciona "Deportistas" en la navegación
- **THEN** la ruta cambia a la sección de deportistas y muestra su pantalla placeholder

### Requirement: Rutas públicas y privadas
El sistema SHALL exponer una ruta pública de login y proteger el resto de rutas; un usuario sin sesión MUST ser redirigido a login.

#### Scenario: Acceder sin sesión
- **WHEN** un usuario sin token navega a una ruta privada
- **THEN** es redirigido a `/login`

### Requirement: Navegación filtrada por rol
El sistema SHALL mostrar únicamente las opciones de navegación permitidas para los roles presentes en el JWT; entrenamientos y tabla nacional SHALL ser visibles solo para ADMIN/COACH cuando la regla del contrato lo exija.

#### Scenario: Usuario sin rol de entrenamiento
- **WHEN** un usuario sin rol COACH ni ADMIN abre la app
- **THEN** la opción de entrenamientos no aparece en la navegación

### Requirement: Estados compartidos de UI
El sistema MUST proveer componentes compartidos para estados de carga, vacío y error reutilizables por todos los módulos.

#### Scenario: Reutilizar estado vacío
- **WHEN** una lista de un módulo no tiene datos
- **THEN** el módulo puede renderizar el estado vacío compartido sin duplicar markup
