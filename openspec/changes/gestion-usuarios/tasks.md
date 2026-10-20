# Tasks: gestion-usuarios

> Implementación según `design.md` (decisiones C1–C8 vinculantes) y los deltas
> `specs/gestion-usuarios/spec.md` + `specs/app-shell-navigation/spec.md`.
> Rama: `feature/gestion-usuarios` (worktree propio — YA EXISTE, creada por el
> orquestador; no recrearla). Trabajar solo dentro del alcance; desviaciones se
> anotan abajo. Componentes shadcn SOLO vía MCP. Verificación al final: `npm run
> test`, `npm run build`, `npm run design:check` en verde.
>
> **Propietario**: todas las fases → `auth-guardian` (dueño del dominio
> auth/users); el gating lo marca C6.
>
> ⛔ **FASE B BLOQUEADA** hasta que el back (`../athletecore-api`) entregue P1+P2
> de D7 (cerrar `POST /users` público + endpoint ADMIN de creación con roles +
> `UserResponse.roles`) VERIFICADOS CONTRA CÓDIGO, no contra docs. No se
> implementa por adelantado contra un contrato inexistente. El texto para el
> TASKS.md del back está en `design.md` §C8.

## Fase A — Lista de usuarios (implementable hoy)

- [x] A.1 Verificar la rama: `git branch --show-current` →
      `feature/gestion-usuarios` (worktree propio; no tocar el worktree de
      `e2e-flujos-criticos`).
- [x] A.2 Crear `src/modules/users/users-api.ts` (C2): `USERS_ROOT_KEY` con
      `moduleQueryKey("users")`, `useUsers()` sobre `GET /users`, paginación
      client-side pageSize 10 reutilizando `paginateClientSide` de training-api.
      Sin tipos nuevos (reutilizar `UserResponse` de `types.ts`).
- [x] A.3 `users-api.test.tsx`: URL/método exactos (`GET /users`), paginación
      local sin nueva llamada al pasar de página, invalidación tras mutación
      (preparada para fase B).
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

## Fase B — Alta con rol + corte del registro (⛔ BLOQUEADA hasta P1+P2)

Condición de desbloqueo: prerrequisitos P1 y P2 de `design.md` §C8 presentes en
el CÓDIGO del back y el doc 03 actualizado. Entonces:

- [ ] B.1 Verificar contra el código del back (`UserController`,
      `UserService`) la forma real del request de creación con roles y de
      `UserResponse.roles`; anotarla aquí como desviación si difiere de lo
      supuesto en C5.
- [ ] B.2 `types.ts`: añadir `roles?: string[]` opcional a `UserResponse`
      (retrocompatible con el login, que hoy no lo trae).
- [ ] B.3 `users-api.ts`: `useCreateUser()` (POST según la forma verificada)
      invalidando `USERS_LIST_KEY`.
- [ ] B.4 `user-form.tsx` (C5): dialog "Nuevo usuario" con validación local
      EXACTA del DTO (username 3–50, email, nombres ≤100, password ≥6,
      confirmación) + select de rol obligatorio (ADMIN/COACH/USER con etiquetas
      ES de C3, default `USER`, mayúsculas al enviar); 409 → `getDuplicateField`
      marca el campo (`user-duplicate-field`); 400 residual →
      `toUserFacingMessage`. Testids C7.
- [ ] B.5 **Corte del registro público** (C1/C6, mismo release que B.4):
      eliminar la ruta `/registro` del router, borrar
      `src/modules/auth/register-page.tsx` (no tiene test propio), retirar la
      mutación `register` de `auth-api.ts` (y sus imports), dejar `RequireGuest`
      SOLO en `/login`. Actualizar `app-shell.test.tsx` con el escenario "la ruta
      de registro ya no existe".
- [ ] B.6 La lista gana la columna de rol (render tolerante si `roles` viene
      ausente) y el botón `user-new-button` visible solo ADMIN.
- [ ] B.7 Tests fase B: alta COACH end-to-end del form (201 → lista
      invalidada), duplicado username marcado por campo, validación local
      bloquea, `/registro` inexistente, USER sin botón.
- [ ] B.8 Suite + build + design:check en verde; verificación visual MCP del
      corte completo (alta, duplicado, `/registro` muerto).

## Fase C — Cierre

- [x] C.1 Registrar **D7** en `AGENTS.md` (tabla P1–P3 resumida de §C8) y
      actualizar la sección Estructura con `src/modules/users/`.
- [x] C.2 Anotar cualquier desviación aquí antes de pedir `/review` (el
      orquestador dispara a `quality-reviewer` con el scope del change).
- [ ] C.3 **Decisión post-review (2026-10-19): mantener el change ABIERTO.**
      El delta contiene requisitos de fase B (alta con rol, registro cerrado,
      admin sembrado y el retiro de `/registro`): archivarlo ahora sincronizaría
      a los specs principales requisitos NO implementados. La fase B se retoma en
      ESTE change cuando el back entregue P1/P2 (tareas B.1–B.8 ya escritas); solo
      si el back se demora tanto que el cambio quede estancado, se escinde B a un
      change de continuación moviendo antes esos requisitos. La fase A queda
      revisada (APTO) y commiteada en `feature/gestion-usuarios`.

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
- **Verificación visual (A.7) — datos locales**: el seed local solo tenía 4 usuarios
  (< pageSize 10), así que se registraron 8 usuarios de prueba (`visual.check1..8`)
  vía el endpoint público `POST /users` para verificar la paginación con 2 páginas
  reales en vivo. No existe `DELETE /users` en el back (contrato 03 §1), así que
  quedan en la BD local de desarrollo; son inocuos (prefijo `visual.check*`) y solo
  visibles en `/usuarios` (solo ADMIN). El badge "Inactiva" no pudo verse contra el
  back real (todos los usuarios locales tienen `enabled=true` y no hay endpoint para
  cambiarlo): cubierto por test unitario.
- **Verificación visual (A.7) — puerto del dev server**: CORS del back local solo
  permite `localhost:3000/5173` (`application-local.properties`), así que la
  verificación corrió en el puerto por defecto 5173 en vez de un puerto arbitrario.

## Notas del review de la fase A (2026-10-19)

Veredicto **APTO** (sin hallazgos de seguridad ni de contrato; fase B verificada
intacta). Deuda menor aceptada, no bloqueante:

- **Página fuera de rango tras un refetch que reduzca la lista**
  (`users-page.tsx:35-38`: no se recorta `page`; hoy inalcanzable porque el back
  solo añade usuarios y no hay DELETE). Corregido en el pase posterior al review
  (guard de recorte + test de `users-loading`).
- **Cobertura**: `users-loading` existe pero no tenía test; añadido en el pase
  posterior. `user-row-{id}` sigue la convención del repo (`report-row-{id}`,
  `plan-row-{id}`) y se documentó en design C7.
- **Acoplamiento users→training** por el re-export de `paginateClientSide`
  (desviación A.2): deuda de mantenibilidad para una limpieza futura — promover el
  adapter a `src/lib/api/pagination.ts` y que ambos módulos importen de ahí.
- **E2E de "Usuarios"** (nav ADMIN / ausencia en USER): pendiente para una
  ampliación futura de `e2e-tester`; los specs E2E actuales no asertan una lista
  exacta de enlaces y no se rompen con el ítem nuevo.
- **Usuarios `visual.check1..8`**: permanecen en la BD local (sin DELETE en el
  contrato); inocuos y solo visibles en `/usuarios`.
