## 1. Setup del proyecto

- [x] 1.1 Crear `package.json` con React 19, TypeScript, Vite 8 y scripts `dev`, `build`, `preview`, `lint`, `test`.
- [x] 1.2 Crear archivos base: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json` si aplica, `index.html` y `src/main.tsx`.
- [x] 1.3 Configurar alias de imports y estructura inicial `src/app`, `src/modules`, `src/shared`, `src/lib/api`, `src/lib/auth`.
- [x] 1.4 Instalar/configurar Tailwind 4 con tokens CSS propios, un solo acento de color y estilos globales.

## 2. Shell, routing y estados compartidos

- [x] 2.1 Crear router con React Router: ruta pública `/login` y rutas privadas placeholder (`/`, `/athletes`, `/training`, `/checkups`, `/reports`).
- [x] 2.2 Implementar `AppShell` con navegación principal persistente y marca activa de ruta.
- [x] 2.3 Implementar guards de ruta por sesión y filtrado de navegación por roles decodificados del JWT.
- [x] 2.4 Crear componentes compartidos `LoadingState`, `EmptyState`, `ErrorState` y `ForbiddenState` en `src/shared/components`.

## 3. Capa de datos base

- [x] 3.1 Crear store Zustand de sesión con abstracción `AuthTokens { access, refresh? }` y persistencia mínima del access token.
- [x] 3.2 Implementar cliente `fetch` en `src/lib/api` con base URL desde `VITE_API_URL` (default `http://localhost:8080`), header Bearer y timeout/base handlers.
- [x] 3.3 Implementar mapeo de `ErrorResponse`, interceptor `401`→logout/login y `403`→estado sin permisos.
- [x] 3.4 Configurar `QueryClientProvider` con defaults y convención de query keys por módulo.
- [x] 3.5 Crear adapter de paginación client-side (`items`, `page`, `pageSize`, `totalItems`) y tipos DTO base del contrato.

## 4. Placeholders de módulos

- [x] 4.1 Crear pantalla placeholder de dashboard en `src/modules/dashboard`.
- [x] 4.2 Crear pantalla placeholder de deportistas en `src/modules/athletes`.
- [x] 4.3 Crear pantalla placeholder de entrenamientos en `src/modules/training` restringida a ADMIN/COACH.
- [x] 4.4 Crear pantalla placeholder de chequeos en `src/modules/checkups`.
- [x] 4.5 Crear pantalla placeholder de reportes en `src/modules/reports`.

## 5. Verificación

- [x] 5.1 Ejecutar `npm run build` y corregir errores de TypeScript.
- [x] 5.2 Ejecutar `npm run lint` si existe script y corregir errores bloqueantes.
- [x] 5.3 Levantar `npm run dev` y verificar navegación entre rutas usando Playwright MCP con screenshot.
- [x] 5.4 Actualizar `AGENTS.md` si la estructura o scripts finales difieren de lo documentado.
