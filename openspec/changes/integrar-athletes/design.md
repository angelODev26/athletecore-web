# Diseño: integrar-athletes

## Contexto

Segundo change funcional del front. `integrar-autenticacion` dejó: sesión (Zustand +
Bearer), guards, 401→login, 403→sin permisos, helpers de errores (`ApiError`, `isApiError`,
`getDuplicateField`, `toUserFacingMessage`), adapter de paginación `toPageModel` /
`PageModel`, `moduleQueryKey`, `queryClient` y el patrón de mutaciones por módulo
(`src/modules/auth/auth-api.ts`). Este change consume todo eso; **no reinventa la capa de
datos ni el tema**.

Fuentes del contrato (leer antes de codear, en este orden):

1. `docs/backend-contract/04-contrato-api-deportistas.md` — endpoints, DTOs y validaciones.
2. `docs/backend-contract/08-convenciones-transversales.md` — ErrorResponse, códigos,
   soft delete, formatos.
3. `docs/backend-contract/09-decisiones-deuda-y-pendientes.md` — T1/T2/T6/D4/D5.
4. `docs/backend-contract/flujo-completo-athletecore.md` — diagrama de secuencia del alta.

## Decisiones (vinculantes para la implementación)

### A1. La lista de deportistas pagina SERVER-SIDE

`GET /api/v1/athletes` es el **único** endpoint paginado de la API (doc 04 §2). Aunque la
decisión D2 del proyecto ("paginación client-side para listados sin paginar") existe, **no
aplica aquí**: este listado usa `page`/`size`/`sort` del servidor y se normaliza con
`toPageModel` + `PageModel` ya existentes en `src/lib/api/pagination.ts`. PROHIBIDO traer
toda la colección y paginar en memoria.

- Estado de página/tamaño: estado local de la página (`useState`), no URL. `size` fijo en 10.
- `sort=lastName,asc` fijo (el contrato no ofrece búsqueda/filtros; no inventarlos).
- Anterior/Siguiente con `first`/`last` derivados de `PageModel`
  (`totalPages = ceil(totalItems/pageSize)`; `hasNext = page < totalPages - 1`).

### A2. Alta guiada en 3 pasos (deuda T6)

El DTO de creación **no admite `birthDate`** (doc 04 §2, T6). Secuencia exacta del wizard
en `/athletes/nuevo` con estado local de paso:

1. **Paso 1 — datos básicos** → `POST /api/v1/athletes` con
   `{ username, email, firstName, lastName, photoUrl? }`. Al 201, guardar el `id` y pasar
   al paso 2. El 409 se discrimina por campo con `getDuplicateField` (mensajes
   `"Athlete with username already exists"` / `"Athlete with email already exists"`).
2. **Paso 2 — fecha de nacimiento** → `PUT /api/v1/athletes/{id}` con `{ birthDate }`
   (ISO `YYYY-MM-DD`). Este paso es obligatorio si se quiere la fecha; ofrece "Omitir".
3. **Paso 3 — perfil (opcional/saltable)** → `POST /api/v1/athletes/{id}/profile`
   (upsert) con `{ weightKgs, heightCm, armSpanCm?, notes? }`. Botón "Omitir y terminar".

Comportamiento de abandono: **tras el paso 1 el deportista YA EXISTE** en el back. Si el
usuario abandona el wizard (botón "Terminar después" en pasos 2 y 3), se navega a la ficha
del deportista recién creado con un aviso textual de que puede completar datos desde ahí.
No implementar deshacer ni borrado automático al cancelar.

Al terminar el paso 3 (u omitirlo) → navegar a `/athletes/:id`.

### A3. Ficha compuesta: 3–4 llamadas tolerante a 404

`GET /{id}` + `GET /{id}/profile` + `GET /{id}/sports` + catálogo `GET /sports`:

- `GET /{id}/profile` → 404 significa "sin perfil" (doc 04 §3): el hook lo traduce a
  `null` (no es un error de UI). Estado "Sin perfil registrado" + CTA al formulario.
- `GET /{id}` 404 → estado "Deportista no encontrado" (incluye soft-deleted, doc 08 §5).
- `GET /{id}/sports` devuelve **solo IDs**; los nombres se resuelven cruzando con el
  catálogo cacheado en memoria. `disciplineIds` se muestran como dato técnico (D4: no hay
  endpoint de nombres de disciplina — no inventar uno).
- Paralelizar las 4 queries (independientes salvo el catálogo, que además es compartido).

### A4. BMI y `bmiCategory` siempre del servidor

El front **nunca calcula** BMI, categoría ni `isComplete` (principio firme del back, doc
09 §3.7 y AGENTS.md). Se muestran `bmi` (máx. 2 decimales), `bmiCategory` (string español
literal, mostrar tal cual) e `isComplete` tal como llegan; `null` → "no disponible".

### A5. Edición parcial sin username/email

`PUT` solo actualiza campos no nulos y **no puede cambiar `username` ni `email`** (doc 04
§2). El formulario de `/athletes/:id/editar` reutiliza el del paso 1 del alta prefijado,
con `username` y `email` renderizados como campos bloqueados (`disabled` + nota "no
editable por la API"). Enviar solo los campos modificables: `firstName`, `lastName`,
`birthDate`, `photoUrl`.

### A6. Borrado con confirmación explícita

`DELETE` es soft delete sin undo (doc 08 §5): botón "Eliminar deportista" en la ficha →
`AlertDialog` de shadcn con texto que diga que la acción no se puede deshacer → al 204
invalidar la lista y navegar a `/athletes`. Sin papelera, sin "deshacer".

### A7. Reemplazo total de deportes

`POST /{id}/sports` **reemplaza** el set completo (doc 04 §4): la UI edita una selección
(1 mínimo, 10 máximo, validación client-side) y envía siempre la lista final completa.
Para "quitar un deporte" se reenvía la selección sin él. Listas vacías: prohibido enviar
(`sportIds: []` da 400) — deshabilitar "Guardar" con selección vacía.

### A8. Errores reutilizando los helpers existentes

| Status | Manejo EXACTO |
|--------|----------------|
| `409` alta | `getDuplicateField(error)` → error por campo en `username` o `email` (mensajes propios en español; nunca el crudo del back) |
| `400` cualquiera | `toUserFacingMessage(error)` en banner; si devuelve el fallback seguro, mostrarlo tal cual (T1/T2) |
| `404` ficha/perfil | estados "no encontrado" / "sin perfil" (A3) |
| `401` | ya gestionado por el interceptor de sesión (no tocar) |
| `403` | no aplica en este módulo salvo `POST /athletes/sports` (ADMIN), que queda FUERA de scope |
| `5xx` | banner/pantalla de error con reintento manual |

### A9. Componentes shadcn SOLO vía MCP

Instalar (si no existen) mediante el MCP shadcn, nunca a mano: `table`, `badge`,
`skeleton`, `textarea`, `checkbox`, `alert-dialog`. Estilo con tokens del tema
(`bg-panel`, `text-dim`, `rounded-control`, etc.) — cero colores literales. Si el CLI
de shadcn recrea un directorio literal `@/`, mover los archivos a `src/components/ui/` y
borrarlo (bug conocido de la v4.21, anotado en AGENTS.md).

### A10. Foto = input de URL (D5)

Sin upload. El avatar es `<img src={photoUrl}>` con fallback: si no hay URL o la imagen
falla (`onError`), mostrar iniciales (primera letra de `firstName` + primera letra de
`lastName`) en un bloque con tokens del tema. No renderizar el `alt` vacío.

## Estructura de archivos a crear

```
src/lib/api/types.ts                      # + DTOs del módulo (ampliar, ver shape abajo)
src/modules/athletes/
  athletes-api.ts                         # hooks TanStack Query (queries + mutations)
  athletes-list-page.tsx                  # /athletes (lista server-side)
  athlete-detail-page.tsx                 # /athletes/:id (ficha compuesta)
  athlete-create-page.tsx                 # /athletes/nuevo (wizard 3 pasos)
  athlete-edit-page.tsx                   # /athletes/:id/editar
  athlete-form.tsx                        # formulario reusable datos básicos (paso 1 + edición)
  athlete-profile-form.tsx                # formulario reusable del perfil (paso 3 + ficha)
  athlete-sports-form.tsx                 # selección de deportes (reemplazo total)
  *.test.tsx                              # tests unitarios del módulo
src/components/ui/                        # table, badge, skeleton, textarea, checkbox, alert-dialog
src/app/routes.tsx                        # rutas reales
```

### DTOs exactos (añadir a `src/lib/api/types.ts`; `birthDate`/`photoUrl` pueden ser null)

```ts
export interface AthleteResponse {
  id: number; username: string; email: string;
  firstName: string; lastName: string; fullName: string;
  birthDate: string | null; photoUrl: string | null; active: boolean;
}
export interface AthleteCreateRequest {
  username: string; email: string; firstName: string; lastName: string; photoUrl?: string;
}
export interface AthleteUpdateRequest {
  firstName?: string; lastName?: string; birthDate?: string; photoUrl?: string;
}
export interface AthleteProfileResponse {
  id: number; weightKgs: number; heightCm: number; armSpanCm: number | null;
  bmi: number | null; bmiCategory: string | null; notes: string | null; isComplete: boolean;
}
export interface AthleteProfileUpsertRequest {
  weightKgs: number; heightCm: number; armSpanCm?: number; notes?: string;
}
export interface SportResponse {
  id: number; name: string; description: string | null; active: boolean; disciplineIds: number[];
}
export interface AssignSportsRequest { sportIds: number[] }
```

### Hooks exactos (en `athletes-api.ts`, patrón de `auth-api.ts`)

- `useAthletesPage(page, size)` — query `["athletes", "list", page, size]` vía
  `moduleQueryKey`; `GET /athletes?page=&size=&sort=lastName,asc`; normalizar con
  `toPageModel`. Mantener página anterior mientras carga (`placeholderData: keepPreviousData`
  de TanStack v5).
- `useAthlete(id)` — `GET /athletes/{id}`.
- `useAthleteProfile(id)` — `GET /athletes/{id}/profile` con `retry: false`; el fetcher
  captura `ApiError 404` y devuelve `null` (sin perfil no es error).
- `useAthleteSportIds(id)` — `GET /athletes/{id}/sports` → `number[]`.
- `useSportsCatalog()` — `GET /athletes/sports`; `staleTime: Infinity` (catálogo casi
  estático, doc 04 §5 lo invita a cachear).
- `useCreateAthlete()` — POST; al éxito invalida `["athletes", "list"]`.
- `useUpdateAthlete(id)` — PUT; invalida lista + detalle del atleta.
- `useDeleteAthlete(id)` — DELETE; invalida lista + detalle.
- `useUpsertAthleteProfile(id)` — POST profile; invalida lista (no toca) y perfil.
- `useAssignAthleteSports(id)` — POST sports; invalida sports del atleta (y, si hiciera
  falta, el detalle).

## Validación client-side (replicar el contrato, T1)

Estos límites deben codificarse **en el front** (el 400 del back no dice el campo, doc 08 §1):

| Campo | Regla front (= regla back) |
|-------|----------------------------|
| `username` | obligatorio, 3–255 chars |
| `email` | obligatorio, formato email, máx 255 |
| `firstName`/`lastName` | obligatorio, máx 100 |
| `photoUrl` | opcional; si presente, URL http(s) válida |
| `birthDate` | obligatorio en paso 2 si no se omite; fecha pasada o hoy (no futura) |
| `weightKgs` | obligatorio en perfil, 1.0–500.0 (hasta 2 decimales) |
| `heightCm` | obligatorio en perfil, 10.0–300.0 (hasta 1 decimal) |
| `armSpanCm` | opcional, 10.0–300.0 |
| `notes` | opcional, texto libre |
| `sportIds` | 1–10 seleccionados (botón Guardar deshabilitado fuera de rango) |

Usar `react-hook-form` + `zod` + `@hookform/resolvers` (ya instalados). El 400 del servidor
queda como red de seguridad vía `toUserFacingMessage`.

## `data-testid` obligatorios (convención con e2e-tester)

`athletes-table` · `athletes-row` (por fila) · `athletes-pagination-prev` ·
`athletes-pagination-next` · `athletes-empty` · `athlete-create-link` ·
`athlete-form-username/email/firstName/lastName/photoUrl` · `athlete-birthdate-input` ·
`athlete-profile-weight/height/armspan/notes` · `athlete-sports-toggle-<id>` ·
`athlete-sports-save` · `athlete-delete-button` · `athlete-delete-confirm` ·
`athlete-skip-step` · `athlete-finish-step`

## Reglas duras de UI (AGENTS.md) — recordatorio expreso

- Tras cambios visuales: dev server arriba + navegación con MCP playwright. **NO usar
  `browser_take_screenshot`** (límite de imágenes del modelo); verificar con
  `browser_snapshot`/`browser_evaluate` (computed styles/DOM). Máx. 1 captura puntual.
- Cero colores literales; `npm run design:check` debe pasar.
- Solo tokens de `DESIGN.md`/`src/shared/theme/globals.css`; sin sombras/gradientes
  inventados ni flechas "→" en botones.

## Alternativas consideradas y descartadas

- **Pedir `birthDate` en el DTO de creación al back**: documentado como T6 "o pedir
  cambio al back". Se descarta: cambio localizable y barato el wizard de 3 pasos; bloquear
  el change en el back no compensa.
- **Incluir la UI de creación de deportes (`POST /athletes/sports`, ADMIN)**: fuera de
  scope; no hay flujo de usuario que la requiera hoy (los deportes se siembran por DB).
- **Paginar la lista client-side**: prohibido por A1 (el endpoint pagina de verdad).

## Deuda registrada que queda tras el change

- Búsqueda/filtros de deportistas: el back no los expone (doc 04 §1); no se implementan.
- `GET /athletes/sports` ADMIN-only create queda fuera de scope (ver arriba).
- `disciplineIds` se muestran como IDs hasta que exista `GET /disciplines` (D4).
