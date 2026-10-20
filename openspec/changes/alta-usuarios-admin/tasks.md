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

- [ ] 0.1 Crear la rama `feature/alta-usuarios-admin` desde `main`.
- [ ] 0.2 Verificar en el CÓDIGO del back: P1 aplicado (`SecurityConfig` con
      `POST /users` bajo ADMIN) y P2 publicado (endpoint ADMIN de creación que
      acepta `roles` + `UserResponse.roles`). Anotar aquí la **forma real del
      request** (DTO + campos + validaciones) — si difiere de lo supuesto en
      design §C2, anotarlo como desviación y actualizar el design.
- [ ] 0.3 Actualizar `docs/backend-contract/03-contrato-api-usuarios.md` si el
      back cambió endpoints/DTOs y no lo reflejó ("gana el código": docs al día).

## Fase 1 — Alta con rol (dialog)

- [ ] 1.1 `src/lib/api/types.ts`: `roles?: string[]` opcional en `UserResponse`
      (retrocompatible con el login, que hoy no lo trae).
- [ ] 1.2 `src/modules/users/users-api.ts`: `useCreateUser()` con la forma del
      request verificada en 0.2, invalidando `USERS_LIST_KEY`.
- [ ] 1.3 `src/modules/users/user-form.tsx` (design §C4): dialog "Nuevo usuario"
      con validación local EXACTA del DTO (username 3–50, email, nombres ≤100,
      password ≥6, confirmación) + select de rol obligatorio
      (ADMIN/COACH/USER con etiquetas ES de §C3, default `USER`, mayúsculas al
      enviar); 409 → `getDuplicateField` marca el campo
      (`user-duplicate-field`); 400 residual → `toUserFacingMessage`. Testids
      §C6. Componentes shadcn SOLO vía MCP.
- [ ] 1.4 Botón `user-new-button` visible solo ADMIN en `users-page.tsx`.
- [ ] 1.5 Tests: alta COACH (201 → dialog cierra → lista invalidada y el usuario
      aparece), duplicado de username marcado por campo sin texto crudo,
      validación local bloquea sin llamar al back, USER sin botón.

## Fase 2 — Corte del registro público (mismo release que Fase 1)

- [ ] 2.1 Eliminar la ruta `/registro` de `src/app/router.tsx`; borrar
      `src/modules/auth/register-page.tsx` (no tiene test propio); retirar la
      mutación `register` de `auth-api.ts` y sus imports; `RequireGuest` queda
      SOLO en `/login`.
- [ ] 2.2 Columna de rol en `users-page.tsx` (render tolerante si `roles` viene
      ausente) sobre `UserResponse.roles`.
- [ ] 2.3 Tests: `/registro` ya no existe (estado de error de ruta), sin sesión
      solo se llega a `/login`, `app-shell.test.tsx` actualizado; la prueba de
      login/registro existente que tocaba `/registro` se retira o adapta.

## Fase 3 — Cierre

- [ ] 3.1 `npm run test`, `npm run build`, `npm run design:check` en verde;
      verificación visual MCP completa (alta de COACH, duplicado por campo,
      `/registro` muerto, login del admin sembrado si P3 está).
- [ ] 3.2 Refrescar la entrada **D7** de `AGENTS.md` (fase B aterrizada) y la
      sección Estructura (`user-form.tsx`, `useCreateUser`, columna de rol).
- [ ] 3.3 Anotar desviaciones y pedir `/review` (lo orquesta el revisor del
      change); tras APTO: sync + archive + merge fast-forward + push.

## Desviaciones

(ninguna todavía — el change está bloqueado)
