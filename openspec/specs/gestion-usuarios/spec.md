# gestion-usuarios Specification

## Purpose
Define la administración de usuarios en el front: la lista `/usuarios` solo para
ADMIN sobre `GET /users` (contrato
`docs/backend-contract/03-contrato-api-usuarios.md`), con paginación client-side
(el endpoint no pagina — decisión D2), estado `enabled` como badge informativo
(sin toggle: el contrato no expone `PUT`) y estado "sin permisos" para roles
inferiores sin cerrar la sesión. La alta de usuarios con rol, el cierre del
registro público y el bootstrap del admin inicial (seed del back) no viven aquí:
quedan en `openspec/changes/alta-usuarios-admin/`, bloqueados por los
prerrequisitos P1–P3 del back (D7).

## Requirements

### Requirement: Lista de usuarios solo para ADMIN
La pantalla `/usuarios` SHALL estar bajo `RequireRoles(["ADMIN"])` y SHALL listar
`GET /users` (contrato 03 §4) con columnas de usuario, nombre, email y estado
`enabled` como badge informativo (sin toggle — no existe endpoint). El listado
SHALL paginar en cliente (pageSize 10, adapter reutilizado) porque el endpoint no
pagina (decisión D2), y SHALL cubrir estados de carga, vacío y error con reintento.

#### Scenario: ADMIN ve la lista
- **WHEN** un ADMIN abre `/usuarios`
- **THEN** ve la tabla de usuarios con su usuario, nombre, email y badge de estado

#### Scenario: USER accede por URL directa
- **WHEN** un usuario sin rol ADMIN navega a `/usuarios`
- **THEN** ve el estado "sin permisos" y la sesión no se cierra

#### Scenario: Paginación client-side
- **WHEN** la lista trae más de 10 usuarios y se pasa de página
- **THEN** se muestran los siguientes 10 sin nueva llamada al back

#### Scenario: Lista vacía
- **WHEN** `GET /users` devuelve `[]`
- **THEN** se muestra el estado vacío
