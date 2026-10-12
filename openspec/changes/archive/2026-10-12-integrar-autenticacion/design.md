# Diseño: integrar-autenticacion

## Context

La app del sprint 0 compila y tiene estructura, pero viola dos contratos:

1. **Diseño:** `globals.css` define a mano una paleta light (`--color-ink`, `--color-paper`, `--color-accent`) ajena a `DESIGN.md`, que exige tema dark sobre `src/styles/tokens.css` (generado, intocable a mano). No hay `components.json`: shadcn nunca se inicializó.
2. **Autenticación:** toda la sesión es simulada. El contrato (`docs/backend-contract/02` y `03`) fija: `POST /api/v1/auth/login` devuelve `{token, type:"Bearer", expiresIn (ms), user}`; registro público `POST /api/v1/users` sin token en respuesta; sin refresh, sin `/me`, sin logout (stateless); `401` indistinto entre token expirado e inválido → re-login; `403` → solo sin permisos.

Restricciones duras: componentes shadcn SIEMPRE vía MCP (never markup inventado), `design:check` debe pasar (sin hex/rgb/literales fuera de `tokens.css`), el front nunca calcula reglas de negocio, y tras cada cambio visual screenshot con Playwright MCP.

## Goals / Non-Goals

**Goals:**
- Login y registro reales contra el backend local, con estados del catálogo §6 (inputs con error, validation banner `role="alert"`, botón primary).
- Sesión persistida con expulsión proactiva por `exp` y re-acción 401 → login / 403 → forbidden.
- Tema dark real y shell conforme a DESIGN.md (sidebar 240, plano).
- Componentes shadcn base instalados vía MCP, con variables mapeadas a nuestros tokens semánticos.

**Non-Goals:**
- Refresh token (D1: no existe en back; re-login tras expirar).
- OAuth, recuperar contraseña, "recordarme".
- E2E con Playwright infra (eso es el agente `e2e-tester`; aquí solo screenshots de verificación vía MCP).
- Añadir más componentes shadcn de los listados (button, input, label, card, alert, form).

## Decisions

### 1. Token en `localStorage` (acepta doc 02 §6)
Sin refresh token que proteger y perfil de riesgo bajo → `localStorage`. La abstracción `AuthTokens { access, refresh? }` se conserva tal cual (la decisión D1 sigue vigente: re-login tras expirar).
Alternativa rechazada: cookie HttpOnly — requeriría cambios de backend fuera de scope.

### 2. shadcn mapeado a tokens del contrato, sin colores hardcoded
`components.json` con `cssVariables: true`. En `globals.css` se declara únicamente el mapping de las variables que el registry consume (`--background`, `--foreground`, `--primary`, `--ring`, `--destructive`, `--border`, `--input`, `--radius`...) **referenciando** `var(--color-surface-*)`, `var(--color-text-*)`, `var(--color-action-*)`, `var(--color-status-danger*)`, `var(--radius-control)` — sin un solo literal. Así `check-hardcoded-styles.mjs` pasa y DESIGN.md §2 se cumple (la capa shadcn apunta a tokens semánticos, no a primitivas).
Alternativa rechazada: dejar los valores por defecto del registry (oklch) — violaría DESIGN.md.

### 3. Expulsión proactiva con `exp` + 401 como respaldo
El store calcula `isExpired()` desde el claim `exp` (o desde `storedAt + expiresIn` si falta). Un `useEffect` en `RequireAuth` programa un timer hasta la expiración para redirigir sin esperar una llamada fallida (doc 02 §2 lo marca recomendado). El interceptor 401 permanece como red de seguridad.

### 4. Registro sin auto-login
El contrato (doc 03 §3) devuelve solo el `UserResponse`. Tras registrarse → redirect a `/login` con estado de éxito. No hay intento de `login` encadenado: si el usuario equivoca el password recién creado, el mensaje "Credenciales inválidas" sería confuso.

### 5. Errores de formulario mapeados en front
Los mensajes del DTO de registro están en inglés (doc 03). El front valida localmente (username 3–50, email válido, password ≥6, coincidencia) y solo muestra el mensaje de red/servidor ante `401` (login) o `409`/`400` (registro) con un mensaje propio — no el texto crudo del backend (estrategia del doc 08).

### 6. Ruta de registro: `/registro` (idioma del producto)
La app navega ya en español en labels; la ruta sigue esa convención.

## Risks / Trade-offs

- **DESIGN.md §7 no define patrón de login/registro** → se resuelve composición del catálogo §6: card centrada sobre `surface.bg`, banner de validación sobre las acciones. Documentado aquí como decisión del change; si `design-system-keeper` define un patrón después, se migra en otra tarea.
- **Instalar shadcn toca muchos ficheros** → se aísla en las primeras tareas y se valida `design:check` antes de pintar las pantallas.
- **JWT sin verificación de firma en front** → solo se decodifica para UX (doc 02 lo propone explícitamente); el back siempre re-valida.
