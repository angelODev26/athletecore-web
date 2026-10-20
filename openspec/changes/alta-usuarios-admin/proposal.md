# Propuesta: alta-usuarios-admin

## Why

Fase B de `gestion-usuarios`, escindida del change original — que cerró la fase A
(la lista `/usuarios` solo-ADMIN) y se archivó. El modelo de producto acordado con
el usuario (**el registro público se cierra; solo un ADMIN crea usuarios y les
asigna el rol**, empezando por un admin inicial sembrado) no puede implementarse
aún: el contrato 03 de hoy hardcodea `ROLE_USER` en un `POST /users` público,
`UserResponse` no expone `roles` y no existe endpoint de creación con rol.

Este change queda **BLOQUEADO por D7** (prerrequisitos P1/P2/P3 del back, ver
`design.md` §C7) y se activa cuando `athletecore-api` los entregue —
**verificados contra código, nunca contra el doc**.

## What Changes

- **Dialog "Nuevo usuario"** en `/usuarios` (solo ADMIN) con la validación local
  exacta del DTO (username 3–50, email, nombres ≤100, password ≥6, confirmación)
  más un select de rol obligatorio (`ADMIN|COACH|USER`), reutilizando
  `getDuplicateField` para marcar el 409 de username/email por campo.
- **Corte único del registro público**: `/registro` (ruta, `register-page.tsx` y
  la mutación `register` de `auth-api.ts`) desaparece en el mismo release que nace
  el dialog — sin ventana con dos flujos de alta ni rutas apuntando a un endpoint
  cerrado. `RequireGuest` queda solo para `/login`.
- `UserResponse.roles?` opcional (retrocompatible con el login) y columna de rol
  en la lista cuando P2 aterrice.
- Bootstrap del admin inicial: **delegado al seed Flyway del back (P3)** — el
  front no implementa ningún flujo de first-run; solo consume ese admin.

## Capabilities

### Modified Capabilities

- `gestion-usuarios`: se añaden la alta de usuarios con rol por el ADMIN, el
  cierre del registro público y el requisito del primer administrador sembrado.
- `app-shell-navigation`: `RequireGuest` queda solo para `/login` y la ruta
  pública `/registro` desaparece.

## Impact

- `src/modules/users/user-form.tsx` (nuevo), `useCreateUser()` en `users-api.ts`,
  columna de rol en `users-page.tsx`.
- `src/modules/auth/`: pierde `register-page.tsx` y la mutación `register`;
  `src/app/router.tsx` pierde `/registro`; `src/lib/api/types.ts` gana `roles?`.
- Sin dependencias nuevas; sin solapamiento con otros changes en curso.
- Bloqueado por **D7**: P1 (cerrar `POST /users` público), P2 (endpoint ADMIN de
  creación con roles + `UserResponse.roles`), P3 (seed Flyway del admin inicial).
  El texto listo para el TASKS.md del back está en `design.md` §C7.
