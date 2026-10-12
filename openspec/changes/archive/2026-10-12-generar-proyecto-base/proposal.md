## Why

El repositorio hoy solo contiene documentación, contratos del backend y configuración de agentes, pero no existe todavía la SPA de AthleteCore. Necesitamos generar el proyecto base con las tecnologías ya acordadas para que los módulos de negocio puedan empezar a implementarse sobre una estructura real, ejecutable y alineada con `docs/backend-contract/`.

## What Changes

- Crear la base ejecutable de la SPA con **React 19 + TypeScript + Vite 8**.
- Configurar **Tailwind 4** con tokens propios y un solo color de acento, preparado para componentes shadcn/ui.
- Establecer la estructura inicial de `src/` con shell de aplicación, rutas y estados compartidos.
- Añadir la fundación de capa de datos contra `http://localhost:8080`: cliente fetch tipado, manejo de errores `ErrorResponse`, `401`→login y `403`→sin permisos, y TanStack Query.
- Dejar preparadas las pantallas base/placeholder de los módulos principales para conectar después con los agentes `*-ui`.

## Capabilities

### New Capabilities

- `project-foundation`: tooling, dependencias, variables de entorno, scripts y estructura inicial del proyecto React/Vite/Tailwind.
- `app-shell-navigation`: layout principal, navegación, rutas iniciales y estados compartidos de carga/error/vacío.
- `data-access-foundation`: cliente HTTP, abstracción de tokens/sesión para interceptores, TanStack Query y adaptadores base de paginación.

### Modified Capabilities

<!-- No hay specs existentes todavía. -->

## Impact

- Código nuevo bajo `src/`, más `package.json`, `vite.config.ts`, `tsconfig*`, config de Tailwind y archivos de entrada.
- Dependencias nuevas de runtime y tooling: React 19, Vite 8, TypeScript, Tailwind 4, TanStack Query, React Router y utilidades base.
- No rompe APIs existentes; consume el contrato documentado en `docs/backend-contract/` como fuente de verdad.
