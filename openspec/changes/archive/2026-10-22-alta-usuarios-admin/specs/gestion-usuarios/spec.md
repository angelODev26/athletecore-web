# specs/gestion-usuarios/spec.md (delta)

## ADDED Requirements

### Requirement: Alta de usuarios por el ADMIN con rol
Con los prerrequisitos de backend P1/P2 (D7) entregados, un ADMIN SHALL poder crear
usuarios desde un dialog en `/usuarios` con validación local completa según el
contrato (username 3–50, email válido, nombres ≤100, password ≥8, confirmación
igual) más un select de rol obligatorio (`ADMIN|COACH|USER`, en mayúsculas). La
forma del request SHALL ser la que publique el back (P2) — el front no inventa
endpoints. Al crear (201) el dialog se cierra y la lista se invalida; un 409 de
username/email SHALL marcarse por campo (reutilizando `getDuplicateField`), nunca
con texto crudo. Usuarios sin rol ADMIN MUST NO ver la acción.

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
Tras el corte de la fase gated (P1/P2), la app MUST NOT ofrecer auto-registro:
la ruta pública `/registro` (página y mutación) desaparece, `RequireGuest` queda
solo para `/login`, y la única vía de creación de usuarios es el dialog de
`/usuarios` para ADMIN. El cierre del endpoint público en sí es el prerrequisito
P1 del back; el front retira su UI en el mismo corte.

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
