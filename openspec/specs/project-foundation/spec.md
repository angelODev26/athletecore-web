# project-foundation Specification

## Purpose
Define los fundamentos del proyecto `athletecore-web`: stack ejecutable (React 19 + TypeScript + Vite 8), tema visual con Tailwind 4 y tokens propios, configuración de entorno del cliente y estructura de carpetas estándar que sirve de contrato para los agentes especializados.

## Requirements

### Requirement: Proyecto React/Vite ejecutable
El sistema SHALL proveer una SPA React 19 + TypeScript empaquetada con Vite 8, con scripts `dev`, `build` y `preview` funcionales.

#### Scenario: La app arranca en desarrollo
- **WHEN** se ejecuta `npm install` y luego `npm run dev`
- **THEN** Vite levanta la aplicación y la ruta raíz responde sin errores de compilación

#### Scenario: La app compila para producción
- **WHEN** se ejecuta `npm run build`
- **THEN** se genera `dist/` sin errores de TypeScript

### Requirement: Base visual con Tailwind 4 y tokens propios
El sistema SHALL configurar Tailwind 4 de modo que las utilidades consuman los tokens semánticos generados desde `docs/design/tokens.json` (tema dark, `color-scheme: dark`), y SHALL instalar los componentes base del catálogo (button, input, label, card, alert, form) vía shadcn MCP con sus variables mapeadas a esos tokens.

#### Scenario: Tokens disponibles para componentes
- **WHEN** un componente del shell o un shadcn instalado usa color/radio/espaciado/tipografía
- **THEN** el estilo se resuelve desde `src/styles/tokens.css` o su alias semántico y no desde literales ni valores por defecto del registry

#### Scenario: Verificación de contrato de diseño
- **WHEN** se ejecuta `npm run design:check`
- **THEN** pasa sin violaciones (sin literales, sin primitivas, sin valores arbitrarios)

### Requirement: Variables de entorno del cliente
El sistema SHALL leer la URL base de la API desde `VITE_API_URL` y usar `http://localhost:8080` como valor por defecto.

#### Scenario: Sin variable definida
- **WHEN** `VITE_API_URL` no existe en el entorno
- **THEN** el cliente HTTP usa `http://localhost:8080`

### Requirement: Estructura de carpetas estándar
El sistema SHALL crear `src/app`, `src/modules`, `src/shared`, `src/lib/api` y `src/lib/auth` como puntos de entrada estables para los agentes especializados.

#### Scenario: Importar un módulo placeholder
- **WHEN** se importa una pantalla desde `src/modules/<modulo>`
- **THEN** el import no requiere rutas relativas frágiles fuera del alias de proyecto configurado
