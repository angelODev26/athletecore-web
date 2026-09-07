# athletecore-web — convenciones del proyecto

SPA en **React 19 + TypeScript + Vite 8**, único cliente de **AthleteCore API** (`http://localhost:8080`, Spring Boot en `../athletecore-api`).

## Fuente de verdad del contrato

`docs/backend-contract/` (docs `00`–`09` + `flujo-completo`). Si un doc y el backend difieren, **gana el código** (`../athletecore-api`, indexado con CodeGraph). Reglas clave: JWT Bearer con roles en el claim del token; `401` → login, `403` → sin permisos; `ErrorResponse` único; soft delete universal (204 + 404 posterior es correcto); el front **nunca** calcula BMI, clasificación ni rachas; tiempos siempre con `timeFormatted` del servidor.

## Reglas duras de UI

- Tras cualquier cambio visual en `components/` o `pages/`, levantar el dev server, navegar con el MCP playwright y tomar screenshot antes de dar la tarea por terminada.
- Usar el MCP shadcn para buscar e instalar componentes del registry real — nunca inventar className ni markup de shadcn/ui a mano.
- Evitar el "kit SaaS genérico": mismo border-radius en todo, sombra gris estándar, eyebrows en mayúsculas, gradientes decorativos, flechas "→" en botones. Un solo acento de color, no dos.

## Decisiones de arquitectura tomadas (sprint 0)

- **D1**: sin refresh token hoy — módulo de auth tras abstracción `AuthTokens { access, refresh? }`; comportamiento transitorio: re-login tras expiración (24 h). Prerrequisito registrado: refresh token en `athletecore-api`.
- **D2**: paginación client-side con adapters en la capa de datos; migración a server-side será un cambio local del adapter.
- **D3**: acknowledge de alertas es local (store `(athleteId, lastAbsenceDate)`); la UI nunca promete persistencia.
- **D4**: sin catálogo de disciplinas en el back — la UI muestra `disciplineId` como dato técnico hasta que exista `GET /disciplines` (prerrequisito registrado).
- **D5**: foto de perfil = input de URL, sin upload.

## Mapa de agentes especializados

| Agente | Dueño de |
|---|---|
| `api-client-keeper` | Tipos TS de DTOs, cliente fetch + interceptores, hooks TanStack Query, adapters de paginación |
| `auth-guardian` | Login/registro, sesión (Zustand), guards por rol, expiración |
| `athletes-ui` | Pantallas de deportistas (lista paginada, ficha, alta 2 pasos, perfil, deportes) |
| `training-ui` | Planes/ciclos/sesiones, pase de lista, alertas (solo ADMIN/COACH) |
| `checkups-ui` | Chequeos, tiempos, comparación, tabla nacional |
| `reports-ui` | Dashboards, gráficas Chart.js, PDFs, programación cron |
| `design-system-keeper` | Shell, tema Tailwind, componentes shadcn compartidos, auditoría visual |
| `e2e-tester` | Playwright E2E, infra de Vitest, data-testid |
| `quality-reviewer` | Revisión de solo lectura (se dispara con `/review`) |

## Flujo de trabajo

- Ramas `feature/*` obligatorias: el hook `.githooks/pre-commit` rechaza commits directos a `main` (ya activo vía `core.hooksPath`).
- El proceso de desarrollo se orquesta con **OpenSpec** (`openspec/`).
- Autonomía: los agentes actúan solos dentro de su rama; piden confirmación solo ante acciones destructivas (borrados masivos, cambios de configuración, nuevas dependencias).
