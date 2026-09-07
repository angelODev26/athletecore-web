# athletecore-web

SPA oficial (y única) de **AthleteCore API** — gestión del rendimiento de atletas de disciplinas cronometradas (deportistas, entrenamientos, chequeos mensuales, reportes PDF).

Generado por la capa meta `genesis/` (greenfield, 2026-09-06).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | React 19 + TypeScript + Vite 8 |
| Router | React Router 7 |
| Estado global | Zustand 5 (sesión, catálogos, ACK de alertas) |
| Data-fetching | TanStack Query 5 + fetch nativo (interceptores: Bearer, 401→login, mapeo `ErrorResponse`) |
| Estilos / componentes | Tailwind CSS 4 + shadcn/ui (SIEMPRE vía MCP shadcn) |
| Gráficas | Chart.js 4.5 + react-chartjs-2 |
| Testing | Vitest 5 (unit/componentes) + Playwright 1.63 (E2E y screenshots) |
| Empaquetado | `vite build` → estáticos; Docker multi-stage con Nginx (`try_files $uri /index.html;` + proxy `/api/*`) |

El contrato completo del backend vive en `docs/backend-contract/` — consúltalo antes de cualquier pantalla nueva.

## Plataformas de agentes: Claude Code Y OpenCode

El equipo de agentes especializados existe en las dos carpetas con los mismos nombres y descripciones: `.claude/agents/` y `.opencode/agents/`. Comando `/review` disponible en ambas (`.claude/commands/`, `.opencode/commands/`). Ver el mapa de agentes en `AGENTS.md`.

Los MCP **playwright** y **shadcn** están configurados a nivel de proyecto en `.mcp.json` (Claude Code) y `opencode.json` (OpenCode); ambos corren vía `npx`, sin instalación adicional.

## Levantar el entorno

1. Backend: en `../athletecore-api` → `docker-compose up -d postgres` y `./mvnw spring-boot:run` con perfil `local` (detalles en `docs/backend-contract/01`). El dev server del front usa el puerto **5173**, ya permitido por CORS.
2. Front: `npm install && npm run dev` (tras el bootstrap inicial del scaffold de Vite).

## Protección de la rama principal

Hook activo (`.githooks/pre-commit`, activado con `git config core.hooksPath .githooks`): rechaza commits directos a `main`/`master`. Trabaja siempre en `feature/<descripcion>`. Escape excepcional y justificado: `git commit --no-verify`.

## Prerrequisitos coordinados con athletecore-api (decisiones D1 y D4)

Trabajo en el backend acordado durante la generación de este proyecto (no bloquea el inicio, pero sí ciertas pantallas):

1. **Refresh token (D1)**: el front asume re-login diario de forma transitoria y está construido tras una abstracción de tokens. Cuando el back implemente refresh token, se conecta sin romper pantallas.
2. **Catálogo de disciplinas (D4)**: se requiere `GET /disciplines` (id + nombre por deporte) y seed inicial antes de construir los formularios de training con selector de disciplina.

Resto de decisiones: D2 paginación client-side con adapters · D3 ACK de alertas local · D5 foto por URL. Detalle en `AGENTS.md` y `docs/backend-contract/09`.

## Ciclo de desarrollo

OpenSpec (`openspec/`) orquesta los cambios (propose → apply → archive). No hay agente orquestador: la sesión principal delega según las descripciones de los agentes.
