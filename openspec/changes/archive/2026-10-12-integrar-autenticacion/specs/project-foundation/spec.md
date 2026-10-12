# specs/project-foundation/spec.md (delta)

## MODIFIED Requirements

### Requirement: Base visual con Tailwind 4 y tokens propios
El sistema SHALL configurar Tailwind 4 de modo que las utilidades consuman los tokens semánticos generados desde `docs/design/tokens.json` (tema dark, `color-scheme: dark`), y SHALL instalar los componentes base del catálogo (button, input, label, card, alert, form) vía shadcn MCP con sus variables mapeadas a esos tokens.

#### Scenario: Tokens disponibles para componentes
- **WHEN** un componente del shell o un shadcn instalado usa color/radio/espaciado/tipografía
- **THEN** el estilo se resuelve desde `src/styles/tokens.css` o su alias semántico y no desde literales ni valores por defecto del registry

#### Scenario: Verificación de contrato de diseño
- **WHEN** se ejecuta `npm run design:check`
- **THEN** pasa sin violaciones (sin literales, sin primitivas, sin valores arbitrarios)
