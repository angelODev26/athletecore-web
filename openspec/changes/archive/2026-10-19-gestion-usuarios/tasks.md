# Tasks: gestion-usuarios

> Implementación según `design.md` (decisiones vinculantes) y los deltas
> `specs/gestion-usuarios/spec.md` + `specs/app-shell-navigation/spec.md`.
> Rama: `feature/gestion-usuarios` (worktree propio). Trabajar solo dentro del
> alcance; desviaciones se anotan abajo. Componentes shadcn SOLO vía MCP.
> Verificación al final: `npm run test`, `npm run build`, `npm run design:check`
> en verde.
>
> **Propietario**: `auth-guardian` (dueño del dominio auth/users).
>
> **Alcance final de este change**: SOLO la fase A (lista `/usuarios` solo
> ADMIN). La **fase B** (dialog de alta con rol, corte del registro público,
> admin sembrado) se **escindió** a
> `openspec/changes/alta-usuarios-admin/`, bloqueado por D7 (§C7 de su design).
> Este change se cierra y archiva con la fase A implementada y revisada.

## Fase A — Lista de usuarios

- [x] A.1 Verificar la rama: `git branch --show-current` →
      `feature/gestion-usuarios` (worktree propio; no tocar el worktree de
      `e2e-flujos-criticos`).
- [x] A.2 Crear `src/modules/users/users-api.ts` (C2): `USERS_ROOT_KEY` con
      `moduleQueryKey("users")`, `useUsers()` sobre `GET /users`, paginación
      client-side pageSize 10 reutilizando `paginateClientSide` de training-api.
      Sin tipos nuevos (reutilizar `UserResponse` de `types.ts`).
- [x] A.3 `users-api.test.tsx`: URL/método exactos (`GET /users`), paginación
      local sin nueva llamada al pasar de página, invalidación por
      `USERS_LIST_KEY` (preparada para la mutación del change de continuación).
- [x] A.4 `users-page.tsx` (C1/C4): bajo `RequireRoles(["ADMIN"])`, tabla
      `users-list` (usuario, nombre, email, badge `enabled` informativo sin
      toggle), paginación client-side, estados carga/vacío/error con testids C7.
- [x] A.5 `router.tsx`: ruta `/usuarios` → `UsersPage` bajo
      `RequireRoles(["ADMIN"])`. `app-shell.tsx`: `NAV_ITEMS` gana
      `{ to: "/usuarios", label: "Usuarios", roles: ["ADMIN"] }`.
- [x] A.6 Tests: página con datos (columnas + badge), paginación client-side,
      USER por URL directa → "sin permisos", nav sin "Usuarios" para no-ADMIN
      (`app-shell.test.tsx` actualizado).
- [x] A.7 `npm run test`, `npm run build`, `npm run design:check` en verde;
      verificación visual MCP (admin.demo ve lista con paginación; demo.user →
      sin permisos y sin ítem en nav).
- [x] A.8 Recorte de la página fuera de rango tras un refetch que reduzca la
      lista + cobertura de `users-loading` (pase posterior al review de la
      fase A).
- [x] A.9 La paginación no se pinta junto al error cuando React Query conserva
      `data` con `isError: true` (pase posterior al review de código).

## Fase B — ESCINDIDA

La fase B (dialog "Nuevo usuario" con rol, corte del registro público, columna de
rol, admin inicial sembrado) vive ahora en
`openspec/changes/alta-usuarios-admin/`, **bloqueada** por los prerrequisitos
**D7** del back (P1 cerrar `POST /users` público, P2 endpoint ADMIN de creación
con roles + `UserResponse.roles`, P3 seed Flyway del admin inicial). El texto
listo para el TASKS.md del back está en el §C7 de ese change y resumido en D7 de
`AGENTS.md`.

## Fase C — Cierre

- [x] C.1 Registrar **D7** en `AGENTS.md` (tabla P1–P3 resumida) y actualizar la
      sección Estructura con `src/modules/users/`.
- [x] C.2 Anotar las desviaciones antes de pedir `/review` (el orquestador
      dispara a `quality-reviewer` con el scope del change).
- [x] C.3 **Escisión de la fase B** (decisión 2026-10-19, review de código): el
      delta original contenía requisitos de fase B que no deben sincronizarse a
      los specs principales hasta implementarse; en vez de mantener el change
      abierto indefinidamente (contra "ramas cortas" de `core/principles.md` §6),
      la fase B se movió a `alta-usuarios-admin` y este change cierra con la
      fase A.
- [x] C.4 Cierre: sync de specs (solo lo implementado) + archive + merge
      fast-forward + push + borrado de rama.

## Desviaciones

- **A.2 — re-export de `paginateClientSide`**: además de `USERS_PAGE_SIZE`,
  `users-api.ts` re-exporta `paginateClientSide` de training-api para que la página
  consuma toda la capa de datos del módulo desde un solo import (la paginación es
  parte de C2). No se duplica ni modifica el adapter; el resto del repo importa de
  training-api directamente (precedente en reports), aquí se centralizó a propósito.
- **A.6 — test del guard de ruta en `users-page.test.tsx`**: el escenario "USER por
  URL directa → sin permisos" se prueba montando la tabla REAL `appRoutes` con
  `createMemoryRouter` (misma técnica que `router.test.tsx`, con el mock de
  `react-chartjs-2`) en vez de añadirlo a `router.test.tsx`, que está fechado al
  módulo de reportes. El módulo users queda dueño de la prueba de su ruta.
- **Verificación visual (A.7) — datos locales y puerto**: el seed local solo tenía
  4 usuarios (< pageSize 10), así que se registraron 8 usuarios de prueba
  (`visual.check1..8`) vía el endpoint público `POST /users` (sin `DELETE` en el
  contrato 03 §1: quedan en la BD local de desarrollo, inocuos — prefijo
  `visual.check*` — y solo visibles en `/usuarios`, ADMIN). El badge "Inactiva" no
  pudo verse contra el back real (ningún usuario local es `enabled=false` y no hay
  endpoint para cambiarlo): cubierto por test unitario. Además, el CORS del back
  local solo permite `localhost:3000/5173`, así que la verificación corrió en el
  puerto por defecto 5173.

## Notas del review (2026-10-19)

Veredicto **APTO** en la revisión de la fase A (sin hallazgos de seguridad ni de
contrato; fase B verificada 100 % intacta — ningún archivo de `src/modules/auth/`
tocado) y **APTO** en la revisión de los pases posteriores (clamp de página, tests
nuevos, artefactos). Deuda menor aceptada, no bloqueante:

- **Acoplamiento users→training** por el re-export de `paginateClientSide`
  (desviación A.2): limpieza futura — promover el adapter a
  `src/lib/api/pagination.ts` y que ambos módulos importen de ahí.
- **E2E de "Usuarios"** (nav ADMIN / ausencia en USER): pendiente para una
  ampliación futura de `e2e-tester`; los specs E2E actuales no asertan una lista
  exacta de enlaces y no se rompen con el ítem nuevo.
- Detalle de los usuarios `visual.check1..8` y del puerto: ver Desviaciones.
