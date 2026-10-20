# Propuesta: gestion-usuarios (fase A)

> Change cerrado con la **fase A** (lista `/usuarios` solo ADMIN). La **fase B**
> (alta con rol + corte del registro público + admin sembrado) se escindió a
> `openspec/changes/alta-usuarios-admin/` por los prerrequisitos **D7** del back.

## Why

`GET /users` (solo ADMIN, doc 03 §4) es el único endpoint del contrato sin consumir
— "uso previsto: pantalla de administración de usuarios". El modelo de producto
acordado con el usuario (RF-02 completo) invierte el flujo de alta — **el registro
público se cierra y solo un ADMIN crea usuarios con rol**, empezando por un admin
inicial sembrado por Flyway — pero esa parte (fase B) depende de prerrequisitos del
back (D7: P1 cerrar `POST /users` público, P2 endpoint ADMIN de creación con roles +
`UserResponse.roles`, P3 seed del admin). La **lista de usuarios** no depende de
nada: es la fase A que este change entrega.

Decisiones de producto fijadas por el usuario: **3 roles actuales del JWT**
(ADMIN/COACH/USER, mapeando los 4 roles de negocio de RF-02), **bootstrap por seed
Flyway**, y el alta como **dialog dentro de `/usuarios`** (fase B).

## What Changes

- Nueva capability **`gestion-usuarios`** (fase A): pantalla `/usuarios` (solo
  ADMIN) con la lista de `GET /users`, paginación client-side (decisión D2 — el
  endpoint no pagina) y `enabled` como badge informativo (sin toggle: no existe
  endpoint).
- La navegación gana "Usuarios" visible solo para ADMIN.
- **Nada de `src/modules/auth/` se toca**: el retiro de `/registro` y el alta con
  rol viven en `alta-usuarios-admin`, que espera P1/P2 y se corta en un solo release.
- Sin dependencias nuevas.

## Capabilities

### New Capabilities

- `gestion-usuarios`: lista de usuarios solo ADMIN con paginación client-side y
  estado `enabled` informativo.

### Modified Capabilities

- `app-shell-navigation`: la navegación gana "Usuarios" visible solo para ADMIN,
  junto a las restricciones ya existentes de entrenamientos y tabla nacional.

## Impact

- **Rutas**: `/usuarios` bajo `RequireRoles(["ADMIN"])` (nueva). `/registro` y el
  resto del flujo de auth quedan intactos (fase B).
- **Capa de datos**: `src/modules/users/users-api.ts` (patrón de módulo, keys
  propias, `paginateClientSide` reutilizado de training-api); `UserResponse`
  existente se reutiliza sin duplicar.
- **Módulos**: `src/modules/users/` nuevo; `app-shell.tsx` gana el ítem "Usuarios";
  `router.tsx` gana la ruta.
- **AGENTS.md**: D7 registrado (prerrequisitos P1–P3) y sección Estructura con el
  módulo users.
- **Fase B**: acotada en `alta-usuarios-admin` (bloqueada por D7); este change no
  la implementa ni sincroniza sus requisitos.
