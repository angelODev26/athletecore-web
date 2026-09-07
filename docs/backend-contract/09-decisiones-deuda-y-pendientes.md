# 09 — Decisiones tomadas, deuda técnica y pendientes que afectan al front

> Compilado de: `TASKS.md` (bloqueantes y backlog congelado), docs de diseño OpenSpec
> (`openspec/changes/*/design.md`) y revisiones de código hechas para este handoff.
> Cada entrada dice: **qué se decidió / qué falta decidir**, **cómo afecta al front** y
> **qué debe hacer el front MIENTRAS no se resuelva**.

---

## 1. 🔴 DECISIONES PENDIENTES — definir ANTES o DURANTE el sprint 0 del front

### D1. Refresh token: sí o no

- **Hoy:** solo access token de 24 h (`JWT_EXPIRATION`); la sesión muere y toca re-login.
- **Impacto front:** define TODO el flujo de sesión (pantalla de expiración, "recuérdame",
  renovación silenciosa, almacenamiento).
- **Opción A (cero backend):** front asume re-login diario; interceptor 401 → login.
  Razonable para una herramienta interna de staff.
- **Opción B:** el back implementa refresh tokens (ya listado en backlog de seguridad
  POST-v1.0.0; habría que adelantarlo).
- **Recomendación:** decidirlo ahora; si la respuesta es "después", construir el módulo de
  auth del front detrás de una abstracción (`AuthTokens { access, refresh? }`) para que
  añadir refresh luego no rompa pantallas.

### D2. Paginación de listados: ¿back o front?

- **Hoy:** solo athletes pagina; el resto devuelve colecciones completas (lista exacta
  en `08` §3).
- **Impacto front:** tablas de usuarios, reportes, chequeos, alertas, planes.
- **Mientras tanto:** paginación client-side + adapters en la capa de datos.
- **Decisión:** ¿se paga ahora la paginación server-side para los listados que el front
  usará más (reports, checkups) o se acepta client-side hasta v1.0?

### D3. Alertas: acknowledge no persistente

- **Hoy (deuda reconocida en TASKS.md):** `POST /alerts/attendance/{athleteId}/acknowledge`
  valida y devuelve la alerta pero **no persiste nada**; la alerta reaparecerá en el próximo
  `GET` mientras la racha siga viva. La racha solo muere con un `PRESENTE` o `JUSTIFICADO`.
  La corrección contemplada por el back es una entidad `AlertAcknowledgment` (nueva migración).
- **Impacto front:** badge de "alertas nuevas", botón "marcar como vista".
- **Mientras tanto:** mantener un store local de acknowledgments con clave
  `(athleteId, lastAbsenceDate)`; **no prometer** en UI que el reconocimiento es permanente.
- **Decisión:** ¿se construye la bandeja con ACK local (rápido) o se espera a la
  persistencia en back (correcto)?

### D4. Catálogos maestros: deportes y disciplinas

- **Hoy:** hay `POST /athletes/sports` (ADMIN) pero **no hay** edición/borrado de deportes,
  **ni CRUD de disciplinas**, ni endpoint que devuelva el *nombre* de una disciplina
  (`disciplineIds` son IDs huérfanos de contexto — ver `04` §4). Tampoco hay seed de
  deportes/disciplinas en las migraciones (solo roles).
- **Impacto front:** selectores de deporte/disciplina; la pantalla de sesión pide
  `disciplineId` sin poder mostrar su nombre.
- **Decisión:** ¿el back añade `GET /disciplines` (y seed inicial) antes del front, o el
  catálogo se mantiene por DB/scripts y el front solo muestra IDs? **Recomendación fuerte:
  exponer disciplinas (id+nombre por deporte) antes de construir formularios de training.**

### D5. Foto de perfil

- **Hoy:** `photoUrl` es solo una URL (string); no hay upload/storage.
- **Decisión:** ¿el front implementa input de URL (suficiente para MVP) o se requiere
  upload real (backend nuevo: storage, multipart, límites)? Si es lo segundo, planificarlo
  aparte — no está ni en el backlog congelado.

---

## 2. 🟡 DEUDA TÉCNICA DEL BACK QUE EL FRONT YA DEBE TOLERAR (no requiere decisión)

| # | Deuda | Qué debe hacer el front |
|---|-------|------------------------|
| T1 | Errores de validación 400 sin campo estructurado (ver `08` §1) | Validación completa client-side replicando las reglas de `03`–`07` |
| T2 | Mensajes de error mezclados ES/EN (`"... not found with id..."`, `"... already exists"`) | i18n propio; no renderizar texto crudo sin mapear |
| T3 | Generación de reportes síncrona (puede tardar segundos) | Spinner + lectura de `status`; diseño compatible con futuro async (polling) |
| T4 | Proyección de medallería calculada on-the-fly, sin histórico | No prometer "histórico de proyección"; posible latencia |
| T5 | Chequeos y tiempos sin `PUT` (solo crear/borrar) | UI de "corregir" = borrar y recrear; confirmar con usuario |
| T6 | `birthDate` ausente del DTO de creación de atleta | Alta en 2 pasos (POST + PUT) o pedir al back incluirlo |
| T7 | `UserResponse` sin roles → tabla de usuarios sin columna de rol | La pantalla de admin de usuarios solo muestra datos básicos |
| T8 | No hay `/me`, ni logout, ni edición/password de usuarios | Sesión 100% basada en decodificar el JWT + `user` del login |
| T9 | Reportes: lista filtrada en memoria | Cap de resultados en UI; refinar filtros antes de llamar |
| T10 | Sin rate limiting ni brute-force en back | El front aplica sus propias mitigaciones de UX (bloqueo temporal del botón de login) |

---

## 3. 🟢 DECISIONES DE ARQUITECTURA DEL BACK — firmes, el front debe alinearse

Estas **no se van a cambiar** (son convenciones del proyecto, ver `core/principles.md`):

1. **DTOs como contrato total.** Lo que un DTO no trae, no existe para el front
   (nada de campos de auditoría salvo en checkup/reports; nada de relaciones anidadas
   completas). Pedir campos extra = nueva feature de back.
2. **Soft delete universal con `@SQLRestriction`.** Ningún endpoint devuelve borrados;
   404 tras DELETE es el comportamiento correcto, no un bug.
3. **Seguridad stateless.** Cada request lleva su JWT; no hay sesiones, cookies ni CSRF.
4. **RBAC de 3 roles** con asignación manual fuera de la API (registro = siempre USER).
   La gestión de roles por UI requiere feature nueva.
5. **IDs numéricos autoincrementales** expuestos en URL y JSON.
6. **Formato de tiempos doble** (segundos + `mm:ss.fff`) — convención deliberada del
   módulo checkup; usar el string formateado del servidor en toda visualización.
7. **Lógica derivada preferida a persistencia** cuando el dato se puede recomputar
   (alertas, proyección, BMI calculado server-side): el front **nunca calcula** BMI,
   clasificación ni rachas — siempre lee el valor del servidor.
8. **API privada con CORS cerrado por defecto.** En prod, el front se sirve desde un
   origen explícitamente listado en `CORS_ORIGINS` (o mismo origen). No se habilitará `*`.
9. **Errores centralizados** en un único shape (`ErrorResponse`) — ver `08`.

---

## 4. ⚙️ Hallazgos de consistencia detectados al preparar este handoff

Bugs/mismatch menores que conviene arreglar en el back (baratos, independientes del front):

| # | Hallazgo | Dónde |
|---|----------|-------|
| H1 | `docker-compose.yml` inyecta `CORS_ALLOWED_ORIGINS`/`JWT_EXPIRATION_MS` pero el código lee `CORS_ORIGINS`/`JWT_EXPIRATION` → CORS roto en el contenedor `app-dev` | `01` §2 |
| H2 | `GET /api/v1/athletes/{id}/sports` y `POST .../sports` devuelven solo IDs; la UI necesitará el catálogo cacheado (mitigable) — pero las **disciplinas** ni siquiera tienen catálogo consultable | `04` §4, D4 |
| H3 | El endpoint de acknowledge de alertas devuelve 200 con la alerta "acknowledgement" sin persistir; riesgo de que un front desprevenido lo trate como funcional | `05` §5, D3 |
| H4 | Swagger UI protegido por JWT (decisión consciente pero sorprendente); alternativa: moverlo a perfil local si se quiere exploración sin login | `01` §4 |

---

## 5. Checklist de alineación back↔front antes de empezar a codear

- [ ] **D1** refresh token: ¿sí/no? (si no, abstracción de tokens en el front)
- [ ] **D2** paginación: client-side aceptada formalmente
- [ ] **D3** alertas: ACK local vs persistir en back
- [ ] **D4** disciplinas: pedir `GET` de catálogo al back (recomendado) + seed inicial
- [ ] **D5** foto: URL simple (recomendado para MVP) vs upload
- [ ] Acordar puerto/origen del dev server del front para `CORS_ORIGINS` (default 5173)
- [ ] Crear usuarios ADMIN y COACH de desarrollo en la DB local (procedimiento en `01` §5)
- [ ] Definir si los mensajes de error se mapean por código (recomendado) con tabla ES propia

---

**Anterior:** `08-convenciones-transversales.md` · Fin del paquete (volver a `00`).
