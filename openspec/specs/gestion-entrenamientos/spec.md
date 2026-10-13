# gestion-entrenamientos Specification

## Purpose
TBD - created by archiving change integrar-training. Update Purpose after archive.
## Requirements
### Requirement: Acceso por rol a la sección de entrenamientos
La sección `/training` y todas sus subrutas SHALL estar protegidas por
`RequireRoles(["ADMIN","COACH"])`; un usuario sin rol staff MUST ver el estado "sin
permisos" si accede por URL directa, sin ser redirigido a login.

#### Scenario: USER navega por URL directa
- **WHEN** un usuario con solo `ROLE_USER` navega a `/training`
- **THEN** se muestra el estado "sin permisos" y la sesión no se cierra

#### Scenario: COACH accede a la sección
- **WHEN** un COACH navega a `/training`
- **THEN** ve la lista de planes sin acciones de administración de planes

### Requirement: Lista de planes anuales con paginación client-side
El sistema SHALL listar los planes (`GET /training-plans`, sin paginar en back) con
paginación **client-side** vía el adapter `toPageModel` (D2), mostrando nombre, rango de
fechas y estado; SHALL ofrecer estados de carga (skeleton), vacío (con CTA de alta para
ADMIN) y error con reintento.

#### Scenario: Paginar en cliente
- **WHEN** hay más planes que el tamaño de página y el usuario pulsa Siguiente
- **THEN** se muestra la siguiente página sin llamar de nuevo al back

#### Scenario: Lista vacía
- **WHEN** el back devuelve `[]`
- **THEN** se muestra el estado vacío y, si el usuario es ADMIN, el CTA "Crear plan"

#### Scenario: Acceso al detalle
- **WHEN** el usuario pulsa una fila de plan
- **THEN** navega a `/training/plans/:id`

### Requirement: Gestión de planes (solo ADMIN)
Un ADMIN SHALL poder crear un plan (`POST`), editarlo parcialmente (`PUT`, solo campos
modificados) y borrarlo (`DELETE`, soft delete → 204 tras confirmación); un COACH MUST
NO ver estas acciones.

#### Scenario: Crear plan válido
- **WHEN** un ADMIN envía nombre + fechas válidas (`endDate ≥ startDate`)
- **THEN** se crea (201) y aparece en la lista

#### Scenario: Rango de fechas inválido
- **WHEN** `endDate < startDate`
- **THEN** el formulario bloquea el envío y marca el campo antes de llamar al back

#### Scenario: Borrado con confirmación
- **WHEN** un ADMIN confirma el borrado en el diálogo
- **THEN** se envía `DELETE`, el plan desaparece de la lista; si el back devuelve 404
  posterior es consistente (soft delete)

#### Scenario: COACH sin acciones de plan
- **WHEN** un COACH ve la lista de planes
- **THEN** no aparecen los botones crear/editar/borrar

### Requirement: Árbol del plan y creación de ciclos
El detalle del plan SHALL renderizar la jerarquía mesociclo → microciclo exactamente como
la entrega `GET /training-plans/{id}` (ordenada por `orderIndex`), y SHALL permitir a
ADMIN crear ciclos (`POST /{planId}/cycles`) pre-validando las reglas de negocio.

#### Scenario: Jerarquía sin re-ensamblar
- **WHEN** se carga el detalle del plan
- **THEN** los microciclos aparecen anidados bajo su mesociclo sin reordenamiento local

#### Scenario: Microciclo sin padre
- **WHEN** un ADMIN intenta crear un `MICROCICLO` sin seleccionar mesociclo padre
- **THEN** el formulario bloquea el envío y explica la regla

#### Scenario: Nombre duplicado en el plan
- **WHEN** un ADMIN intenta crear un ciclo con un nombre ya existente en ese plan
- **THEN** el formulario lo detecta localmente y no envía la petición

#### Scenario: 400 de reglas de negocio
- **WHEN** pese a la pre-validación el back responde 400 con `details`
- **THEN** los errores se muestran campo a campo, nunca el `message` crudo

### Requirement: Gestión de sesiones de entrenamiento
ADMIN/COACH SHALL poder crear sesiones **dentro de un microciclo**
(`POST /training-cycles/{cycleId}/sessions`), editarlas parcialmente (`PUT`) y cambiar su
estado (`PUT .../status`: PROGRAMADA/EJECUTADA/CANCELADA); el borrado SHALL ser solo para
ADMIN. Las sesiones sueltas no se crean desde la UI.

#### Scenario: Crear sesión en microciclo
- **WHEN** se envía el formulario desde un nodo microciclo con `sessionDate`
- **THEN** se crea (201) en ese ciclo y aparece en su lista de sesiones

#### Scenario: Cambio de estado a cancelada
- **WHEN** se selecciona CANCELADA en la sesión
- **THEN** se envía `PUT .../status` y la sesión queda marcada como cancelada

#### Scenario: Borrar sesión siendo COACH
- **WHEN** un COACH ve el detalle de una sesión
- **THEN** no aparece la acción de borrado

### Requirement: Pase de lista con upsert
El detalle de sesión SHALL ofrecer una planilla con todos los deportistas y estado por
atleta (PRESENTE/AUSENTE/JUSTIFICADO o "sin marcar"); cada marca SHALL enviar
`POST .../attendance` (upsert — re-marcar actualiza sin duplicar). Si la sesión está
CANCELADA el pase MUST estar bloqueado.

#### Scenario: Planilla completa
- **WHEN** se abre la sesión
- **THEN** la planilla combina la asistencia embebida con el listado completo de
  deportistas; los no registrados aparecen como "sin marcar"

#### Scenario: Corrección de marca
- **WHEN** un atleta marcado AUSENTE se remarca PRESENTE
- **THEN** se envía un nuevo `POST` y el registro se actualiza (upsert), sin duplicados

#### Scenario: Sesión cancelada
- **WHEN** la sesión está CANCELADA
- **THEN** la planilla muestra el aviso y los controles están deshabilitados

### Requirement: Bandeja de alertas con acknowledge local
El sistema SHALL listar las alertas de ausencias consecutivas (`GET /alerts/attendance`,
paginación client-side) mostrando deportista, racha y última fecha; "marcar como vista"
SHALL ser un dismiss **local** persistido con clave `(athleteId, lastAbsenceDate)` (D3) y
la UI MUST aclarar que es local y la alerta puede reaparecer.

#### Scenario: Marcar como vista
- **WHEN** el usuario pulsa "marcar como vista" en una alerta
- **THEN** la tarjeta desaparece y no se llama a `POST .../acknowledge` del back

#### Scenario: Reaparición por racha viva
- **WHEN** una alerta vista vuelve del back con un `lastAbsenceDate` nuevo
- **THEN** reaparece en la bandeja (la clave local ya no coincide)

#### Scenario: Bandeja vacía
- **WHEN** no hay alertas activas
- **THEN** se muestra el estado vacío correspondiente

### Requirement: Errores y formatos del módulo
Los errores 400 SHALL mostrarse mapeados (`details` campo a campo; helpers existentes;
nunca texto crudo del back) y las fechas/horas SHALL presentarse por manipulación de
string (`YYYY-MM-DD` → `DD/MM/YYYY`, `HH:mm:ss` → `HH:mm`), sin cálculos de negocio en el
front.

#### Scenario: 400 al guardar
- **WHEN** una mutación devuelve 400 con `details`
- **THEN** cada campo muestra su error y el mensaje global seguro

#### Scenario: Fecha límite de zona horaria
- **WHEN** una sesión tiene `sessionDate: "2026-01-06"`
- **THEN** se muestra `06/01/2026` sin desfase de día por timezone

