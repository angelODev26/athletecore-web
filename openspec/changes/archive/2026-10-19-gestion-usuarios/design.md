# Diseño: gestion-usuarios (fase A)

> Este change cubre SOLO la fase A (lista `/usuarios` solo ADMIN). La fase B
> (dialog de alta con rol, corte del registro público, admin sembrado) se escindió
> a `openspec/changes/alta-usuarios-admin/`, bloqueado por D7.

## Contexto

Contrato: `docs/backend-contract/03-contrato-api-usuarios.md` (verificado contra el
código del back). `GET /users` (solo ADMIN) es el único endpoint del contrato sin
consumir — "uso previsto: pantalla de administración de usuarios"; no pagina
(doc 08 §3 → decisión D2: paginación client-side). `UserResponse` existe en
`src/lib/api/types.ts:14` (lo devuelve el login) y hoy NO trae `roles`.

**Divergencia doc ↔ código que este change respeta (gana el código):** el contrato
03 §1 es explícito — *no existen* `GET /users/{id}`, `PUT`, `DELETE`, cambio de
password. Ninguna pantalla inventa esos endpoints: el badge `enabled` es
informativo, sin toggle.

**Coordinación**: `feature/gestion-usuarios` en worktree propio; el único punto de
merge compartido con el change de E2E ya cerrado fue `AGENTS.md`.

## Goals / Non-Goals

**Goals:**

- Consumir el último endpoint del contrato (`GET /users`) con una pantalla ADMIN
  útil hoy, sin esperar al back: lista, badges de estado y paginación client-side.
- Dejar la fase B (alta con rol) acotada en un change propio con sus
  prerrequisitos **D7** registrados (P1–P3).

**Non-Goals:**

- Alta de usuarios con rol, cierre de `/registro`, admin inicial sembrado: **fase B**
  (`alta-usuarios-admin`, bloqueada por D7). Este change no toca `src/modules/auth/`.
- Activar/desactivar cuentas, cambio de password, `GET /users/{id}`, `/me`: no
  existen en el back (deuda registrada).

## Decisiones (vinculantes para la implementación)

### C1. Rutas y navegación

- `/usuarios` (`UsersPage`) bajo `RequireRoles(["ADMIN"])`.
- `NAV_ITEMS` gana `{ to: "/usuarios", label: "Usuarios", roles: ["ADMIN"] }`.
- `/registro` y el resto del flujo de auth quedan **intactos** aquí: su retiro es
  la fase B, en un corte único con el dialog (para no dejar la app sin ninguna vía
  de alta ni una página apuntando a un endpoint cerrado).

### C2. Capa de datos

`src/modules/users/users-api.ts` (patrón de los módulos existentes):

```ts
const USERS_ROOT_KEY = moduleQueryKey("users");
export const USERS_LIST_KEY = [...USERS_ROOT_KEY, "list"] as const;

useUsers()        // GET /users (sin paginar) — el adapter pagina en cliente
```

- Paginación client-side con `paginateClientSide` reutilizado de `training-api.ts`
  (D2), pageSize 10, con recorte de página fuera de rango tras un refetch que
  reduzca la lista.
- Tipos: **reutilizar** `UserResponse` de `types.ts` (no duplicar). La columna de
  rol espera `roles` del back (fase B): la UI no inventa la columna antes de tiempo.
- `USERS_LIST_KEY` queda invalidable para la mutación del change de continuación.

### C3. `enabled` informativo (sin toggle)

- Badge "Activa" (success) / "Inactiva" (variante neutra) por fila. `active` NO se
  muestra (doc 03 §5: siempre `true` en la práctica — informativo sin valor). Sin
  switch ni acción: no hay endpoint (deuda con la fase B/P2).

### C4. Testids obligatorios

| testid | Dónde |
|---|---|
| `users-page`, `users-list`, `users-pagination-prev`, `users-pagination-next`, `users-empty`, `users-error`, `users-loading` | lista |
| `user-row-{id}` (convención del repo: `report-row-{id}`, `plan-row-{id}`) | fila |
| `user-enabled-badge` (por fila, sufijo id) | badge informativo |

## Estructura de archivos

```
src/modules/users/
  users-api.ts        — C2 (keys, hooks, paginación client-side)
  users-page.tsx      — C1/C3 lista ADMIN (tabla, badges, estados, paginación)
  *.test.tsx          — tests por archivo
```

Reutiliza sin tocarlos: `paginateClientSide` (training-api), estados compartidos
(`src/shared/components/states.tsx`) y componentes shadcn existentes
(table/badge/button). Faltante → MCP shadcn.

## Verificación visual

Back local arriba y `npm run dev`:

- Login `admin.demo/secret123` (ADMIN): nav con "Usuarios" → `/usuarios` lista con
  paginación client-side y badges de estado; estados vacío/error cubiertos.
- Login `demo.user/secret123` (USER): nav sin "Usuarios"; `/usuarios` por URL
  directa → "sin permisos" sin cierre de sesión.
- MCP playwright con `browser_snapshot`/`browser_evaluate`.

## Riesgos / Trade-offs

- [Lista completa sin paginar crece] → D2/T9: paginación client-side hoy; adapter
  local para migrar a server-side cuando el back pagine.
- [Emails visibles en la lista] → correcto por contrato: `GET /users` es solo
  ADMIN (`@PreAuthorize` verificado).
- [Acoplamiento users→training] por el re-export de `paginateClientSide` → deuda
  de mantenibilidad: promover el adapter a `src/lib/api/pagination.ts` en una
  limpieza futura.

## Deuda registrada (no se implementa)

- `PUT /users/{id}` (toggle `enabled`, password reset), `GET /users/{id}`, `/me`,
  refresh (D1) — prerrequisitos del back junto a D7/P2.
- Columna de rol en la lista: espera `UserResponse.roles` (fase B, P2).
- Audit log de creaciones: no existe en el back; fuera de alcance.
