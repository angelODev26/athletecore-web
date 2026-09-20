## Context

El repositorio ya tiene el contrato funcional y técnico del backend bajo `docs/backend-contract/`, además de decisiones de arquitectura del sprint 0 en `AGENTS.md`, pero aún no existe la SPA. Este cambio genera la base ejecutable del cliente con las tecnologías congeladas: React 19, TypeScript, Vite 8, Tailwind 4 y shadcn/ui.

Restricciones heredadas: JWT Bearer, `401`→login, `403`→sin permisos, `ErrorResponse` único, soft delete universal, y el front nunca calcula BMI/clasificación/rachas. D1 (sin refresh token), D2 (paginación client-side con adapters), D3 (acknowledge local de alertas), D4 (sin catálogo de disciplinas) y D5 (foto por URL) ya están decididas.

## Goals / Non-Goals

**Goals:**

- Dejar corriendo `npm run dev` con una app React 19 + TS construible con `npm run build`.
- Crear `src/` con separación Clara: `src/app` (router/shell/proveedores), `src/modules/*` (pantallas placeholder), `src/shared` (UI compartida/tema) y `src/lib/api` (capa de datos).
- Proveer shell con navegación, rutas iniciales y estados vacíos/cargando/error compartidos.
- Proveer cliente HTTP tipado con Bearer token, mapeo de `ErrorResponse`, QueryClient y adapters de paginación client-side.
- Preparar la base visual con Tailwind 4 y tokens propios, con un solo acento de color.

**Non-Goals:**

- No implementar lógica completa de módulos (`athletes`, `training`, `checkups`, `reports`); solo rutas/placeholders integrables.
- No implementar refresh token ni login real completo (solo la abstracción de sesión para soportar interceptores y guards).
- No instalar manualmente componentes shadcn; eso queda para `design-system-keeper` usando el MCP shadcn.
- No tocar backend ni specs/archivos fuera de este cambio.

## Decisions

1. **Stack fijo en `package.json`**: React 19 + TypeScript + Vite 8.  
   Rationale: ya está acordado en `AGENTS.md`. Alternativa: Next.js descartada porque la API ya existe por separado y se quiere SPA simple.

2. **Routing con React Router y guards por rol**.  
   Rationale: permite rutas públicas (login), privadas y restricciones ADMIN/COACH sin lógica de servidor. Alternativa: enrutado manual descartado por mantenibilidad.

3. **Capa de datos en `src/lib/api` con fetch + interceptores + TanStack Query**.  
   Rationale: cumple `api-client-keeper`: tipos TS, Bearer, `401`→login, `403`→sin permisos, `ErrorResponse`. Alternativa: Axios descartado para evitar dependencia extra y mantener control del contrato.

4. **Estado de sesión con Zustand detrás de una abstracción `AuthTokens { access, refresh? }`**.  
   Rationale: cumple D1 (sin refresh hoy) sin bloquear futura migración. Alternativa: Context puro descartado para evitar re-renders y lógica de persistencia dispersa.

5. **Tailwind 4 con tokens CSS propios y un solo acento**.  
   Rationale: cumple reglas duras de UI (evitar kit SaaS genérico). Los componentes se consumirán desde shadcn pero el tema vive en `src/shared/theme`.

6. **Estructura preparada para agentes especializados**.  
   Rationale: carpetas por módulo y `data-testid`/`AGENTS.md` consistentes permiten repartir trabajo a `athletes-ui`, `training-ui`, `checkups-ui`, `reports-ui`.

## Risks / Trade-offs

- [Riesgo] Vite 8/tooling pueden tener incompatibilidades menores con plugins. → Mitigation: fijar versiones exactas y validar `npm run build` antes de cerrar el cambio.
- [Riesgo] El backend puede no estar corriendo en `localhost:8080` durante el scaffolding. → Mitigation: centralizar baseURL en `import.meta.env.VITE_API_URL` con default `http://localhost:8080`.
- [Trade-off] Rutas placeholder generan UI "vacía" temporalmente. → Aceptado: el objetivo del cambio es la base, no las features.
