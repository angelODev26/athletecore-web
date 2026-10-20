# specs/app-shell-navigation/spec.md (delta)

> Fase A del change (implementada y revisada): nav "Usuarios" solo ADMIN. El
> MODIFIED de "Rutas públicas y privadas" (retiro de `/registro`) se escindió a
> `openspec/changes/alta-usuarios-admin/` (bloqueado por D7).

## MODIFIED Requirements

### Requirement: Shell con navegación principal
El sistema SHALL renderizar un shell persistente con navegación a las secciones
principales: dashboard, deportistas, entrenamientos, tabla nacional (solo ADMIN),
usuarios (solo ADMIN) y reportes. La antigua entrada "Chequeos" desaparece: los
chequeos viven como pestaña de la ficha del atleta.

#### Scenario: Navegar entre secciones
- **WHEN** el usuario selecciona "Deportistas" en la navegación
- **THEN** la ruta cambia a la lista de deportistas

#### Scenario: El nav ya no muestra la sección placeholder de chequeos
- **WHEN** cualquier usuario autenticado abre la app
- **THEN** la navegación no contiene un ítem "Chequeos" independiente

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
