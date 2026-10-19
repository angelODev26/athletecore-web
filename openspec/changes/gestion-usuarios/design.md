# Diseño: gestion-usuarios

## Contexto

Contrato: `docs/backend-contract/03-contrato-api-usuarios.md` (verificado contra el
código del back: `AuthController`, `UserController`, `UserService`). Estado actual
del front: login y registro funcionan (`/login`, `/registro` bajo `RequireGuest`,
mutaciones en `auth-api.ts` contra `POST /auth/login` y `POST /users` público);
`GET /users` (ADMIN) no se consume; `UserResponse` existe en
`src/lib/api/types.ts:14` (lo devuelve el login); el 409 de username/email ya se
mapea **por campo** con `getDuplicateField` (`src/lib/api/messages.ts`).

**Divergencia doc ↔ código que este change respeta (regla: gana el código):** el
contrato 03 §1 es explícito — *"No existen (no los diseñes en el front): GET
/users/{id}, PUT, DELETE, cambio de password"* — y `POST /users` hardcodea
`ROLE_USER` con el endpoint público. **Ninguna pantalla puede inventar esos
endpoints**: el alta-con-rol queda gated tras los prerrequisitos D7 (P1–P3).

**Modelo de producto decidido por el usuario:**

| Aspecto | Decisión |
|---|---|
| Roles asignables | Los 3 actuales del JWT: `ADMIN`, `COACH`, `USER` (RF-02 mapea: Presidencia/Admin→ADMIN, Entrenador/Metodólogo→COACH, Deportista→USER) |
| Bootstrap del admin inicial | Seed Flyway en el back, credenciales por env del perfil (patrón `admin.demo` local) |
| `/registro` público | Desaparece; el alta vive en un dialog dentro de `/usuarios` (solo ADMIN) |

**Coordinación**: change paralelo a `e2e-flujos-criticos` en worktree/rama propios
(`feature/gestion-usuarios`); sin dependencias nuevas; único punto de merge
compartido: una línea de `AGENTS.md` en cada cierre.

## Goals / Non-Goals

**Goals:**

- Consumir el último endpoint del contrato (`GET /users`) con una pantalla ADMIN
  útil hoy, sin esperar al back.
- Cerrar el registro público y dar al ADMIN la creación de usuarios con rol,
  en el mismo corte (sin ventanas con dos flujos de alta ni rutas muertas).
- Dejar los prerrequisitos del back registrados con texto listo para pegar en su
  TASKS.md (patrón D4/D5/D6 → **D7**).

**Non-Goals:**

- Activar/desactivar cuentas, cambio de password, `GET /users/{id}`, `/me`: no
  existen en el back (deuda registrada junto a P2).
- Flujo "first-run" de bootstrap en el front: el admin inicial nace del seed (P3);
  el front solo lo consume.
- Los 4 roles de negocio de RF-02 como roles nuevos del JWT (decidido: mapeo sobre
  los 3 existentes).
- Refactor del módulo auth más allá de retirar el registro.

## Decisiones (vinculantes para la implementación)

### C1. Rutas y navegación (estado objetivo)

- `/usuarios` (`UsersPage`) bajo `RequireRoles(["ADMIN"])` — la ruta se añade en la
  **fase A**.
- `NAV_ITEMS` gana `{ to: "/usuarios", label: "Usuarios", roles: ["ADMIN"] }`
  (fase A).
- `/registro` (ruta + `register-page.tsx` + mutación `register` de `auth-api.ts`)
  se ELIMINA en la **fase B** (corte junto con el dialog), nunca antes:
  la app no queda con una página apuntando a un endpoint cerrado (P1) ni con
  cero vías de alta (entre A y B el registro público sigue operativo en el back).
- `RequireGuest` queda entonces solo para `/login`.

### C2. Capa de datos (fase A completa)

`src/modules/users/users-api.ts` (patrón de los módulos existentes):

```ts
const USERS_ROOT_KEY = moduleQueryKey("users");
export const USERS_LIST_KEY = [...USERS_ROOT_KEY, "list"] as const;

useUsers()        // GET /users (sin paginar) — el adapter pagina en cliente
useCreateUser()   // POST (fase B) → invalida USERS_LIST_KEY — endpoint según P2
```

- Paginación client-side con `paginateClientSide` reutilizado de
  `training-api.ts` (D2; `GET /users` figura en la lista de "sin paginar" del
  doc 08 §3), pageSize 10.
- Tipos: **reutilizar** `UserResponse` de `types.ts` (no duplicar). El campo
  `roles?: string[]` se añade como OPCIONAL cuando P2 aterrice (el login no lo
  devuelve hoy; la lista lo mostrará en cuanto exista — la UI no inventa la
  columna antes de tiempo).
- Enum de roles del dominio: reutilizar el existente (`Role`/claims del JWT) —
  no crear uno nuevo paralelo.

### C3. Roles en la UI

- Select cerrado con los 3 roles: `ADMIN` ("Administrador"), `COACH`
  ("Entrenador / Metodólogo"), `USER` ("Deportista") + nota corta del mapeo.
- Los valores SIEMPRE viajan en MAYÚSCULAS (convención doc 08 §4).
- La UI muestra el rol del usuario logueado tal como llega del JWT; los roles
  asignables son exactamente los 3 — si el back añade uno, el select lo tolera
  (fallback al valor crudo, como los enums de chequeos).
- Seguridad: el back es la autoridad — un USER que intente `POST` recibe 403 →
  estado "sin permisos" global. La UI oculta el botón, no lo "protege".

### C4. `enabled` informativo (sin toggle)

- Badge "Activa" (success) / "Inactiva" (variante neutra) por fila. `active`
  NO se muestra (doc 03 §5: siempre `true` en la práctica — informativo sin
  valor). Sin switch ni acción: no hay endpoint (deuda con P2:
  `PUT /users/{id}` para enabled + password reset).

### C5. Dialog "Nuevo usuario" (fase B, gated P2)

- Form con las reglas EXACTAS del DTO actual (doc 03 §3, ya mapeadas en
  `messages.ts`): username 3–50, email con formato, firstName/lastName
  obligatorios ≤100, password ≥6, confirmPassword igual. Pre-validación local
  completa (mismo patrón `superRefine` que los demás forms del repo) + select de
  rol (obligatorio, default `USER`).
- 409 de username/email → `getDuplicateField` marca el campo en conflicto (se
  reutiliza tal cual); 400 residual → mensaje global seguro vía
  `toUserFacingMessage`.
- **La forma del request la fija el back al implementar P2** — la UI no la
  inventa: será `RegisterRequest` + `roles` (o el DTO que el back publique).
  Tarea B bloqueada hasta tener el endpoint real que verificar contra código.
- Al crear (201): cierra, invalida la lista, el usuario nuevo aparece en la
  página 1 (o donde el orden del back lo sitúe — no asumir posición).

### C6. Secuenciación y corte único (gating explícito)

| Fase | Contenido | Condición |
|---|---|---|
| **A** | `users-api.ts`, `UsersPage` (lista + paginación + badges), ruta + nav "Usuarios", tests | **ninguna** — implementable hoy contra el contrato 03 real |
| **B** | dialog con rol, eliminación de `/registro` (ruta, página, mutación), `roles?` en el type, columna de rol en la lista, tests | **BLOQUEADA hasta que el back entregue P1 + P2** (verificar contra código del back, no contra el doc) |

El cambio de B se hace en un solo release del front: registro público fuera y
alta-admin dentro, sin ventana intermedia. Si P1 aterriza antes que B, la página
`/registro` queda rota a propósito hasta el corte — estado aceptado y documentado
(el endpoint público debe morir; la página con él).

### C7. Testids obligatorios

| testid | Dónde |
|---|---|
| `users-page`, `users-list`, `users-pagination-prev`, `users-pagination-next`, `users-empty`, `users-error`, `users-loading` | lista |
| `user-enabled-badge` (por fila, sufijo id) | badge informativo |
| `user-new-button`, `user-form`, `user-username-input`, `user-email-input`, `user-firstName-input`, `user-lastName-input`, `user-password-input`, `user-confirmPassword-input`, `user-role-select`, `user-submit`, `user-duplicate-field` | dialog (fase B) |

### C8. Prerrequisitos del back (D7) — texto listo para su TASKS.md

> **Front `gestion-usuarios` requiere (repo `athletecore-api`):**
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
> (endpoints nuevos + `UserResponse.roles`) — "gana el código" exige docs al día
> para la fase B del front.

Al implementarse, registrar D7 en `AGENTS.md` de este repo con esta tabla resumida.

## Estructura de archivos

```
src/modules/users/
  users-api.ts        — C2 (keys, hooks, paginación client-side)
  users-page.tsx      — C1/C4 lista ADMIN (tabla, badges, estados, paginación)
  user-form.tsx       — C5 dialog alta con rol (fase B)
  *.test.tsx          — tests por archivo (ver tasks.md)
```

Reutiliza sin tocarlos: `paginateClientSide` (training-api), `getDuplicateField`
+ `toUserFacingMessage` (messages.ts), estados compartidos
(`src/shared/components/states.tsx`), componentes shadcn existentes
(table/dialog/select/badge/form). Faltante → MCP shadcn (vigilando el bug del CLI
4.21).

## Verificación visual

Back local arriba (docker `athletecore-postgres` + perfil local) y `npm run dev`:

- Login `admin.demo/secret123` (ADMIN): nav con "Usuarios" → `/usuarios` lista con
  paginación client-side y badges de estado; estados vacío/error cubiertos.
- Login `demo.user/secret123` (USER): nav sin "Usuarios"; `/usuarios` por URL
  directa → "sin permisos" sin cierre de sesión.
- Fase B (solo cuando P1/P2 existan): alta de un COACH desde el dialog → aparece
  en la lista; duplicado de username → campo marcado por `getDuplicateField`;
  `/registro` → ya no existe (estado de error de ruta).
- MCP playwright con `browser_snapshot`/`browser_evaluate`.

## Riesgos / Trade-offs

- [Fase B contra un endpoint que no existe] → gating C6: B no se implementa sin
  verificar el código real del back; nada se "diseña por adelantado".
- [P1 aterriza antes que el corte B] → `/registro` rota a propósito hasta B
  (aceptado: el registro público debe morir); documentar en desviaciones si pasa.
- [Lista completa sin paginar crece] → D2/T9: paginación client-side hoy; adapter
  local para migrar a server-side.
- [Emails visibles en la lista] → correcto por contrato: `GET /users` es solo
  ADMIN (`@PreAuthorize` verificado).
- [Creación de ADMINs por ADMIN] → permitido por diseño (el admin es el dueño del
  sistema); el back valida el enum (P2).

## Deuda registrada (no se implementa)

- `PUT /users/{id}` (toggle `enabled`, password reset), `GET /users/{id}`, `/me`,
  refresh (D1) — todo prerrequisito del back junto a P2.
- Columna de rol en la lista: espera `UserResponse.roles` (P2).
- Audit log de creaciones: no existe en el back; fuera de alcance.
