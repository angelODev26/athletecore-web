# gestion-usuarios Specification

## Purpose
Define la administración de usuarios en el front: la lista `/usuarios` solo para
ADMIN sobre `GET /users` (contrato
`docs/backend-contract/03-contrato-api-usuarios.md`), con paginación client-side
(el endpoint no pagina — decisión D2), estado `enabled` como badge informativo
(sin toggle: el contrato no expone `PUT`) y estado "sin permisos" para roles
inferiores sin cerrar la sesión. Incluye el alta de usuarios con rol desde un
dialog (solo ADMIN) y el cierre del registro público. El primer ADMIN nace del
seed Flyway del back; el front no implementa bootstrap (D7).

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

### Requirement: Alta de usuarios por el ADMIN con rol
Un ADMIN SHALL poder crear usuarios desde un dialog en `/usuarios` con validación
local completa según el contrato (username 3–50, email válido, nombres ≤100,
password ≥8, confirmación igual) más un select de rol obligatorio
(`ADMIN|COACH|USER`, en mayúsculas). La forma del request SHALL ser la que
publique el back — el front no inventa endpoints. Al crear (201) el dialog se
cierra y la lista se invalida; un 409 de username/email SHALL marcarse por campo
(reutilizando `getDuplicateField`), nunca con texto crudo. Usuarios sin rol ADMIN
MUST NO ver la acción.

#### Scenario: Crear un COACH
- **WHEN** un ADMIN crea un usuario válido con rol COACH
- **THEN** se crea (201), el dialog se cierra, la lista se invalida y se confirma
  el alta; el usuario queda donde el orden del back lo sitúe

#### Scenario: Duplicado marcado por campo
- **WHEN** el back responde 409 "User with username already exists"
- **THEN** el formulario marca el campo username con mensaje seguro, sin texto
  crudo del back

#### Scenario: Validación local bloquea el envío
- **WHEN** el password tiene menos de 8 caracteres o las confirmaciones no
  coinciden
- **THEN** el formulario marca el campo y NO llama al back

#### Scenario: USER no ve la acción
- **WHEN** un usuario sin rol ADMIN abre `/usuarios` (escenario imposible por el
  guard, evaluado por seguridad)
- **THEN** no existe el botón de alta

### Requirement: Registro público cerrado
La app MUST NOT ofrecer auto-registro: la ruta pública `/registro` (página y
mutación) no existe, `RequireGuest` queda solo para `/login`, y la única vía de
creación de usuarios es el dialog de `/usuarios` para ADMIN. El endpoint
`POST /users` del back ya exige `ROLE_ADMIN`; el front retiró su UI en el mismo
corte.

#### Scenario: La ruta de registro ya no existe
- **WHEN** cualquiera navega a `/registro`
- **THEN** no existe ruta de registro y la navegación termina en `/login`
  (catch-all → `/` → `RequireAuth`)

#### Scenario: Sin sesión no hay vía de alta
- **WHEN** un visitante sin sesión abre la app
- **THEN** solo puede llegar a `/login`; ninguna pantalla ofrece crear cuenta

### Requirement: Primer administrador sembrado por el back
El front MUST NOT implementar ningún flujo de bootstrap de usuarios: el primer
ADMIN nace del seed Flyway del back (P3, credenciales por variables de entorno del
perfil) y el front se limita a que ese admin pueda iniciar sesión y ver
`/usuarios`.

#### Scenario: Login del admin sembrado
- **WHEN** el admin sembrado inicia sesión con las credenciales del perfil
- **THEN** accede a la app con el ítem "Usuarios" visible y `/usuarios` operativo
