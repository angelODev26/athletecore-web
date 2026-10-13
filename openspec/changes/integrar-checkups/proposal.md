# Propuesta: integrar-checkups

## Why

Auth, athletes y training están integrados. El siguiente dominio del contrato es
**chequeos mensuales** (`docs/backend-contract/06-contrato-api-chequeos.md`, verificado
contra el código del back en `~/athletecore-api`): registro de chequeos y tiempos de
prueba (ADMIN/COACH), lectura abierta a cualquier autenticado, comparación contra la
tabla nacional, proyección de medallería y la matriz de administración de la tabla
nacional (solo ADMIN). Hoy `/checkups` es un placeholder del shell (`CheckupsPage`).
El front **nunca** calcula clasificaciones ni formatea tiempos: todo tiempo visible
usa el `*Formatted` del servidor.

## What Changes

- Nueva capability **`gestion-chequeos`**: chequeos + tiempos + comparación +
  proyección + tabla nacional.
- **Pestaña de chequeos en la ficha del atleta** (`/athletes/:id/chequeos`):
  - Lista de chequeos con filtro año/mes (`GET /athletes/{id}/checkups?year=&month=`,
    sin paginar pero el filtro es server-side; no requiere paginación: ≤ 1 chequeo/mes).
  - Panel "Proyección de medallería" (`GET /athletes/{id}/projections`), se renderiza
    el array tal cual, con badge por `classification` (sin cálculo local).
  - Alta de chequeo (ADMIN/COACH) en dialog con validación local completa.
- **Detalle del chequeo** (`/athletes/:id/chequeos/:checkupId`): tiempos embebidos
  (tabla con `timeFormatted`), alta de tiempo (ADMIN/COACH) con input `mm:ss.fff`
  convertido a segundos, acción "Comparar con referencia" bajo demanda
  (`GET /checkups/{id}/comparison`) con estado dedicado para el 409 "triple incompleto",
  y "corregir" = **borrar y recrear** con confirmación explícita (deuda T5 del back:
  no existe PUT de chequeos ni de tiempos, ni DELETE individual de tiempo).
- **Matriz de tabla nacional** (`/tabla-nacional`, solo ADMIN): listado
  agrupado en cliente por `(style, distance, category)` con 3 celdas oro/plata/bronce;
  edición por celda (`POST` nuevo / `PUT` completo / `DELETE` con confirmación) y aviso
  visual cuando una combinación no tiene las 3 posiciones (la comparación falla con 409).
- **Navegación**: se retira el ítem "Chequeos" del nav (los chequeos viven en la ficha
  del atleta) y se añade "Tabla nacional" visible solo para ADMIN. Se elimina el
  placeholder `src/modules/checkups/checkups-page.tsx`.
- Capa de datos: DTOs exactos en `src/lib/api/types.ts` y hooks TanStack Query en
  `src/modules/checkups/checkups-api.ts` (patrón `training-api.ts`). Mensajes de
  duplicado en inglés añadidos a `KNOWN_BACKEND_MESSAGES`.
- Componentes shadcn **solo vía MCP** (los necesarios —dialog/select/table/etc.— ya
  están instalados; si falta alguno, vía MCP y vigilando el bug del CLI 4.21).

## Capabilities

### New Capabilities

- `gestion-chequeos`: pestaña de chequeos del atleta, alta/borrado de chequeos y
  tiempos con las reglas por rol del contrato, comparación y proyección con sus
  estados de "referencia incompleta", y matriz ADMIN de tabla nacional.

### Modified Capabilities

- `app-shell-navigation`: cambia la navegación (retira "Chequeos", añade
  "Tabla nacional" solo ADMIN) y se añade la ruta `/tabla-nacional` al conjunto
  filtrado por rol. El placeholder `/checkups` desaparece.

## Impact

- **Rutas**: `/athletes/:id/chequeos` y `/athletes/:id/chequeos/:checkupId` (cualquier
  autenticado; acciones de escritura ocultas por rol); `/tabla-nacional` bajo
  `RequireRoles(["ADMIN"])`. La ruta `/checkups` se elimina.
- **Capa de datos**: DTOs nuevos (`SwimmingStyle`, `CheckupCategory`, `Classification`,
  `CheckupResponse`, `CheckupDetailResponse`, `CheckupTimeResponse`,
  `CreateCheckupRequest`, `AddCheckupTimeRequest`, `PositionComparison`,
  `TimeComparisonResponse`, `MedalProjectionResponse`,
  `NationalReferenceTimeListItemResponse`, `NationalReferenceTimeRequest`) y hooks de
  módulo. `messages.ts` recibe las traducciones de los 3 duplicados en inglés.
- **Módulos**: `src/modules/checkups/` completo (páginas + forms + api + format + tests);
  enlace "Chequeos" desde la ficha del atleta (`athlete-detail-page.tsx`).
- **Dependencias**: ninguna fuera del registry shadcn (solo si falta algún componente).
- **AGENTS.md**: actualizar sección Estructura con el módulo checkups al finalizar.
