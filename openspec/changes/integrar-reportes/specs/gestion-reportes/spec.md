# specs/gestion-reportes/spec.md (delta)

## ADDED Requirements

### Requirement: Acceso y ubicación de la UI de reportes
La UI de reportes SHALL vivir en cuatro superficies: el dashboard general en `/`
(reemplaza el placeholder), el dashboard del atleta en `/athletes/:id/report`
accesible desde un enlace "Reporte" en la ficha, la sección `/reports` con
sub-navegación interna (biblioteca en `/reports`, equipo en `/reports/equipo`) y las
programaciones en `/reports/programaciones` bajo `RequireRoles(["ADMIN"])` con su
tab oculta para no-ADMIN. Todas las rutas SHALL requerir sesión; el placeholder
`reports-page.tsx` MUST desaparecer.

#### Scenario: Enlace desde la ficha del atleta
- **WHEN** un usuario autenticado abre `/athletes/:id` y pulsa el enlace "Reporte"
- **THEN** navega a `/athletes/:id/report`

#### Scenario: Sub-navegación de la sección de reportes
- **WHEN** un usuario autenticado está en cualquier página de `/reports`
- **THEN** ve tabs a "Biblioteca" (`/reports`) y "Equipo" (`/reports/equipo`), y
  también "Programaciones" (`/reports/programaciones`) solo si es ADMIN

#### Scenario: USER accede por URL directa a programaciones
- **WHEN** un usuario sin rol ADMIN navega a `/reports/programaciones`
- **THEN** ve el estado "sin permisos" y la sesión no se cierra

### Requirement: Dashboard general del equipo
El dashboard `/` SHALL estar disponible para cualquier usuario autenticado y SHALL
componer: 3 KPI cards agregadas en cliente desde `GET /reports/team`
(deportistas evaluados, proyecciones al podio, pruebas con registro), una gráfica
de distribución de clasificaciones (dataset único, tokens `data.series-*`) y dos
list cards ("Reportes recientes" desde `GET /reports`, "Próximas ejecuciones" desde
`GET /report-schedules` ordenadas por `nextRunAt`). El front MUST limitarse a
agregar datos que el servidor ya clasificó; MUST NOT calcular clasificaciones. La
query del team report SHALL usar `staleTime` de 5 minutos (lectura pesada, sin
polling agresivo).

#### Scenario: KPIs agregados del team report
- **WHEN** el team report trae 3 entradas con 9 atletas únicos, de los cuales 4 con
  clasificación `POR_ENCIMA_DEL_PODIO`
- **THEN** las KPI cards muestran 9 "deportistas evaluados", 4 "proyecciones al
  podio" y 3 "pruebas con registro"

#### Scenario: Equipo sin datos
- **WHEN** `GET /reports/team` devuelve `entries: []`
- **THEN** las KPIs muestran 0 y la chart card muestra su estado vacío

#### Scenario: List cards con datos
- **WHEN** existen reportes generados y programaciones activas
- **THEN** "Reportes recientes" muestra hasta 5 con badge de estado y
  "Próximas ejecuciones" muestra hasta 5 ordenadas por `nextRunAt`

### Requirement: Dashboard del atleta con gráfica de evolución
La página `/athletes/:id/report` SHALL consumir `GET /athletes/{id}/report` en UNA
llamada y SHALL renderizar: gráfica de líneas con una serie por
`(style, distance)` (etiqueta `style distance`m), eje Y en segundos con eje
invertido (menor tiempo = mejor), colores `data.series-1..4` cíclicos leídos de los
tokens, leyenda arriba y tooltip que muestra el `timeFormatted` del servidor (lookup
del entry, nunca formateo local); resumen de asistencia (`totalSessions`,
`presentCount`, `absentCount`, `justifiedCount`, `currentAbsenceStreak` tal cual del
servidor); y proyecciones con badge de `classification` reutilizando el componente
de chequeos. Si el atleta no existe o está borrado (404) SHALL mostrar estado "no
encontrado" con vuelta a la ficha.

#### Scenario: Gráfica de evolución con varias pruebas
- **WHEN** `timeEvolution` trae entradas de LIBRE 100 y ESPALDA 200 en varios meses
- **THEN** la gráfica muestra una serie por prueba con su etiqueta en la leyenda y
  los puntos ordenados por (year, month)

#### Scenario: Tooltip con tiempo del servidor
- **WHEN** el usuario pasa el cursor sobre un punto con `timeSeconds: 65.25` y
  `timeFormatted: "01:05.250"`
- **THEN** el tooltip muestra `"01:05.250"` (string del servidor), nunca un
  formateo local

#### Scenario: Atleta sin datos de chequeo
- **WHEN** `timeEvolution` y `projections` llegan vacíos
- **THEN** la gráfica y las proyecciones muestran su estado vacío y la asistencia
  se muestra con sus contadores

#### Scenario: Atleta inexistente
- **WHEN** el atleta no existe o está borrado (404)
- **THEN** se muestra "Deportista no encontrado" con enlace de vuelta a la ficha

### Requirement: Reporte de equipo comparativo
La página `/reports/equipo` SHALL consumir `GET /reports/team` con un filtro
server-side opcional de categoría (`?category=` condicional en la query string,
nunca filtrado en memoria del response completo) y SHALL renderizar una sección por
entrada `(style, distance, category)` con su `athleteCount` y una tabla de ranking
ordenada por `bestTimeSeconds` ascendente, mostrando `bestTimeFormatted` y
`diffVsBronzeFormatted` tal cual y el badge de `classification`. La query SHALL usar
`staleTime` de 5 minutos.

#### Scenario: Filtrar por categoría
- **WHEN** el usuario selecciona JUVENIL en el filtro
- **THEN** se pide `GET /reports/team?category=JUVENIL` y solo se muestran
  entradas de esa categoría

#### Scenario: Sin filtro
- **WHEN** el usuario entra con "Todas"
- **THEN** la llamada se hace sin query params

#### Scenario: Ranking ordenado por mejor tiempo
- **WHEN** una entrada trae atletas con bestTimeSeconds 70.1, 65.25 y 68.0
- **THEN** la tabla los muestra en orden 65.25, 68.0, 70.1 con sus
  `bestTimeFormatted` y badges del servidor

### Requirement: Biblioteca de PDFs con filtros y paginación client-side
La biblioteca `/reports` SHALL listar `GET /reports?type=&athleteId=&status=` con
filtros server-side condicionales (tipo, estado, atleta) y paginación client-side
(pageSize 10) reutilizando el adapter existente — el endpoint no pagina (deuda T9,
decisión D2). Cada fila SHALL mostrar título, tipo, objetivo (atleta o categoría),
período, estado como badge (Generado success / Fallido danger / Pendiente warning) y
fecha `createdAt` formateada. Las acciones de generación y borrado MUST estar ocultas
para usuarios sin rol ADMIN/COACH.

#### Scenario: Filtros combinados
- **WHEN** el usuario selecciona tipo INDIVIDUAL y estado GENERATED
- **THEN** se pide la lista con `?type=INDIVIDUAL&status=GENERATED` y sin
  `athleteId` en la query string

#### Scenario: Paginación sin nueva llamada
- **WHEN** la lista trae 25 reportes y el usuario pasa a la página 2
- **THEN** se muestran los siguientes 10 sin nueva petición al back

#### Scenario: Lista vacía
- **WHEN** el back devuelve `[]`
- **THEN** se muestra el estado vacío y, si el usuario es ADMIN/COACH, el CTA
  "Generar reporte"

### Requirement: Generación síncrona de reportes
Un ADMIN/COACH SHALL poder generar un reporte (`POST /reports`) desde un dialog con
validación local completa replicando el contrato: `reportType` obligatorio, `title`
obligatorio con máximo 200 caracteres, `athleteId` requerido si el tipo es
INDIVIDUAL (bloqueado localmente antes de llamar al back), categoría opcional en
GENERAL, `year`/`month` opcionales. Como la generación es síncrona (deuda T3), el
botón SHALL permanecer en estado loading durante la request y MUST NOT existir
polling; la respuesta 201 ya trae el `status` final: si es `GENERATED` el dialog se
cierra, la lista se invalida y se navega al detalle; si es `FAILED` el dialog
permanece mostrando un banner `role="alert"` con el `errorMessage` del servidor.

#### Scenario: Crear reporte individual válido
- **WHEN** un COACH genera un INDIVIDUAL del atleta 1 con título válido
- **THEN** el botón muestra loading hasta la 201 y, con `status: "GENERATED"`, se
  navega al detalle del reporte creado

#### Scenario: INDIVIDUAL sin atleta bloqueado localmente
- **WHEN** el usuario envía tipo INDIVIDUAL sin seleccionar atleta
- **THEN** el formulario marca el campo y NO llama al back

#### Scenario: Título fuera de límite
- **WHEN** el título supera 200 caracteres
- **THEN** el formulario lo bloquea localmente sin llamar al back

#### Scenario: Generación fallida
- **WHEN** la 201 trae `status: "FAILED"` con `errorMessage`
- **THEN** el dialog permanece abierto con un banner `role="alert"` que muestra el
  `errorMessage` del servidor

#### Scenario: USER no ve la acción
- **WHEN** un usuario sin rol ADMIN/COACH abre la biblioteca
- **THEN** no existe el botón "Generar reporte"

### Requirement: Descarga de PDF por Blob
El detalle de un reporte SHALL ofrecer "Descargar PDF" que baja el último export vía
`fetch` con header `Authorization` (un `<a href>` simple no lleva JWT) y crea un
Blob URL respetando el `fileName` del `Content-Disposition`. La descarga MUST
comprobar el `Content-Type` de la respuesta antes de abrir el blob (ante error el
body es JSON, no PDF) y MUST compartir la pipeline de sesión (401 → login, 403 →
sin permisos). El botón SHALL estar deshabilitado si el reporte no está `GENERATED`
o no tiene exports (p. ej. `FAILED` → 404 en el export), con texto que lo explique.

#### Scenario: Descarga exitosa
- **WHEN** un usuario pulsa "Descargar PDF" en un reporte GENERATED con export
- **THEN** el navegador descarga el binario con el nombre del
  `Content-Disposition` (fallback `reporte-{id}.pdf`) y el blob se libera tras el
  click

#### Scenario: Reporte sin export descargable
- **WHEN** el reporte está `FAILED` (o `exports` vacío) y el back responde 404
- **THEN** se muestra un mensaje seguro de error y ningún blob se abre

#### Scenario: Botón deshabilitado
- **WHEN** el reporte no está `GENERATED`
- **THEN** el botón "Descargar PDF" está deshabilitado y explica por qué

### Requirement: Borrado de reportes con confirmación
Un ADMIN/COACH SHALL poder borrar un reporte (`DELETE /reports/{id}` → 204) desde el
detalle con confirmación explícita (`alert-dialog`); tras el borrado SHALL volver a
la biblioteca. Un 404 posterior es consistente con el soft delete universal. Usuarios
sin rol MUST NO ver la acción.

#### Scenario: Borrar con confirmación
- **WHEN** un ADMIN confirma el borrado
- **THEN** se envía `DELETE`, se vuelve a la biblioteca y la lista ya no lo muestra

#### Scenario: Cancelar el borrado
- **WHEN** el usuario cancela el diálogo
- **THEN** no se llama al back y el reporte queda intacto

#### Scenario: USER no ve la acción
- **WHEN** un usuario sin rol ADMIN/COACH abre el detalle
- **THEN** no existe el botón "Borrar"

### Requirement: Programaciones automáticas con presets de cron
La página `/reports/programaciones` (solo ADMIN) SHALL gestionar el CRUD de
`/report-schedules` con un formulario de **presets** — frecuencia (diario /
semanal con día de la semana / mensual con día 1–28) y hora — que el front traduce
a cron Spring de 6 campos; el usuario MUST NOT escribir cron crudo y la expresión
generada se muestra read-only. La tabla SHALL mostrar la frecuencia legible, el
estado activo/pausado y `lastRunAt`/`nextRunAt` tal cual del servidor (nunca
calculados localmente); tras guardar SHALL mostrarse el `nextRunAt` como
confirmación. La actualización SHALL ser un PUT completo (todos los campos
pre-cargados) y "pausar/reanudar" SHALL reutilizar ese PUT con `active` invertido.
El borrado SHALL pedir confirmación. Un 400 de cron inválido del back (mensaje
dinámico) MUST traducirse a un mensaje seguro, nunca texto crudo.

#### Scenario: Crear programación desde preset
- **WHEN** un ADMIN crea "Mensual, día 1, 06:00" para GENERAL JUVENIL
- **THEN** se envía `cronExpression: "0 0 6 1 * *"` con `timezone` seleccionado y
  la respuesta muestra `nextRunAt` como confirmación

#### Scenario: Cron generado visible pero no editable
- **WHEN** el usuario rellena el formulario de presets
- **THEN** la expresión cron generada se muestra read-only y no hay campo de texto
  libre para cron

#### Scenario: Editar exige todos los campos
- **WHEN** un ADMIN edita una programación
- **THEN** el PUT envía TODOS los campos del schedule con los valores del form
  pre-cargado (ninguno omitido)

#### Scenario: Pausar y reanudar
- **WHEN** un ADMIN pulsa "Pausar" en una programación activa
- **THEN** se envía el PUT completo con `active: false` y el badge pasa a "Pausado"

#### Scenario: 400 de cron traducido a mensaje seguro
- **WHEN** el back responde 400 con "Expresión cron inválida: ..."
- **THEN** se muestra "La programación no es válida; revisa la frecuencia y la
  hora", nunca el texto crudo

#### Scenario: Borrado con confirmación
- **WHEN** un ADMIN borra una programación y confirma
- **THEN** se envía `DELETE` (204) y desaparece de la tabla
