# Propuesta: integrar-autenticacion

## Why

El sprint 0 dejó la app con pantallas placeholder y una sesión simulada: ningún flujo consume la API real y el tema visual no sigue `DESIGN.md` (dark, tokens semánticos generados). Sin autenticación real no es posible construir ninguna integración posterior — todos los endpoints de negocio exigen Bearer — y sin la base de diseño correcta cada pantalla acumularía trabajo visual desviado del contrato.

## What Changes

- **Tema alineado al contrato de diseño (corrige desviación del sprint 0):** `globals.css` consume los tokens semánticos de `src/styles/tokens.css` (tema dark, `color-scheme: dark`); se elimina la paleta light inventada (`--color-ink`, `--color-paper`, `--color-accent`).
- **Componentes base del catálogo §6 instalados vía shadcn MCP:** button, input, label, card, alert, form — mínimo reutilizable para login, registro y todos los módulos.
- **AppShell conforme a DESIGN.md:** sidebar 240px sobre `surface.sidebar`, ítem de nav activo con relleno `action.primary`, tipografía y radios del token scale.
- **Autenticación real contra `POST /api/v1/auth/login`:** mutación de login, persistencia del token en `localStorage` con duración `expiresIn`, decodificación de claims (`sub`, `userId`, `roles`, `exp`), hidratación al cargar y expulsión proactiva al expirar.
- **Registro público (`POST /api/v1/users`):** pantalla `/registro` con los campos del contrato (username 3–50, email, nombre, apellido, password mín. 6, confirmPassword), validación en front y redirect a login tras el alta (el back no devuelve token).
- **Guards y navegación reales por rol:** rutas públicas `/login` y `/registro`; el resto exige token no expirado; navegación filtrada por claims; `401` de cualquier llamada → limpiar sesión y volver a login; `403` → estado "sin permisos" (sin redirect).
- **Cierre de sesión:** acción que descarta el token local (el back es stateless; no hay endpoint de logout).

## Capabilities

### New Capabilities
- `autenticacion-sesion`: login real, registro público, ciclo de vida del token (persistencia, hidratación, expiración proactiva, logout) y autorización por claims del JWT.

### Modified Capabilities
- `project-foundation`: la base visual pasa a exigir el consumo de los tokens generados (tema dark) y los componentes base del catálogo instalados por shadcn MCP.
- `app-shell-navigation`: rutas públicas/privadas y navegación por rol pasan de estructura placeholder a comportamiento real contra la sesión JWT (incluye expiración y 401).

## Impact

- **Código:** `src/shared/theme/globals.css`, `src/app/app-shell.tsx`, `src/app/guards.tsx`, `src/app/router.tsx`, `src/modules/auth/*` (páginas nuevas de login y registro, hooks), `src/lib/auth/*` (store completo, helpers de expiración), `src/lib/api/http.ts` (interceptor 401/403 real), `components.json` + `src/shared/components/ui/*` (shadcn).
- **Dependencias nuevas:** las que el registry de shadcn declare para button/input/label/card/alert/form (tailwind-merge, clsx, react-hook-form, zod, @hookform/resolvers, radix peer deps…).
- **Contrato backend:** doc `02-autenticacion-y-seguridad.md` (matriz de acceso, ErrorResponse 401/403) y `03-contrato-api-usuarios.md` (login + registro). Sin cambios de backend.
