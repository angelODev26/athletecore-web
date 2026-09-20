## ADDED Requirements

### Requirement: Cliente HTTP con Bearer token
El sistema SHALL proveer un cliente `fetch` central que adjunte el access token del store de sesión en las llamadas autenticadas hacia la API.

#### Scenario: Request autenticado
- **WHEN** existe un access token válido en sesión y se ejecuta una llamada protegida
- **THEN** el request incluye `Authorization: Bearer <token>`

### Requirement: Manejo uniforme de errores del contrato
El sistema SHALL mapear cualquier respuesta de error del backend al tipo único `ErrorResponse`; además, `401` SHALL disparar redirección a login y `403` SHALL mostrar estado de sin permisos.

#### Scenario: Token expirado
- **WHEN** la API responde `401`
- **THEN** la sesión se limpia y el usuario es enviado a login

#### Scenario: Error de negocio
- **WHEN** la API responde un error con cuerpo `ErrorResponse`
- **THEN** el cliente retorna un error tipado con `status`, `message` y campos del contrato sin lanzar excepciones no controladas

### Requirement: TanStack Query configurado
El sistema SHALL configurar un `QueryClientProvider` con opciones base para queries/mutations y claves estables por módulo.

#### Scenario: Query de lista de atletas
- **WHEN** un hook de datos consulta atletas
- **THEN** usa una query key estable como `["athletes", filtros]` y el resultado queda cacheado por TanStack Query

### Requirement: Adapter de paginación client-side
El sistema SHALL proveer un adapter que convierta respuestas del contrato al modelo de paginación consumido por la UI, de forma que una futura migración a server-side solo cambie el adapter.

#### Scenario: Normalizar una lista paginada
- **WHEN** se recibe una respuesta de lista del backend
- **THEN** el adapter devuelve `items`, `page`, `pageSize` y `totalItems` en el shape usado por las tablas/listas

### Requirement: Sin cálculo de reglas de negocio en el cliente
La capa de datos MUST NOT calcular BMI, clasificación, rachas ni proyecciones; esos valores SHALL venir del servidor.

#### Scenario: Dato derivado presente en respuesta
- **WHEN** el backend incluye un campo calculado como BMI o clasificación
- **THEN** la UI lo muestra tal cual sin recalcularlo en el front
