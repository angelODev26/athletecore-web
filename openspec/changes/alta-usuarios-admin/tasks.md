# Tasks: alta-usuarios-admin

> Implementación según `design.md` (decisiones C1–C7 vinculantes) y los deltas
> `specs/gestion-usuarios/spec.md` + `specs/app-shell-navigation/spec.md`.
> Fase B escindida de `gestion-usuarios` (archivado con la fase A implementada y
> revisada). Al activarse, crear la rama `feature/alta-usuarios-admin`.
>
> **Propietario**: todas las fases → `auth-guardian` (dueño del dominio
> auth/users). Cierre → `quality-reviewer` vía `/review` (lo orquesta el
> revisor del change).
>
> ⛔ **CHANGE BLOQUEADO ENTERO** hasta que el back (`../athletecore-api`) entregue
> **P1 + P2** de D7 (§C7 del design: cerrar `POST /users` público + endpoint ADMIN
> de creación con roles + `UserResponse.roles`) **VERIFICADOS CONTRA CÓDIGO**, no
> contra docs. P3 (seed del admin) no bloquea el código del front pero sí el
> despliegue real. No se implementa nada por adelantado contra un contrato
> inexistente.

## Fase 0 — Desbloqueo (verificar D7 contra el back)

- [x] 0.1 Crear la rama `feature/alta-usuarios-admin` desde `main`.
- [x] 0.2 Verificar en el CÓDIGO del back: P1 aplicado (`SecurityConfig` con
      `/users/**` bajo ADMIN + `@PreAuthorize`) y P2 publicado. Forma real del
      request: `CreateUserRequest` (username 3–50, email, firstName/lastName
      ≤100, password ≥8, confirmPassword, `roles?: string[]`); respuesta
      `UserResponse.roles: string[]` ordenada. **Desviación**: password mínimo 8
      (no 6) — design, proposal y delta spec actualizados.
- [x] 0.3 `docs/backend-contract/03-contrato-api-usuarios.md` actualizado
      (endpoints, roles, 401/403/409, password 8, flujo sin registro). También
      se alinearon 00/01/02/08/09 y el flujo completo.

## Fase 1 — Alta con rol (dialog)

- [x] 1.1 `src/lib/api/types.ts`: `roles?: string[]` opcional en `UserResponse`
      y `CreateUserRequest` (sustituye a `RegisterRequest`).
- [x] 1.2 `src/modules/users/users-api.ts`: `useCreateUser()` con
      `POST /users` + invalidación de `USERS_LIST_KEY`.
- [x] 1.3 `src/modules/users/user-form.tsx` (design §C4): dialog "Nuevo usuario"
      con validación local EXACTA del DTO (username 3–50, email, nombres ≤100,
      password ≥8, confirmación) + select de rol obligatorio
      (ADMIN/COACH/USER con etiquetas ES de §C3, default `USER`, mayúsculas al
      enviar); 409 → `getDuplicateField` marca el campo
      (`user-duplicate-field`); 400 residual → `toUserFacingMessage`. Testids
      §C6. Componentes shadcn existentes del registry (sin altas nuevas).
- [x] 1.4 Botón `user-new-button` visible solo ADMIN en `users-page.tsx`.
- [x] 1.5 Tests: alta COACH (201 → dialog cierra → lista invalidada → feedback),
      vuelta a la primera página si el ADMIN estaba en otra, reset del dialog al
      reabrir, duplicado de username/email por campo sin texto crudo, 409
      genérico, 400 traducido, validación local bloquea sin llamar al back,
      USER sin botón.

## Fase 2 — Corte del registro público (mismo release que Fase 1)

- [x] 2.1 Eliminar la ruta `/registro` de `src/app/router.tsx`; borrar
      `src/modules/auth/register-page.tsx`; retirar la mutación `register` de
      `auth-api.ts` y sus imports; quitar el enlace "Regístrate" del login;
      `RequireGuest` queda SOLO en `/login`. Delta de `autenticacion-sesion`:
      elimina el requisito "Registro público".
- [x] 2.2 Columna de rol en `users-page.tsx` (render tolerante si `roles` viene
      ausente) sobre `UserResponse.roles`.
- [x] 2.3 Tests: `/registro` sin sesión termina en `/login` y no monta la
      página de registro; el login no ofrece "Regístrate"; `app-shell.test.tsx`
      sigue en verde.

## Fase 3 — Cierre

- [x] 3.1 `npm run test` (414 tests), `npm run lint`, `npm run build` y
      `npm run design:check` en verde. Verificación visual con Playwright (lista
      con roles + dialog, API interceptada, 0 errores de consola); el MCP
      Playwright no estaba disponible en esta sesión.
- [x] 3.2 Entrada **D7** de `AGENTS.md` refrescada (fase B aterrizada) y
      sección Estructura (`user-form.tsx`, `useCreateUser`, columna de rol).
- [x] 3.3 Review del usuario: 0 bloqueantes, 0 mayores y 7 menores. Se
      corrigieron los 7 (escenario de `/registro`, feedback y vuelta a página 1,
      rationale de `roles?`, test de reset, constantes de password, `mutationKey`
      y catálogo de roles). APTO para sync + archive + merge fast-forward + push.

## Desviaciones

- **Password mínimo 8** (no 6): es lo que valida el back al activar P2. Se
  actualizaron proposal, design, delta spec, contrato 03 y `messages.ts`.
- **P3 ya existía**: el seed Flyway `V6` crea el admin inicial; el front solo lo
  consume. No hay bootstrap en la UI.
- **Verificación visual sin MCP**: se usó un script Playwright con `GET /users`
  interceptado y sesión ADMIN sembrada en `localStorage`; screenshots en
  `/tmp/opencode/` (fuera del repo) y cero errores de consola.
- **Docs del handoff**: además de 03, se corrigieron 00/01/02/08/09 y el flujo
  completo para reflejar el registro público cerrado, el seed V6 y password 8.
- **Ajustes del review**: `/registro` termina en `/login` (no en el estado de
  error de ruta); tras crear se vuelve a la página 1 y se confirma el alta; el
  reset del dialog tiene test propio; password (8) y su mensaje viven en
  `password-policy.ts`; `mutationKey` compone desde `USERS_ROOT_KEY` y el
  catálogo `ROLES` es la única fuente en `lib/api/types.ts`.
- **Flaky no reproducido**: una ejecución completa de tests falló 1 de 414 sin
  dejar traza; tres ejecuciones completas y cinco focalizadas posteriores
  pasaron en verde.
