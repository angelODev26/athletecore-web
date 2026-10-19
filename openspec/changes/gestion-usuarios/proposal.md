# Propuesta: gestion-usuarios

## Why

El registro público es el último hueco del modelo de seguridad: hoy **cualquiera**
puede auto-registrarse (`POST /users` público, doc 03 §3) y el rol resultante está
hardcodeado a `ROLE_USER` — no hay forma de crear un COACH ni otro ADMIN desde la
UI. El modelo de producto acordado con el usuario (RF-02 completo) invierte el
flujo: **el registro queda cerrado; solo un ADMIN crea usuarios y les asigna el
rol**, empezando por un administrador inicial que nace de un **seed Flyway** en el
back. Además, `GET /users` (solo ADMIN, doc 03 §4) es el único endpoint del contrato
sin consumir — "uso previsto: pantalla de administración de usuarios".

Decisiones de producto fijadas por el usuario: **3 roles actuales del JWT**
(ADMIN/COACH/USER, mapeando los 4 roles de negocio de RF-02), **bootstrap por seed
Flyway**, y el alta como **dialog dentro de la pantalla Usuarios** (la página
pública `/registro` desaparece).

## What Changes

- Nueva capability **`gestion-usuarios`**: pantalla
  `/usuarios` (solo ADMIN) con la lista de `GET /users`, paginación client-side
  (decisión D2 — el endpoint no pagina), y `enabled` como badge informativo.
- **Alta de usuarios por el ADMIN** (dialog con select de rol) — **gated**: el
  contrato actual no expone crear-con-rol (hardcodea `ROLE_USER`), así que esta fase
  espera los prerrequisitos de backend registrados como **D7**:
  - **P1**: cerrar `POST /users` público en `SecurityConfig` (es la REC-03 del
    análisis original del back).
  - **P2**: endpoint ADMIN para crear usuario **con roles** + `UserResponse`
    exponiendo `roles` (hoy no los trae — sin esto ni la lista puede mostrar la
    columna).
  - **P3**: seed Flyway del admin inicial con credenciales por variables de entorno
    del perfil + runbook de rotación.
- **`/registro` desaparece** (ruta pública, página y mutación de `auth-api`) en el
  mismo corte de la fase gated: la app nunca queda con dos formas de crear
  usuarios ni con ninguna rota apuntando a un endpoint cerrado.
- Sin dependencias nuevas; cero solapamiento de archivos con el change paralelo
  `e2e-flujos-criticos` (solo una línea de `AGENTS.md` al cierre de cada uno).

## Capabilities

### New Capabilities

- `gestion-usuarios`: lista de usuarios solo ADMIN con paginación client-side,
  alta de usuarios con rol por el administrador (tras P1/P2), registro público
  cerrado y bootstrap del admin inicial delegado al back (P3).

### Modified Capabilities

- `app-shell-navigation`: `RequireGuest` queda solo para `/login` (la ruta pública
  `/registro` desaparece) y la navegación gana "Usuarios" visible solo para
  ADMIN, junto a las restricciones ya existentes de entrenamientos y tabla
  nacional.

## Impact

- **Rutas**: `/usuarios` bajo `RequireRoles(["ADMIN"])` (nueva); `/registro`
  eliminada en la fase gated.
- **Capa de datos**: `src/modules/users/users-api.ts` (patrón de módulo, keys
  propias, `paginateClientSide` reutilizado de training-api); `UserResponse`
  existente se reutiliza (gana `roles?` opcional cuando P2 aterrice); el 409 de
  usuario/email ya se mapea por campo con `getDuplicateField` (`messages.ts`) —
  el dialog lo reutiliza.
- **Módulos**: `src/modules/users/` nuevo; `src/modules/auth/` pierde
  `register-page.tsx` y la mutación de registro (fase gated); `app-shell.tsx`
  gana el ítem "Usuarios"; `router.tsx` gana la ruta y pierde `/registro`.
- **AGENTS.md**: registro de D7 (prerrequisitos P1–P3) y sección Estructura con el
  módulo users al cierre.
- **Paralelismo**: este change vive en su propio worktree/rama
  (`feature/gestion-usuarios`); no toca el worktree de `e2e-flujos-criticos`.
