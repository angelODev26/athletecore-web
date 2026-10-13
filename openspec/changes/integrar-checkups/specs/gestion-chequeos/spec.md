# specs/gestion-chequeos/spec.md (delta)

## ADDED Requirements

### Requirement: Acceso y ubicación de la UI de chequeos
La UI de chequeos SHALL vivir como pestaña de la ficha del atleta en
`/athletes/:id/chequeos` accesible desde un enlace en la ficha, y el detalle de un
chequeo SHALL vivir en `/athletes/:id/chequeos/:checkupId`; ambas rutas SHALL estar
disponibles para cualquier usuario autenticado (las acciones de escritura dentro se
condicionan por rol). La matriz de tabla nacional SHALL vivir en `/tabla-nacional`
bajo `RequireRoles(["ADMIN"])`. La ruta placeholder `/checkups` MUST desaparecer.

#### Scenario: Enlace desde la ficha del atleta
- **WHEN** un usuario autenticado abre `/athletes/:id` y pulsa el enlace "Chequeos"
- **THEN** navega a `/athletes/:id/chequeos`

#### Scenario: USER accede por URL directa a la tabla nacional
- **WHEN** un usuario con solo `ROLE_USER` navega a `/tabla-nacional`
- **THEN** ve el estado "sin permisos" y la sesión no se cierra

#### Scenario: Profundizar en un chequeo
- **WHEN** el usuario pulsa un chequeo de la lista del atleta
- **THEN** navega a `/athletes/:id/chequeos/:checkupId`

### Requirement: Lista de chequeos del atleta con filtro año/mes
La pestaña SHALL listar los chequeos del atleta (`GET /athletes/{athleteId}/checkups`)
mostrando período (mes/año), categoría y notas; SHALL ofrecer filtros opcionales de
año y mes que se envían como `?year=&month=` en la query string (filtro server-side,
nunca en memoria), y SHALL cubrir estados de carga, vacío (con CTA de alta para
ADMIN/COACH) y error con reintento.

#### Scenario: Filtrar por año y mes
- **WHEN** el usuario selecciona un año y/o un mes en los filtros
- **THEN** se pide de nuevo la lista al back con `?year=&month=` y el resultado
  corresponde al filtro

#### Scenario: Sin filtros
- **WHEN** el usuario entra a la pestaña sin seleccionar filtros
- **THEN** la llamada se hace sin query params

#### Scenario: Lista vacía
- **WHEN** el back devuelve `[]`
- **THEN** se muestra el estado vacío y, si el usuario es ADMIN/COACH, el CTA
  "Nuevo chequeo"

### Requirement: Alta y borrado de chequeos (ADMIN/COACH)
Un ADMIN/COACH SHALL poder crear un chequeo (`POST /athletes/{athleteId}/checkups`)
desde un dialog con validación **local completa** replicando el contrato
(`year` 1900–2100, `month` 1–12, `category` ∈ `INFANTIL|JUVENIL|MAYOR`, `athleteId`
igual al de la ruta) y SHALL poder borrarlo (`DELETE /checkups/{id}` → 204) con
confirmación. Un USER MUST NO ver estas acciones.

#### Scenario: Crear chequeo válido
- **WHEN** un COACH envía año/mes/categoría válidos
- **THEN** se crea (201) y aparece en la lista

#### Scenario: Validación local bloquea el envío
- **WHEN** el usuario introduce un mes fuera de 1–12 o un año fuera de 1900–2100
- **THEN** el formulario marca el campo y NO llama al back

#### Scenario: Duplicado 409 mapeado
- **WHEN** el back responde 409 `"Checkup with athleteId/year/month/category already exists"`
- **THEN** se muestra el mensaje seguro "Ya existe un chequeo de ese año y mes para
  esta categoría", nunca el texto crudo del back

#### Scenario: 400 residual sin mapeo por campo
- **WHEN** pese a la validación local el back responde 400 con `details`
- **THEN** se muestra un mensaje global seguro bajo el formulario vía
  `toUserFacingMessage`, nunca texto crudo del back

#### Scenario: Borrado con confirmación y copy de deuda T5
- **WHEN** un ADMIN confirma el borrado en el diálogo
- **THEN** se envía `DELETE`, se muestra el aviso de que el borrado elimina todos los
  tiempos y que corregir = borrar y recrear, y se vuelve a la lista; un 404 posterior
  es consistente (soft delete)

### Requirement: Detalle del chequeo con tiempos embebidos
El detalle SHALL renderizar `GET /checkups/{id}` con los tiempos embebidos en tabla
(`style`, `distance`, `timeFormatted` **tal cual** — el front nunca formatea) y SHALL
cubrir los estados de carga, error y "sin tiempos registrados".

#### Scenario: Tiempos formateados por el servidor
- **WHEN** un tiempo llega con `timeSeconds: 65.25` y `timeFormatted: "01:05.250"`
- **THEN** se muestra `"01:05.250"` renderizando el string del servidor sin
  reprocesarlo

#### Scenario: Chequeo sin tiempos
- **WHEN** `times` viene vacío
- **THEN** se muestra el estado vacío dentro de la tabla de tiempos

### Requirement: Alta de tiempo de prueba (ADMIN/COACH)
Un ADMIN/COACH SHALL poder agregar un tiempo (`POST /checkups/{id}/times`) con input
de tiempo en formato `mm:ss.fff` (con horas opcionales) parseado localmente a segundos
antes de enviar, validando localmente `style` ∈ enum, `distance` entero ≥ 1,
`timeSeconds` > 0, y prevalidando la unicidad `(style, distance)` contra los tiempos
ya embebidos; enums siempre en mayúsculas en el request.

#### Scenario: Input mm:ss.fff convertido a segundos
- **WHEN** el usuario escribe `01:05.250` y envía
- **THEN** el body del POST lleva `timeSeconds: 65.25` (número, sin string formateado)

#### Scenario: Input de tiempo inválido
- **WHEN** el usuario escribe `1:5.25` o `abc`
- **THEN** el formulario marca el campo (formato esperado `mm:ss.fff`) y NO llama al
  back

#### Scenario: Duplicado (style, distance) prevalidado localmente
- **WHEN** ya existe un tiempo `LIBRE 100` en el chequeo y el usuario intenta agregar
  otro `LIBRE 100`
- **THEN** el formulario lo bloquea localmente sin llamar al back

#### Scenario: 409 residual mapeado
- **WHEN** el back responde 409 `"CheckupTime with checkupId/style/distance already exists"`
- **THEN** se muestra "Ya existe un tiempo registrado para ese estilo y distancia en
  este chequeo", nunca el texto crudo

### Requirement: Comparación contra la tabla nacional
El detalle SHALL ofrecer una acción "Comparar con referencia" que dispara
`GET /checkups/{id}/comparison` **bajo demanda** (no al cargar), y SHALL renderizar
cada entrada con `trialTimeFormatted` y una fila por posición (1=oro, 2=plata,
3=bronce) usando `referenceTimeFormatted`, `absoluteDiffFormatted` con su signo
(negativo = más rápido que la referencia) y `relativeDiffPercent` tal cual vienen.

#### Scenario: Comparación disponible
- **WHEN** el usuario pulsa "Comparar con referencia" y el back responde 200
- **THEN** se muestra el panel con las posiciones del podio y los deltas con signo
  formateados por el servidor

#### Scenario: Triple de referencia incompleto
- **WHEN** el back responde 409 por triple incompleto en comparación
- **THEN** se muestra el estado "Referencia incompleta" (no un error genérico) y, si
  el usuario es ADMIN, un enlace a `/tabla-nacional`

#### Scenario: USER no autenticado no aplica
- **WHEN** cualquier usuario autenticado (incluido USER) pulsa "Comparar"
- **THEN** la acción está disponible (lectura abierta del contrato)

### Requirement: Proyección de medallería
La pestaña SHALL mostrar un panel "Proyección de medallería" con
`GET /athletes/{athleteId}/projections` renderizando el array **tal cual** (puede
repetir `(style, distance)` entre chequeos distintos; el front ni desduplica ni
calcula), con badge semántico por `classification` según DESIGN.md
(`POR_ENCIMA_DEL_PODIO` → success, `CERCANO_A_MEDALLERIA` → warning,
`FUERA_DE_RANGO` → neutra) y el delta vs bronce con el `diffVsBronzeFormatted` del
servidor. El umbral de proximidad (1.5 s) MUST NO replicarse en el front.

#### Scenario: Badges por clasificación del servidor
- **WHEN** llega una proyección con `classification: "POR_ENCIMA_DEL_PODIO"`
- **THEN** se muestra el badge success "Por encima del podio" junto a
  `timeFormatted` y `diffVsBronzeFormatted` tal cual

#### Scenario: Proyección sin triple completo
- **WHEN** el back responde 409 por triple incompleto en proyección
- **THEN** el panel muestra el estado "Referencia incompleta" con el enlace a
  `/tabla-nacional` si el usuario es ADMIN

#### Scenario: Atleta sin chequeos
- **WHEN** el back responde `[]`
- **THEN** el panel muestra su estado vacío

### Requirement: Matriz de administración de la tabla nacional (solo ADMIN)
La página SHALL agrupar en memoria la lista plana de `GET /national-reference-times`
por `(style, distance, category)` mostrando una fila por combinación con 3 celdas
(oro/plata/bronce) que muestran `timeFormatted`; SHALL marcar con aviso toda fila con
menos de 3 posiciones ("triple incompleto: la comparación fallará"); SHALL permitir
crear una posición (`POST`), editarla (`PUT` con los **5 campos completos**,
pre-cargados) y borrarla (`DELETE` con confirmación); y SHALL ofrecer filtros en
cliente por estilo y por categoría.

#### Scenario: Fila con triple completo
- **WHEN** la combinación `LIBRE 100 JUVENIL` tiene 3 filas (position 1, 2, 3)
- **THEN** la fila muestra las 3 celdas con sus `timeFormatted` y sin aviso

#### Scenario: Fila con triple incompleto
- **WHEN** la combinación `ESPALDA 50 MAYOR` solo tiene position 1 y 2
- **THEN** la fila muestra el aviso de triple incompleto y la celda de bronce vacía

#### Scenario: Editar una celda envía PUT completo
- **WHEN** un ADMIN edita la celda de plata de una combinación y cambia el tiempo a
  `01:02.500`
- **THEN** se envía `PUT /national-reference-times/{id}` con los 5 campos (style,
  distance, category, position y timeSeconds=62.5) y la matriz se refresca

#### Scenario: Duplicado prevalidado localmente
- **WHEN** un ADMIN intenta crear una posición ya existente para la misma combinación
- **THEN** el formulario lo bloquea localmente; si aun así llega 409, se muestra el
  mensaje seguro mapeado

#### Scenario: Borrado con confirmación
- **WHEN** un ADMIN confirma el borrado de una posición
- **THEN** se envía `DELETE` (204) y la celda queda vacía tras refrescar

### Requirement: El front nunca formatea tiempos ni calcula clasificaciones
Toda visualización de tiempos SHALL usar los campos `*Formatted` del servidor
(`timeFormatted`, `trialTimeFormatted`, `referenceTimeFormatted`,
`absoluteDiffFormatted`, `diffVsBronzeFormatted`); el único procesamiento local
permitido SHALL ser el parseo del input `mm:ss.fff` a segundos al enviar y el uso de
`timeSeconds` como número para ordenar. La `classification` de la proyección SHALL
venir siempre del servidor.

#### Scenario: Ordenar tiempos de tabla por número
- **WHEN** la matriz o tabla de tiempos ordena por tiempo
- **THEN** compara `timeSeconds` numérico, nunca el string formateado

#### Scenario: Ningún cálculo de clasificación
- **WHEN** se renderiza cualquier badge de proyección o signo de delta
- **THEN** el valor mostrado es exactamente el entregado por el servidor
