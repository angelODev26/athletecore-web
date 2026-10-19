# specs/pruebas-e2e/spec.md (delta)

## ADDED Requirements

### Requirement: Infraestructura E2E reproducible con precondición fail-fast
El proyecto SHALL proveer una suite Playwright (`@playwright/test`, Chromium)
configurada para ejecutarse en local contra el dev server (`baseURL` :5173 con
`webServer` reutilizable) con ejecución secuencial (`workers: 1`, backend local
compartido), un script `test:e2e` separado de la suite unit, y un `global-setup` que
MUST abortar toda la suite con un mensaje accionable (comandos para levantar el
entorno) si el backend real no responde en `:8080` — nunca repartir el fallo en
timeouts difusos por test. Los artefactos de ejecución (`test-results/`,
`playwright-report/`) MUST quedar fuera del repositorio (gitignore).

#### Scenario: Backend caído al lanzar la suite
- **WHEN** se ejecuta `npm run test:e2e` sin backend en `:8080`
- **THEN** la suite aborta en el global-setup con un mensaje que incluye cómo
  levantar PostgreSQL y la API local, y ningún test se ejecuta

#### Scenario: Dev server ya corriendo
- **WHEN** ya hay un dev server en :5173 al lanzar la suite
- **THEN** la configuración lo reutiliza en lugar de levantar uno segundo

#### Scenario: Suite separada de los unit
- **WHEN** se ejecuta `npm run test` sin backend levantado
- **THEN** la suite Vitest corre completa sin requerir la E2E

### Requirement: Fixture de sesión por API con guard anti-drift
Los specs SHALL autenticarse con un login por API (`POST /auth/login`) y sembrar el
`localStorage` con el envelope exacto de `zustand persist` de la clave
`athletecore.session` (builder puro compartido), derivando `expiresAt` del claim
`exp` del JWT como hace el store real. Un test Vitest guard SHALL comparar el
payload del builder contra el persistido por el store real, de modo que cualquier
drift del shape rompa el guard antes que los specs E2E. El fixture MUST soportar al
menos los roles ADMIN y USER del seed local.

#### Scenario: Login programático como ADMIN
- **WHEN** un spec llama al fixture con rol ADMIN y navega a `/`
- **THEN** el shell monta con sesión vigente sin pasar por el formulario de login

#### Scenario: Cambio de shape del session-store
- **WHEN** el store persiste un envelope distinto al del builder del fixture
- **THEN** el test guard de Vitest falla señalando el fixture E2E, sin ejecutar
  la suite E2E

### Requirement: Aislamiento de datos de los specs
Cada spec SHALL crear sus propios datos vía API con sufijos únicos (`e2e-*`), SHALL
ser autocontenido (sin depender de datos preexistentes ni de conteos globales) y
SHALL limpiar lo creado en `afterEach` (best-effort con soft delete; un fallo de
limpieza se registra sin tumbar el test). El flujo de comparación SHALL usar un
triple de referencia reservado para E2E (`MARIPOSA`, distancia 999, `INFANTIL`)
creado y eliminado por el propio spec.

#### Scenario: Datos de un spec no afectan a otro
- **WHEN** dos specs corren secuencialmente creando atletas con sufijos únicos
- **THEN** las aserciones de cada spec se acotan a los datos que él mismo creó

#### Scenario: Limpieza del triple de referencia
- **WHEN** el spec de comparación termina
- **THEN** las tres posiciones de referencia creadas quedan borradas (soft delete)
      y la matriz de tabla nacional no conserva filas 999 m visibles

### Requirement: Flujo E2E de login y visibilidad por rol
La suite SHALL verificar contra la API real: credenciales válidas de ADMIN
redirigen al dashboard; credenciales inválidas muestran el error "Credenciales
inválidas" SIN distinguir usuario inexistente de password errónea
(anti-enumeración del contrato); y tras login, la navegación filtra por rol — un
USER no ve "Entrenamientos" ni "Tabla nacional" mientras un ADMIN sí.

#### Scenario: Credenciales válidas
- **WHEN** el spec envía las credenciales de `admin.demo` en el formulario real
- **THEN** llega al dashboard autenticado

#### Scenario: Credenciales inválidas
- **WHEN** el spec envía una combinación inválida
- **THEN** se muestra el mismo mensaje seguro "Credenciales inválidas" sea cual
  sea la causa del fallo

#### Scenario: Visibilidad por rol en el nav
- **WHEN** el spec inicia sesión como USER
- **THEN** el nav no contiene "Entrenamientos" ni "Tabla nacional"

### Requirement: Flujo E2E de alta de deportista en dos pasos
La suite SHALL verificar el alta real de un deportista a través del wizard de dos
pasos (datos del atleta y perfil) con un nombre único, terminando en la ficha del
atleta y visible en la lista.

#### Scenario: Alta completa desde la UI
- **WHEN** un ADMIN completa el wizard con un atleta único y continúa al perfil
- **THEN** la ficha del atleta se abre y el atleta aparece en la lista

### Requirement: Flujo E2E de pase de lista persistente
La suite SHALL verificar el pase de lista real: con una sesión creada vía API, un
ADMIN marca asistencia desde la UI (presente y ausente) y los estados persisten
tras recargar la página (verifica el upsert contra la API, no solo el render).

#### Scenario: Asistencia persiste tras recarga
- **WHEN** el spec marca un atleta PRESENTE y otro AUSENTE y recarga la página
- **THEN** la grilla muestra ambos estados tal como quedaron guardados

### Requirement: Flujo E2E de chequeo y comparación con referencia
La suite SHALL verificar el registro real de un chequeo con su tiempo (input
`mm:ss.fff`) y la comparación contra el triple de referencia reservado, asertando
en el DOM el string `timeFormatted` y los deltas `*Formatted` que devuelve el
servidor (el front nunca formatea).

#### Scenario: Comparación renderiza los tiempos del servidor
- **WHEN** el spec crea el chequeo y el tiempo MARIPOSA 999 desde la UI y pulsa
  "Comparar"
- **THEN** el panel muestra las 3 posiciones del triple reservado y el
  `timeFormatted` visible coincide exactamente con el del detalle devuelto por la
  API

### Requirement: Flujo E2E de generación y descarga de PDF
La suite SHALL verificar contra la API real la generación síncrona de un reporte
INDIVIDUAL (spinner durante la request; `status` final `GENERATED` leído de la
201), la descarga del PDF binario con el filename del `Content-Disposition` y
magic number `%PDF`, y que ante un fallo de generación del servidor el dialog
permanece abierto mostrando un mensaje seguro redactado por el front (nunca el
texto crudo del backend). El estado `FAILED` con `errorMessage` visible queda
cubierto por la suite unit: contra el backend real el fallo de ensamblado
responde 500 (transacción anidada rollback-only) y no `201 FAILED` — prerrequisito
registrado en doc 09.

#### Scenario: Reporte generado y descargado
- **WHEN** un ADMIN genera un reporte INDIVIDUAL de un atleta con chequeos y pulsa
  "Descargar PDF"
- **THEN** la descarga produce un archivo que comienza con `%PDF` con el nombre
  del `Content-Disposition` (fallback `reporte-{id}.pdf`) y tamaño > 0

#### Scenario: Generación fallida visible
- **WHEN** un ADMIN genera un reporte INDIVIDUAL cuyo ensamblado falla en el
  servidor (tiempo sin triple de referencia → 500)
- **THEN** el dialog permanece abierto mostrando el mensaje seguro de validación,
  sin filtrar el texto crudo del backend

### Requirement: Criterio de cierre contra el backend real
El change SHALL considerarse completo solo cuando la suite E2E completa pase en
verde contra el backend real levantado en local. Si el entorno no permite la
ejecución real, el cambio MUST declararlo como desviación y permanecer abierto
hasta lograrla — la ejecución real es el entregable del change.

#### Scenario: Cierre del change
- **WHEN** `npm run test:e2e` termina en verde contra `:8080` con los cinco
  flujos
- **THEN** el change puede cerrarse y archivarse
