# Diseño: alta-usuarios-admin

## Contexto

Fase B escindida de `gestion-usuarios` (fase A archivada: lista `/usuarios`
solo-ADMIN, paginación client-side, badge `enabled` informativo). Este change nace
**BLOQUEADO** y se activa cuando el back entregue **D7** (P1–P3, §C7).

Estado del front al escindir: `/registro` público operativo (`register-page.tsx` +
mutación `register` de `auth-api.ts` contra `POST /users`); `UserResponse` sin
`roles` (`src/lib/api/types.ts:14`); el 409 de username/email ya se mapea **por
campo** con `getDuplicateField` (`src/lib/api/messages.ts`); `users-api.ts` y
`users-page.tsx` ya existen con `USERS_LIST_KEY` invalidable.

**Divergencia doc ↔ código que este change respeta (regla: gana el código):** el
contrato 03 §1 es explícito — *"No existen (no los diseñes en el front): GET
/users/{id}, PUT, DELETE, cambio de password"* — y `POST /users` hardcodea
`ROLE_USER` siendo público. **Ninguna pantalla puede inventar esos endpoints**: el
alta-con-rol queda gated tras D7.

## Goals / Non-Goals

**Goals:**

- Dar al ADMIN la creación de usuarios con rol desde `/usuarios`, reutilizando la
  validación ya mapeada del DTO y el mapeo de 409 por campo.
- Cerrar el registro público en el MISMO corte que nace el dialog (sin ventanas con
  dos flujos de alta ni rutas apuntando a un endpoint cerrado).
- Consumir el admin inicial que el back siembre (P3) sin implementar bootstrap en
  el front.

**Non-Goals:**

- Activar/desactivar cuentas, cambio de password, `GET /users/{id}`, `/me`: no
  existen en el back (deuda con P2).
- Flujo "first-run" de bootstrap en el front: el admin inicial nace del seed (P3).
- Los 4 roles de negocio de RF-02 como roles nuevos del JWT (decidido: mapeo sobre
  los 3 existentes).
- Refactor del módulo auth más allá de retirar el registro.

## Decisiones (vinculantes para la implementación)

### C1. Corte único del registro público

- `/registro` (ruta del router + `src/modules/auth/register-page.tsx` — no tiene
  test propio + la mutación `register` de `auth-api.ts` y sus imports) se ELIMINA
  en el mismo release que nace el dialog.
- `RequireGuest` queda solo para `/login`.
- Si P1 aterriza antes que este corte, `/registro` queda rota a propósito hasta
  él — estado aceptado y documentado (el endpoint público debe morir; la página
  con él).

### C2. Capa de datos (fase B)

```ts
useCreateUser()   // POST según la forma que publique P2 → invalida USERS_LIST_KEY
```

- **La forma final del request la fija el back al implementar P2** — la UI no la
  inventa: será `RegisterRequest` + `roles` (o el DTO que el back publique).
  Verificar contra el código del back antes de implementar (tarea B.1).
- `UserResponse.roles?: string[]` opcional, retrocompatible con el login (que hoy
  no lo trae).
- Al crear (201): cierra el dialog, invalida la lista, el usuario nuevo aparece
  donde el orden del back lo sitúe (no asumir posición).

### C3. Roles en la UI

- Select cerrado con los 3 roles: `ADMIN` ("Administrador"), `COACH`
  ("Entrenador / Metodólogo"), `USER` ("Deportista") + nota corta del mapeo.
- Los valores SIEMPRE viajan en MAYÚSCULAS (convención doc 08 §4).
- Si el back añade un rol, el select lo tolera (fallback al valor crudo, como los
  enums de chequeos).
- Seguridad: el back es la autoridad — un USER que intente `POST` recibe 403 →
  estado "sin permisos" global. La UI oculta el botón, no lo "protege".
- Columna de rol en la lista con render tolerante si `roles` viene ausente.

### C4. Dialog "Nuevo usuario"

- Form con las reglas EXACTAS del DTO actual (doc 03 §3, ya mapeadas en
  `messages.ts`): username 3–50, email con formato, firstName/lastName
  obligatorios ≤100, password ≥6, confirmPassword igual. Pre-validación local
  completa (mismo patrón `superRefine` que los demás forms del repo) + select de
  rol obligatorio (default `USER`).
- 409 de username/email → `getDuplicateField` marca el campo en conflicto; 400
  residual → mensaje global seguro vía `toUserFacingMessage`.
- Botón `user-new-button` visible solo ADMIN.

### C5. Secuenciación y gating

| Paso | Contenido | Condición |
|---|---|---|

| 1 | Verificación de P1/P2 contra el código del back | ambos entregados |
| 2 | Dialog + `useCreateUser` + `roles?` + columna de rol | P2 |
| 3 | Corte del registro público (C1) | mismo release que 2 |

Nada se implementa "por adelantado": sin código del back verificado, las tareas
B.1–B.8 quedan bloqueadas.

### C6. Testids obligatorios

| testid | Dónde |
|---|---|
| `user-new-button`, `user-form`, `user-username-input`, `user-email-input`, `user-firstName-input`, `user-lastName-input`, `user-password-input`, `user-confirmPassword-input`, `user-role-select`, `user-submit`, `user-duplicate-field` | dialog |

### C7. Prerrequisitos del back (D7) — texto listo para su TASKS.md

> **Front `alta-usuarios-admin` requiere (repo `athletecore-api`):**
> 1. **P1 — Cerrar el registro público**: `SecurityConfig` debe dejar público SOLO
>    `POST /api/v1/auth/login` (y el actuator en local). `POST /api/v1/users` pasa a
>    ADMIN (`@PreAuthorize` + regla de URL). Es la REC-03 del análisis original.
>    Refs: `docs/backend-contract/03` §1/§3, `SecurityConfig`.
> 2. **P2 — Creación de usuarios con roles por el ADMIN**: endpoint ADMIN que cree
>    usuario aceptando `roles` (ADMIN/COACH/USER, validar contra el enum existente;
>    nunca permitir roles fuera del enum), y `UserResponse` debe exponer `roles`
>    (hoy el DTO no los trae y la UI no puede mostrar la columna). Aprovechar para
>    valorar `PUT /users/{id}` (enabled + password reset) como siguiente deuda.
>    Refs: `UserController`, `UserService.createUser`, `UserResponse`.
> 3. **P3 — Seed Flyway del admin inicial**: migración que siembre el primer ADMIN
>    con usuario/contraseña desde variables de entorno del perfil (patrón del
>    `admin.demo` local) + BCrypt. Runbook de rotación de contraseña en el README
>    de despliegue. Refs: RNF-04 (Flyway obligatorio), doc 03 §2.
>
> Actualizar `docs/backend-contract/03-contrato-api-usuarios.md` al aterrizar
> (endpoints nuevos + `UserResponse.roles`) — "gana el código" exige docs al día.
> Al implementarse, refrescar la entrada **D7** de `AGENTS.md`.

## Estructura de archivos

```
src/modules/users/
  user-form.tsx        — C4 dialog alta con rol
  user-form.test.tsx   — validación local, 409 por campo, rol obligatorio
  users-api.ts         — + useCreateUser (invalidación de USERS_LIST_KEY)
```

Reutiliza sin tocarlos: `getDuplicateField` + `toUserFacingMessage`
(messages.ts), `USERS_LIST_KEY` (fase A), estados compartidos
(`src/shared/components/states.tsx`), componentes shadcn existentes
(dialog/select/form/badge). Faltante → MCP shadcn (vigilando el bug del CLI 4.21).

## Verificación visual

Back local con P1/P2 desplegados y `npm run dev`:

- Alta de un COACH desde el dialog → aparece en la lista (invalidada).
- Duplicado de username → campo marcado por `getDuplicateField`, sin texto crudo.
- `/registro` → ya no existe (estado de error de ruta); sin sesión solo se llega a
  `/login`.
- Login del admin sembrado (P3) → ve "Usuarios" y opera la lista.
- MCP playwright con `browser_snapshot`/`browser_evaluate`.

## Riesgos / Trade-offs

- [Contra un endpoint que no existe] → gating C5: nada se implementa sin verificar
  el código real del back.
- [P1 aterriza antes que el corte] → `/registro` rota a propósito hasta él
  (aceptado); documentar en desviaciones si pasa.
- [Creación de ADMINs por ADMIN] → permitido por diseño (el admin es el dueño del
  sistema); el back valida el enum (P2).

## Deuda registrada (no se implementa)

- `PUT /users/{id}` (toggle `enabled`, password reset), `GET /users/{id}`, `/me`,
  refresh (D1) — prerrequisitos del back junto a P2.
- Promover `paginateClientSide` a `src/lib/api/pagination.ts` (deuda heredada de
  la fase A: acoplamiento users→training por el re-export).
- Audit log de creaciones: no existe en el back; fuera de alcance.
