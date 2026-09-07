---
description: Revisión de código post-tarea — invoca a quality-reviewer sobre los archivos tocados. Uso: /review [rutas opcionales]
---

Revisión de código solicitada vía `/review`.

**Alcance:** $ARGUMENTS

Protocolo fijo:

1. **Determina el alcance**:
   - Si `$ARGUMENTS` trae rutas o módulos, revisa solo eso.
   - Si está vacío, revisa el trabajo reciente: cambios sin commitear (`git status --short` + `git diff`); si el working tree está limpio, usa los archivos del último commit (`git diff HEAD~1 --name-only`). Informa qué alcance elegiste y por qué, en una línea.

2. **Carga el contexto de calidad** antes de juzgar nada:
   - `core/principles.md` (pilar base)
   - `AGENTS.md` (convenciones del proyecto, incluidas las reglas duras de UI)
   - `docs/backend-contract/08-convenciones-transversales.md` (contrato de errores, paginación y formatos del back)

3. **Invoca al subagente `quality-reviewer`** (via herramienta Agent) pasándole: la lista concreta de archivos a revisar, el contexto convencional cargado, y la instrucción de revisar únicamente ese alcance. Pídele evidencia concreta (`archivo:línea` + snippet) por hallazgo, priorizado: seguridad > integridad de datos > contrato API > mantenibilidad > estilo.

4. **Presenta su reporte** al usuario sin reescribir conclusiones, y cierra con:
   - Veredicto: `OK para avanzar` / `Corregir antes de continuar` / `Hay decisiones que requieren tu input`
   - Si hay hallazgos, propón el siguiente paso recomendado (corregir, posponer como deuda documentada, o descartar con justificación).

**Restricciones:** ni tú ni `quality-reviewer` modifican código en esta revisión. Este comando solo audita y reporta.
