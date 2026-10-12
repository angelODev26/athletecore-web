# Tareas: integrar-autenticacion

## 1. Diseño: tema y componentes base

- [x] 1.1 Ejecutar `shadcn init` (components.json, `cssVariables: true`).
- [x] 1.2 Instalar vía MCP: `button`, `input`, `label`, `card`, `alert`, `form` (y sus peer deps del registry). Nota: el CLI v4.21 escribió en un directorio literal `@/` y `add form` hizo no-op por fallo de red; `form.tsx` se obtuvo del registry oficial (`new-york-v4`) con imports reescritos a los alias del proyecto.
- [x] 1.3 Reescribir `globals.css`: tema dark con `color-scheme: dark`, `@theme inline` mapeado a `src/styles/tokens.css`, variables shadcn aliased a tokens semánticos; eliminada la paleta light. Nota: `scripts/check-hardcoded-styles.mjs` ahora excluye `src/components/ui` (código del registry, con valores arbitrarios propios; solo se controla el uso).
- [x] 1.4 `npm run design:check` ✅ y `npm run build` ✅.

## 2. Shell y estados alineados a DESIGN.md

- [x] 2.1 AppShell: sidebar 240px sobre `surface.sidebar`, nav activo con relleno `action.primary` y `text.on-primary`, plano sin sombras, radios de control, colapso a barra superior bajo `md:` (DESIGN.md pide 860px; no hay token de breakpoint — aproximación documentada).
- [x] 2.2 `states.tsx` reescrito con los nuevos tokens sin cambiar la API pública.
- [x] 2.3 Screenshots Playwright MCP del shell (as USER y ADMIN) verificados.

## 3. Capa de sesión y contrato auth

- [x] 3.1 Store: persist en `localStorage` + `expiresAt` (claim `exp` o `expiresIn`), hidratación automática al cargar.
- [x] 3.2 Tipos del contrato en `src/lib/api/types.ts`: `LoginRequest`, `LoginResponse`, `UserResponse`, `RegisterRequest`.
- [x] 3.3 Hooks TanStack en `src/modules/auth/auth-api.ts`: `useLoginMutation` y `useRegisterMutation` (ambos `auth:false`).
- [x] 3.4 Interceptor 401 → clearSession + /login (excepto ya en /login); 403 → ForbiddenState sin redirect (verificado en navegador).
- [x] 3.5 Expulsión proactiva: timer en guards hasta `exp` → clearSession + redirect (verificado).
- [x] 3.6 `RequireGuest`: rutas públicas redirigen a `/` con sesión vigente.

## 4. Páginas

- [x] 4.1 `/login`: card centrada, inputs con estados, banner destructivo `role="alert"` ante 401 ("Credenciales inválidas"), botón disabled mientras pending, link a `/registro`.
- [x] 4.2 `/registro`: campos del contrato con validación local en español, 409 → error en campo username, 201 → redirect a `/login?registrado=1` con aviso.
- [x] 4.3 Screenshots Playwright MCP de login (idle, validación, error servidor), registro, dashboard USER vs ADMIN.

## 5. Tests y cierre

- [x] 5.1 Tests unitarios: expiry helpers de JWT, store (setSession exp/fallback, persistencia, clearSession). 24 tests en verde. Nueva devDep `jsdom` para el entorno de DOM.
- [x] 5.2 `npm run test`, `npm run build`, `npm run design:check` en verde.
- [x] 5.3 `AGENTS.md` actualizado (nueva ruta `src/components/ui`, `components.json`, exclusion del checker).

## Revisión (/review) — hallazgos resueltos sin deuda

- [x] R1 (H1, contrato API): 409 de registro distingue `email` vs `username` por `payload.message` → `getDuplicateField` en `src/lib/api/messages.ts`; error por campo correcto. Spec actualizado con scenario "Email duplicado".
- [x] R2 (H2): errores 400 mapean `details`/`message` conocidos del contrato a español (`toUserFacingMessage`); texto desconocido nunca se muestra crudo (fallback seguro). Tests dedicados.
- [x] R3 (H3): autorreferencias de radios resueltas con alias intermedios `--dt-*` unlayered — estable aunque `build-tokens.mjs` envuelva tokens.css en capa.
- [x] R4 (H4): añadidos `--secondary` y `--foreground` crudos que el registry referencia (hover de `variant="secondary"`).
- [x] R5 (H5): filtro de nav por ítem (`hasAnyRole(userRoles, item.roles)` en vez de booleano único).
- [x] R6 (H6): username memoizado con `useMemo` sobre el token.

## Notas / deuda registrada en el change

- E2E real contra backend pendiente: `localhost:8080` no respondía durante la implementación. El flujo 401/banner se verificó con backend apagado (error genérico); el happy path de login real requiere levantar `athletecore-api` (o lo cubre el change de `e2e-tester`).
- `.playwright-mcp/` añadido a `.gitignore`.
- Deps retiradas por quedar sin uso: `@fontsource-variable/geist`, `shadcn` (el preset usa Inter per DESIGN.md §4/§9 - tipografía provisional).
