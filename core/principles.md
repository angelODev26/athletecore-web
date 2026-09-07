# Principios universales de desarrollo de software

Los siguientes principios aplican a todo proyecto generado por este sistema, sin importar el lenguaje, stack o dominio. Cada agente especializado debe respetarlos como pilar base, además de sus reglas específicas de dominio.

---

## 1. Principios SOLID

- **Single Responsibility**: cada módulo, clase o función debe tener una única razón para cambiar.
- **Open/Closed**: abiertos para extensión, cerrados para modificación directa.
- **Liskov Substitution**: los tipos derivados deben poder sustituir a sus bases sin alterar la corrección del programa.
- **Interface Segregation**: preferir interfaces pequeñas y cohesivas en lugar de contratos monolíticos.
- **Dependency Inversion**: depender de abstracciones, no de implementaciones concretas.

## 2. Manejo de errores explícito

- Nunca silenciar excepciones con bloques vacíos o genéricos sin logging.
- Fallar rápido (fail fast) con mensajes claros que indiquen qué falló y por qué.
- Distinguir entre errores recuperables (reintentar, degradar) y no recuperables (detener).

## 3. Cobertura de tests en lógica de negocio

- Toda lógica de negocio no trivial debe tener al menos un test automático que la ejercite.
- Priorizar tests de comportamiento (qué hace el sistema) sobre tests de implementación (cómo lo hace internamente).
- Los tests deben ser deterministas: no depender de hora, red o estado externo no controlado.

## 4. Seguridad básica

- **Nunca hardcodear secretos, credenciales ni tokens** en el código fuente.
- Usar variables de entorno o servicios de secretos (según lo que el stack soporte).
- Aplicar el principio de menor privilegio: los procesos, roles y servicios deben tener solo los permisos estrictamente necesarios.

## 5. Calidad de código y proceso

- Todo cambio significativo debe pasar por revisión de código (code review) antes de integrarse a la rama principal.
- Documentar decisiones técnicas no triviales: si se descarta una alternativa obvia, dejar constancia del porqué en comentarios o documentación.
- Mantener consistencia con las convenciones del proyecto en uso (naming, formateo, estructura de carpetas).

## 6. Flujo de trabajo con git

- **Nunca trabajes directamente sobre `main`/`master`.** Toda tarea que modifique código comienza creando su propia rama.
- **Primer paso operativo** antes de tocar cualquier archivo: verifica la rama actual (`git branch --show-current`). Si es la rama principal, crea la rama del cambio antes de continuar.
- **Convención de nombres**:
  - Trabajo originado en una propuesta OpenSpec → `feature/<nombre-del-cambio-openspec>`.
  - Otro trabajo nuevo → `feature/<descripcion-corta-kebab>`.
  - Correcciones → `fix/<descripcion-corta>`; urgencias en producción → `hotfix/<descripcion-corta>`.
- **Ramas cortas**: mergea a la rama principal en cuanto el cambio esté terminado y revisado, y borra la rama. No acumules trabajo eterno en ramas paralelas.
- **Excepción permitida**: cambios triviales de documentación o comentarios pueden ir directo a la rama principal, pero el agente debe declararlo explícitamente en su salida ("commit directo a main: [motivo]").

---

> Estos principios son universales. Cada agente especializado los aplica como base, y añade sobre ellos las reglas específicas de su lenguaje, framework y dominio de negocio.
