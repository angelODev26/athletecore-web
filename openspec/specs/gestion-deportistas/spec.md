# gestion-deportistas Specification

## Purpose

Gestión visual del dominio de deportistas contra el contrato real de AthleteCore API
(doc `04-contrato-api-deportistas.md`): lista paginada server-side, ficha compuesta
(detalle + perfil antropométrico + deportes), alta guiada en 3 pasos, edición parcial,
borrado con confirmación y asignación de deportes por reemplazo total. Todos los endpoints
de este módulo solo requieren autenticación (cualquier rol); el único endpoint restringido
(`POST /athletes/sports`, ADMIN) queda fuera de esta capability.

## Requirements

### Requirement: Lista paginada server-side

El sistema SHALL mostrar la lista de deportistas paginando contra el servidor
(`GET /api/v1/athletes?page=&size=&sort=lastName,asc`), normalizando la respuesta Spring
`Page` con el adapter `toPageModel` de la capa de datos. El sistema MUST NOT traer la
colección completa para paginarla en memoria.

#### Scenario: Primera página
- **WHEN** un usuario autenticado abre la sección Deportistas
- **THEN** se solicita `page=0&size=10&sort=lastName,asc` y se muestran username, nombre
  completo (`fullName` del servidor), email y avatar (foto o iniciales)

#### Scenario: Navegar de página
- **WHEN** el usuario pulsa "Siguiente"
- **THEN** se solicita la página siguiente al servidor y la tabla se actualiza sin recargar
  la lista anterior en memoria

#### Scenario: Límites del paginador
- **WHEN** la página actual es la primera (respuesta `first`)
- **THEN** el botón "Anterior" está deshabilitado
- **WHEN** la página actual es la última (`last`)
- **THEN** el botón "Siguiente" está deshabilitado y se muestra el total de elementos

#### Scenario: Lista vacía
- **WHEN** el servidor devuelve una página sin elementos
- **THEN** se muestra un estado vacío con enlance/CTA al alta (no una tabla sin filas)

#### Scenario: Mientras carga
- **WHEN** se navega entre páginas
- **THEN** se muestra un estado de carga (skeleton) y la página anterior se conserva
  visible hasta que llega la nueva (`placeholderData`)

#### Scenario: Acceso al detalle
- **WHEN** el usuario pulsa una fila (o su acción de detalle)
- **THEN** navega a la ficha `/athletes/:id`

### Requirement: Ficha del deportista compuesta

El sistema SHALL componer la ficha de `/athletes/:id` con las llamadas del contrato
(doc 04 §5): detalle, perfil (tolerando 404), IDs de deportes y catálogo de deportes
cacheado en memoria. El sistema MUST NOT calcular BMI, categoría ni `isComplete` — se
muestran tal como los envía el servidor, nunca calculados.

#### Scenario: Ficha completa
- **WHEN** el servidor devuelve detalle + perfil + deportes
- **THEN** se muestran `fullName`, `username`, `email`, `birthDate` (o "no registrada"),
  avatar, datos del perfil con `bmi` (máx. 2 decimales), `bmiCategory` (literal, sin
  traducir) e `isComplete`, y los nombres de los deportes resueltos cruzando IDs con el
  catálogo

#### Scenario: Perfil ausente
- **WHEN** `GET /{id}/profile` responde 404
- **THEN** la ficha muestra el estado "Sin perfil registrado" con un CTA para crearlo,
  sin tratar el 404 como error

#### Scenario: BMI no disponible
- **WHEN** el servidor devuelve `bmi`/`bmiCategory` en `null`
- **THEN** se muestra "no disponible" en esos campos (nunca "null" ni un cálculo local)

#### Scenario: Deportista inexistente o borrado
- **WHEN** `GET /{id}` responde 404 (incluye soft-deleted)
- **THEN** se muestra un estado "Deportista no encontrado" con enlace de vuelta a la lista

#### Scenario: `disciplineIds` sin catálogo
- **WHEN** un deporte asignado trae `disciplineIds`
- **THEN** se muestran como IDs técnicos (dato, no error), sin inventar nombres (D4)

### Requirement: Alta guiada en 3 pasos

El sistema SHALL ofrecer el alta en `/athletes/nuevo` como wizard con estado local de paso:
(1) datos básicos `POST`, (2) fecha de nacimiento `PUT` parcial, (3) perfil opcional
`POST .../profile` upsert. Esta secuencia es obligatoria porque el DTO de creación no
admite `birthDate` (deuda T6).

#### Scenario: Paso 1 crea el deportista
- **WHEN** el usuario envía el paso 1 con datos válidos
- **THEN** se llama a `POST /api/v1/athletes` y al 201 se guarda el `id` y se avanza al
  paso 2; el alta ya es efectiva en el back aunque el wizard se abandone

#### Scenario: Validación client-side del paso 1
- **WHEN** username tiene menos de 3 caracteres, email no es válido o falta nombre/apellido
- **THEN** se bloquea el envío con errores por campo ANTES de llamar al back (T1)

#### Scenario: Username duplicado
- **WHEN** el paso 1 devuelve 409 con `message` "Athlete with username already exists"
- **THEN** se muestra error en el campo username, nunca el texto crudo del back

#### Scenario: Email duplicado
- **WHEN** el paso 1 devuelve 409 con `message` "Athlete with email already exists"
- **THEN** se muestra error en el campo email (no en el username)

#### Scenario: Paso 2 fecha de nacimiento
- **WHEN** el usuario introduce una fecha válida (no futura) y continúa
- **THEN** se llama a `PUT /api/v1/athletes/{id}` con `{ birthDate }` ISO `YYYY-MM-DD` y se
  avanza al paso 3

#### Scenario: Omitir paso 2 o 3
- **WHEN** el usuario pulsa "Omitir y terminar" (paso 2 o 3) o "Terminar"
- **THEN** se navega a `/athletes/:id` del deportista recién creado, con el aviso de que
  puede completar el perfil desde la ficha; no se intenta deshacer el alta

#### Scenario: Paso 3 perfil
- **WHEN** el usuario envía el paso 3 con peso/talla válidos
- **THEN** se llama a `POST /api/v1/athletes/{id}/profile` (upsert) y se navega a la ficha

#### Scenario: 400 de red de seguridad
- **WHEN** cualquier paso recibe un 400 pese a la validación local
- **THEN** se muestra un banner con `toUserFacingMessage` (fallback seguro si el mensaje
  no está mapeado), nunca el texto crudo del servidor

### Requirement: Edición parcial

El sistema SHALL permitir editar `firstName`, `lastName`, `birthDate` y `photoUrl` desde
`/athletes/:id/editar` con `PUT` parcial. El sistema MUST NOT permitir cambiar `username`
ni `email` (la API no lo permite) y los MUST mostrar bloqueados con la nota "no editable
por la API".

#### Scenario: Edición feliz
- **WHEN** el usuario modifica campos permitidos y guarda
- **THEN** se llama a `PUT /api/v1/athletes/{id}` solo con los campos editables, la lista
  y la ficha se reinvalidan y se navega de vuelta a la ficha

#### Scenario: Username/email bloqueados
- **WHEN** se renderiza el formulario de edición
- **THEN** `username` y `email` aparecen como campos deshabilitados prefijados y no se
  envían en el `PUT`

### Requirement: Borrado con confirmación

El sistema SHALL exigir una confirmación explícita (`AlertDialog` de shadcn) antes de
llamar a `DELETE /api/v1/athletes/{id}`, indicando al usuario que la acción es soft delete
sin undo (doc 08 §5).

#### Scenario: Confirmación
- **WHEN** el usuario pulsa "Eliminar deportista" y confirma en el diálogo
- **THEN** se llama a `DELETE`, al 204 se invalida la lista y se navega a `/athletes`

#### Scenario: Cancelación
- **WHEN** el usuario cancela el diálogo
- **THEN** no se llama al back y la ficha queda intacta

#### Scenario: Efecto del soft delete
- **WHEN** vuelve a la lista tras el 204
- **THEN** el deportista ya no aparece (un nuevo `GET /{id}` daría 404)

### Requirement: Perfil antropométrico (upsert)

El sistema SHALL gestionar el perfil con `POST /api/v1/athletes/{id}/profile` (upsert,
siempre 200) y mostrarlo con los valores calculados por el servidor. Los límites de
validación del front MUST replicar el contrato: `weightKgs` 1.0–500.0 (2 dec.),
`heightCm` 10.0–300.0 (1 dec.), `armSpanCm` opcional 10.0–300.0.

#### Scenario: Crear perfil desde la ficha
- **WHEN** la ficha no tiene perfil y el usuario rellena peso/talla válidos
- **THEN** se llama al upsert y la ficha se reinvalida mostrando `bmi`/`bmiCategory`
  recibidos del servidor

#### Scenario: Actualizar perfil existente
- **WHEN** la ficha tiene perfil y el usuario guarda cambios
- **THEN** se llama al mismo upsert con los valores prefijados y la ficha se reinvalida

#### Scenario: Validación por rango
- **WHEN** el usuario introduce 600 kg o una talla de 400 cm
- **THEN** el formulario bloquea el envío con error por campo (validación local, T1)

### Requirement: Asignación de deportes (reemplazo total)

El sistema SHALL gestionar la selección de deportes como **reemplazo total** con
`POST /api/v1/athletes/{id}/sports`: el selector opera sobre el catálogo completo cacheado,
valida 1–10 elementos y envía siempre la selección final. El sistema MUST NOT enviar listas
vacías (prohibido por el contrato).

#### Scenario: Catálogo-cacheado
- **WHEN** la ficha monta el selector de deportes
- **THEN** el catálogo procede de `useSportsCatalog()` (cacheado, `staleTime: Infinity`)
  y los IDs asignados se resuelven a nombres sin llamadas extra por deporte

#### Scenario: Selección válida
- **WHEN** el usuario marca entre 1 y 10 deportes y guarda
- **THEN** se envía `{ sportIds: [...] }` completo y la ficha se reinvalida

#### Scenario: Selección inválida
- **WHEN** la selección queda vacía o supera 10
- **THEN** el botón guardar queda deshabilitado con mensaje explicativo (sin llamada al back)

#### Scenario: Quitar un deporte
- **WHEN** el usuario desmarca un deporte asignado
- **THEN** al guardar se envía la lista final sin él, sabiendo que el back reemplaza el
  conjunto completo

### Requirement: Estados compartidos y manejo de errores

El sistema SHALL usar los estados compartidos del shell (carga/vacío/error) y los helpers
de la capa de datos (`isApiError`, `getDuplicateField`, `toUserFacingMessage`) en todos
los errores del módulo; el 401 lo gestiona el interceptor de sesión sin código propio.

#### Scenario: 5xx
- **WHEN** cualquier llamada devuelve 5xx
- **THEN** se muestra un error genérico con reintento manual, sin texto crudo del servidor

#### Scenario: UI con tokens, sin literales
- **WHEN** se renderiza cualquier pantalla nueva del módulo
- **THEN** no hay colores literales ni sombras/gradientes inventados y
  `npm run design:check` pasa
