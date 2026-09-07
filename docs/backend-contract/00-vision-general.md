# 00 — Visión General de AthleteCore (Handoff para Frontend)

> **Propósito de este documento:** es el archivo de entrada de un paquete de 10 documentos
> (`00` a `09`) que describe el backend **AthleteCore API** con suficiente detalle para que
> un motor de IA (o un desarrollador) construya el frontend **sin necesidad de leer el código
> fuente del backend**. Léelo primero y completo antes de tocar cualquier otro archivo.

---

## 1. Qué es AthleteCore

AthleteCore es una **API REST para la gestión del rendimiento deportivo de atletas**,
orientada a federaciones/clubes que manejan deportistas de disciplinas cronometradas
(natación, atletismo, etc.). El dominio gira alrededor de 5 capacidades:

1. **Usuarios y seguridad** — registro, login, roles (RBAC con JWT).
2. **Deportistas (Athlete)** — registro, datos sociodemográficos, perfil antropométrico,
   foto de perfil, asignación de deportes/disciplinas.
3. **Entrenamientos (Training)** — planificación jerárquica (plan anual → mesociclo →
   microciclo → sesión), control de asistencia y **alertas por ausencias consecutivas**.
4. **Chequeos mensuales (Checkup)** — registro de tiempos de prueba, comparación contra la
   **tabla nacional de referencia**, proyección de medallería y clasificación del deportista.
5. **Reportes (Report)** — reportes individuales y de equipo, exportación a **PDF**,
   programación automática de reportes (cron).

El frontend que se va a construir es el **único cliente** de esta API. No hay otro consumidor.

---

## 2. Estado actual del backend (qué hay y qué falta)

### 2.1 Completado ✅

Todos los módulos de negocio están **implementados, testeados y mergeados a `develop`**:

| Módulo | Versión | Estado | Tests |
|--------|---------|--------|-------|
| User/Security (auth, JWT, RBAC) | v0.1.0 | ✅ Completo | Incluido en suite |
| Deportistas | v0.2.0 | ✅ Completo | 26 unitarios |
| Entrenamientos | v0.3.0 | ✅ Completo | 54 unitarios |
| Chequeos | v0.4.0 | ✅ Completo | 72 (59 unit + 13 e2e) |
| Reportes | v0.5.0 | ✅ Completo | 21 unitarios |

- **Base de datos:** PostgreSQL 15 con **5 migraciones Flyway aplicadas**
  (`V1` initial · `V2` athletes · `V3` training · `V4` checkup · `V5` reports).
  El esquema es estable; cualquier cambio futuro será una migración nueva (`ddl-auto=validate`).
- **CORS y OpenAPI/Swagger** ya están configurados (commit `293f0dd`) — ver archivo `01`.
- Rama actual: `develop`, sin WIP sin commitear.

### 2.2 Lo que falta (backlog congelado — POST-v1.0.0)

Estas cosas **NO existen** y están explícitamente diferidas a después del frontend.
El frontend **no debe asumirlas** ni diseñar pantallas que las requieran:

- ❌ **Refresh tokens JWT** (solo access token de 24 h — ver archivo `02`, es la decisión
  con mayor impacto en el front).
- ❌ **Paginación en todos los listados excepto deportistas** (ver archivo `08`, bloqueante
  conocido; el front debe estar preparado para listas completas).
- ❌ Rate limiting, brute-force protection, MFA, audit log.
- ❌ Caching (Redis), async processing de reportes.
- ❌ Observabilidad (Actuator/health personalizados, métricas, tracing).
- ❌ CI/CD, despliegue.
- ❌ Tests de integración / TestContainers.

> Esto está formalmente congelado en `TASKS.md` sección "Mejoras de Infraestructura —
> CONGELADO — POST-v1.0.0". Si el front necesita algo de esta lista, hay que levantarlo
> como decisión pendiente (ver archivo `09`), no asumirlo.

---

## 3. Stack técnico del backend (contexto mínimo para el front)

| Capa | Tecnología | Relevancia para el front |
|------|-----------|--------------------------|
| Framework | Spring Boot 3.5.6 (Java 21) | API REST JSON, convenciones Spring |
| Auth | Spring Security + **JWT (stateless)** | Header `Authorization: Bearer <token>` |
| Base de datos | PostgreSQL 15 + Flyway | No expuesta al front; define nulos/opcionalidad de campos |
| IDs | `Long` autoincrementales | Las URLs llevan `/api/v1/athletes/123` (numérico) |
| Fechas | `LocalDate` / `LocalDateTime` (ISO-8601) | Sin timezone; el servidor usa hora local |
| Borrado | **Soft delete** en TODO (`deleted_at`) | Los recursos "eliminados" desaparecen de las listas; no hay undelete por API |
| Validación | Jakarta Validation | Errores 400 con detalle por campo (ver archivo `08`) |
| Docs | OpenAPI/Swagger | UI disponible en el servidor (ver archivo `01`) |

---

## 4. Arquitectura del backend en 5 ideas (lo que condiciona el front)

1. **Monolito modular por dominio.** Paquetes: `user`, `athlete`, `training`, `checkup`,
   `report`, `domain` (compartido), `config`, `common/exception`. El front verá esta misma
   segmentación en los prefijos de URL: `/api/v1/users`, `/api/v1/athletes`,
   `/api/v1/training-...`, `/api/v1/checkups`, `/api/v1/reports`, etc.

2. **Todo lo que se devuelve es DTO, nunca entidad.** Las respuestas están deliberadamente
   recortadas: no esperes campos de auditoría (`created_at`, `updated_at`, `deleted_at`) en
   la mayoría de los DTOs, ni passwords, ni relaciones anidadas completas. Lo que ves en los
   archivos `03`–`07` es **exactamente** lo que viaja por el cable.

3. **Soft delete universal.** Ningún endpoint borra físicamente. Un `DELETE` devuelve éxito
   y el recurso deja de aparecer en los listados y en los `GET` por id (404). El front no
   puede "recuperar" nada ni necesita papelera.

4. **Seguridad stateless con un solo endpoint público.** Únicamente `POST /api/v1/users`
   (registro) y el login son accesibles sin token; todo lo demás requiere JWT. Hay endpoints
   restringidos a `ROLE_ADMIN` (tabla nacional de referencia, gestión de usuarios). El front
   necesita manejo de roles en UI. Detalles en archivo `02`.

5. **Lógica derivada, no persistida.** Dos casos que afectan directamente a la UX:
   - Las **alertas de ausencias** se calculan on-the-fly desde la asistencia; "acknowledge"
     **no persiste** (la alerta reaparece en la próxima consulta — deuda conocida, ver `09`).
   - La **proyección de medallería** se calcula en tiempo de consulta (no hay tabla); puede
     ser lenta con muchos datos y nunca devuelve histórico.

---

## 5. Decisiones pendientes que el front debe conocer ANTES de diseñar

Resumen (detalle y opciones en el archivo `09`):

| # | Decisión pendiente | Impacto en el front | Urgencia |
|---|--------------------|--------------------|----------|
| D1 | **Sin refresh token** — ¿se implementa antes del front o el front asume re-login cada 24 h? | Flujo completo de sesión, pantallas de expiración | 🔴 Alta — definir en sprint 0 del front |
| D2 | Listados sin paginar — ¿el back pagina antes o el front pagina/renderiza todo? | Todas las tablas/listas excepto deportistas | 🔴 Alta |
| D3 | Acknowledge de alertas no persistente — ¿se modela como "visto" local en front? | Bandeja de alertas, badges | 🟡 Media |
| D4 | Datos maestros (sports, disciplines) — ¿quién los crea? ¿hay seed/admin UI? | Selects y catálogos en formularios | 🟡 Media |
| D5 | Foto de perfil = URL, **no hay subida de archivos** | Input de URL vs. uploader | 🟡 Media |

---

## 6. Convenciones de este paquete de documentos

- **Idioma:** español (todo el proyecto: código, comentarios, commits y docs están en español;
  los identificadores de API son inglés: `athlete`, `checkup`, `trainingPlans`, etc.).
- Los archivos `03`–`07` son **contratos verbatim**: cada endpoint se documenta con método,
  path, auth requerida, request DTO y response DTO con sus campos y tipos reales extraídos del
  código. Si el front y estos docs difieren, **gana el código** (y hay que corregir el doc).
- Cuando un comportamiento es deuda técnica conocida y no definitiva, se marca con
  ⚠️ **DEUDA** y se explica el comportamiento actual que el front debe asumir.
- Fechas de corte del contenido: **2026-09-06**, rama `develop`, commit `293f0dd`.

## 7. Cómo debe usar esto el motor de IA que escribe el front

1. Leer `00` (este) → `02` (auth) → `08` (convenciones: errores, paginación, formatos).
2. Leer `03`–`07` según la pantalla/módulo que vaya a construir.
3. Leer `01` solo si va a levantar el backend localmente o configurar el cliente HTTP.
4. Antes de cualquier decisión de UX no trivial, revisar `09` para no contradecir el backend.
5. Fuente de verdad adicional disponible en el repo: Swagger UI (`/swagger-ui.html` con el
   servidor corriendo) y las specs de OpenSpec en `openspec/specs/`.

---

**Siguiente archivo:** `01-infraestructura-y-setup.md`
