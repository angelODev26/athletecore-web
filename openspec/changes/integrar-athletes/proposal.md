# Propuesta: integrar-athletes

## Why

El módulo de deportistas es el primer dominio de negocio del front tras `integrar-autenticacion`.
Hoy la ruta `/athletes` es un placeholder del shell. La UI necesita el CRUD visible de
deportistas, su ficha (detalle + perfil antropométrico + deportes) y el alta guiada, todo
contra el contrato real del back (`docs/backend-contract/04-contrato-api-deportistas.md`).

## What Changes

- Reemplazar el placeholder de `/athletes` por la **lista paginada server-side** de
  deportistas (`GET /api/v1/athletes?page=&size=&sort=`, el único listado paginado de la API).
- Nueva **ficha del deportista** (`/athletes/:id`) que compone 3–4 llamadas: detalle,
  perfil (tolerando 404 = "sin perfil"), IDs de deportes + catálogo cacheado.
- **Alta guiada en 3 pasos** (`/athletes/nuevo`): datos básicos (`POST`), fecha de
  nacimiento (`PUT` parcial, deuda T6 del contrato) y perfil antropométrico opcional/saltable
  (`POST .../profile` upsert).
- **Edición parcial** (`PUT`) desde `/athletes/:id/editar` — `username` y `email` no son
  editables por API y se muestran de solo lectura.
- **Borrado con confirmación** (`DELETE`, soft delete → 204) desde la ficha.
- **Asignación de deportes** con semántica de reemplazo total (`POST .../sports`, 1–10 IDs).
- Tipos TS nuevos de los DTOs del módulo y hooks TanStack Query en
  `src/modules/athletes/athletes-api.ts`, siguiendo el patrón de `auth-api.ts`.
- Nuevos componentes shadcn **gestionados vía MCP shadcn**: `table`, `badge`, `skeleton`,
  `textarea`, `checkbox`, `alert-dialog` (ver Impact).

## Capabilities

### New Capabilities
- `gestion-deportistas`: gestión visual del dominio deportistas (lista paginada, ficha
  compuesta, alta guiada, edición parcial, borrado con confirmación, perfil antropométrico
  con BMI calculado por el servidor y asignación de deportes por reemplazo total).

### Modified Capabilities

*(ninguna — la ruta `/athletes` deja de ser placeholder, pero el requisito de navegación
del shell no cambia de comportamiento a nivel de spec).*

## Impact

- **Código nuevo:** `src/modules/athletes/` (páginas, hooks), tipos en `src/lib/api/types.ts`.
- **Código tocado:** `src/app/routes.tsx` (rutas reales sustituyen el placeholder);
  posible ajuste menor del placeholder `AthletesPage` existente (eliminar o reemplazar).
- **Componentes shadcn nuevos** (solo vía MCP shadcn): `table`, `badge`, `skeleton`,
  `textarea`, `checkbox`, `alert-dialog`.
- **Back requerido en local:** `athletecore-api` con perfil `local` y `.env`
  (credenciales `athletecore_user/athletecore_pass`, ya creado); usuarios de prueba
  `demo.user` / `admin.demo` (secret123) ya existen en la DB local.
- **Contrato:** `docs/backend-contract/04` (módulo), `08` (errores/paginación/formatos),
  `flujo-completo` (flujo de alta). Deuda tolerada: T1 (400 sin campo), T2 (mensajes
  ES/EN → `toUserFacingMessage`/`getDuplicateField` existentes), T6 (alta en pasos).
- **Sin dependencias npm nuevas** más allá de lo que traigan los componentes shadcn (radix).
