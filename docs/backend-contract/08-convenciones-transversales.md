# 08 — Convenciones transversales (errores, paginación, formatos, soft delete)

> Fuentes: `GlobalExceptionHandler`, `ErrorResponse`, excepciones de `common/exception`,
> `RestAuthenticationEntryPoint`/`RestAccessDeniedHandler`, `BaseEntity`.
> **Este archivo es el contrato del cliente HTTP del front**: el interceptor de errores y
> el wrapper de fetch/axios deberían construirse exactamente contra estas reglas.

---

## 1. Formato único de error: `ErrorResponse`

Toda respuesta de error de la API (incluidos 401/403 del filtro de seguridad) usa:

```json
{
  "timestamp": "2026-09-06 14:32:10",
  "status": 400,
  "error": "Bad Request",
  "message": "Error de validación",
  "details": "El año debe estar entre 1900 y 2100, La categoría es obligatoria"
}
```

| Campo | Tipo | Notas |
|-------|------|-------|
| `timestamp` | string | formato `"yyyy-MM-dd HH:mm:ss"` (LocalDateTime, sin zona) |
| `status` | number | código HTTP |
| `error` | string | reason phrase estándar (`"Not Found"`, `"Bad Request"`…) |
| `message` | string | mensaje principal (legible) |
| `details` | string \| **ausente** | ⚠️ la clave se OMITE del JSON si es null (`@JsonInclude(NON_NULL)`) |

### ⚠️ Los errores de validación NO vienen estructurados por campo

`GlobalExceptionHandler` concatena **solo los mensajes** de todos los campos con `", "`
en `details` — **sin nombres de campo**. Ejemplo real:

```json
{ "status": 400, "message": "Error de validación",
  "details": "El peso debe ser al menos 1.0 kg, La talla es obligatoria" }
```

**Consecuencia para el front:** no se puede mapear `details` a inputs específicos del
formulario. Estrategia recomendada: **validar en el cliente con las mismas reglas**
(están documentadas campo a campo en `03`–`07`) y mostrar los errores 400 del servidor
en un toast/genérico como red de seguridad. (Pedir al back un formato por campo es una
mejora candidata — ver `09`.)

Los mensajes están en español en la mayoría de módulos, pero **algunos en inglés**
(registro de usuarios, y los formatos tipo `"... not found with ..."` /
`"... with ... already exists"`). No mostrarlos crudos al usuario final sin pasar por
la capa de i18n del front.

## 2. Tabla de códigos de error

| Status | Excepción/origen | Cuándo | `message` típico |
|--------|------------------|--------|------------------|
| `400` | `MethodArgumentNotValidException` | Validación Jakarta de DTO | `"Error de validación"` + campos en `details` |
| `400` | `ValidationException` (negocio) | Reglas de dominio (jerarquía ciclos, sesión cancelada, passwords distintas…) | mensaje de la regla, errores en `details` |
| `400` | `HttpMessageNotReadableException` | JSON mal formado / enum inválido | message genérico de parseo |
| `401` | `InvalidCredentialsException` | Login fallido | `"Credenciales inválidas"` |
| `401` | Filtro de seguridad | Sin token / token inválido / **expirado** | `"Autenticación requerida"` |
| `403` | `@PreAuthorize` / URL rules | Rol insuficiente | `"Acceso denegado"` |
| `404` | `ResourceNotFoundException` | ID inexistente **o borrado (soft delete)** | `"Athlete not found with id: '7'"` (inglés) |
| `404` | `NoResourceFoundException` | Ruta inexistente | genérico |
| `409` | `DuplicateResourceException` | Unicidad violada (username/email, chequeo, tiempo de prueba) o **triple de referencia incompleto** (checkup comparison) | `"X with y already exists"` / mensaje específico |
| `500` | `Exception` catch-all | Cualquier otra | genérico |

Reglas del interceptor del front:

- `401` → cerrar sesión y redirigir a login (nunca reintentar).
- `403` → vista "sin permisos" (no confusionar con sesión expirada).
- `409` → conflicto de datos: mostrar `message`/`details` (ya orientado al caso).
- `404` → "no encontrado" (incluye recursos borrados).
- `400` → si el front ya validó, mostrar `details` tal cual.
- `5xx` → pantalla/toast de error inesperado + retry manual.

---

## 3. Paginación: el punto más delicado del contrato

**Solo un endpoint está paginado:** `GET /api/v1/athletes` (Spring `Page`, ver `04` §2).

**Todos los demás listados devuelven arrays completos en memoria**, sin parámetros
`page/size` (y devolverán 400 si se envían con tipos incompatibles, simplemente los
ignoran). Formalmente reconocido como bloqueante en `TASKS.md`:

| Listado SIN paginar |
|---------------------|
| `GET /api/v1/users` |
| `GET /api/v1/training-plans`, `/{planId}/cycles`, sesiones por ciclo |
| `GET /api/v1/athletes/{id}/checkups`, `GET /api/v1/national-reference-times` |
| `GET /api/v1/reports`, `GET /api/v1/report-schedules`, exports |
| `GET /api/v1/alerts/attendance` |
| `GET /api/v1/athletes/sports` |

**Criterio para el front:**

- Diseñar estos listados con **paginación client-side** (o virtualización) desde el día
  uno, sin bloquear el render esperando scroll infinito del servidor.
- Cuando el back pagine (POST-v1.0.0), el shape cambiará de `T[]` a `Page<T>` — encapsular
  cada listado tras un adapter en la capa de datos del front para que el cambio sea local.
- Volumen esperado manejable hoy (deportistas sí crece — por eso ES el paginado).

---

## 4. Formatos de datos

| Concepto | Formato en JSON | Ejemplo |
|----------|-----------------|---------|
| Fecha | `LocalDate` ISO | `"2026-03-15"` |
| Hora | `LocalTime` ISO | `"07:30:00"` |
| Timestamp | `Instant` ISO-8601 UTC (solo checkup/reports exponen algunos) | `"2026-09-01T10:00:00Z"` |
| Timestamp en **errores** | `"yyyy-MM-dd HH:mm:ss"` (¡distinto!) | `"2026-09-06 14:32:10"` |
| Decimales | `BigDecimal` → JSON number | `65.250` puede llegar como `65.25` |
| IDs | `Long` → number | `123` |
| Tiempos de prueba | número en segundos + string `mm:ss.fff` precalculado | `65.25` / `"01:05.250"` (ver `06`) |
| Enums | strings en MAYÚSCULAS (`EnumType.STRING`) | `"PROGRAMADA"` |

⚠️ BigDecimal: Jackson serializa el valor tal cual (`63.300` → `63.3`). El front NO debe
comparar ni mostrar el número crudo para tiempos: usar siempre el campo `*Formatted`.

---

## 5. Soft delete universal (y qué esperar)

- Todo `DELETE` exitoso responde `204 No Content`, sin body.
- El recurso desaparece de listados y de `GET /{id}` (404). **No hay undelete ni papelera.**
- No hay "cascada" explícita de borrado documentada por API; borrar un plan no borra
  necesariamente las sesiones visibles por otras vías — el front no debe asumir
  comportamientos en cascada.
- Los campos `active: true/false` que aparecen en varios DTOs reflejan `!deleted`; en
  listados siempre vendrá `true` (los borrados ya se filtran). Trátalo como informativo.

---

## 6. Misceláneas del cliente HTTP

- **Content-Type:** siempre `application/json` salvo la descarga de PDF (`07` §3).
- **CORS:** solo habilitado en perfil `local` del back (orígenes `localhost:3000/5173`);
  ver `01`.
- **SSL/HTTPS**: no configurado en dev; todo `http://localhost:8080`.
- **Health:** `/actuator/health` solo expuesto en perfil `local`.
- **Trazabilidad:** los DTOs **no exponen auditoría** salvo excepciones documentadas
  (checkup y reports sí traen `createdAt`/`updatedAt`).

---

**Anterior:** `07-contrato-api-reportes.md` · **Siguiente:** `09-decisiones-deuda-y-pendientes.md`
