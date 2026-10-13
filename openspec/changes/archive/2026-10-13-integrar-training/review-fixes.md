# Correcciones de la revisión `/review` — integrar-training

> Encargo para el modelo implementador. Revisión de solo lectura completada; veredicto
> "corregir antes de continuar". **Aplicar TODO lo siguiente sin deuda** (incluye nits).
> Rama `feature/integrar-training` (existente). Al terminar: `npm run test`,
> `npm run build`, `npm run design:check` en verde y marcar los ítems.

## C1. [Integridad] La edición de sesión no puede limpiar campos opcionales

**Evidencia**: `session-form.tsx:185-191` — al vaciar Volumen/Intensidad/Distancia el
cambio se descarta en silencio; al vaciar `startTime`, `undefined` desaparece del JSON.
El usuario cree haber borrado el dato y el back conserva el valor anterior.

**Hecho de back (verificado en `../athletecore-api`)**: `TrainingSessionService.updateSession`
aplica semántica *null = omitir* (`if (request.x() != null)`) por campo — **no distingue
"campo ausente" de "campo a null"**, así que enviar `null` tampoco limpiaría. Con el back
actual es IMPOSIBLE limpiar un campo opcional ya relleno.

**Fix**:
1. En `session-form.tsx`, modo edición: si un campo opcional tiene valor previo, vaciarlo
   es un error de campo ("Una vez guardado no se puede dejar vacío; solo puedes
   sustituirlo") y bloquea el envío. Campos nuevos (sin valor previo) sí pueden quedar
   vacíos (significa "no informado"). ✅
2. Registrar la limitación como deuda en `tasks.md` (sección Desviaciones) con referencia:
   necesita que el back distingua null de ausente (Jackson `JsonNode`/Optional) — candidata
   para doc 09. ✅
3. Test: editar y vaciar `volume` muestra el error de campo y NO llama al back. ✅

## C2. [Integridad] Invalidación incompleta tras mutar sesiones ✅

**Evidencia**: `training-api.ts` — `useUpdateSession`, `useUpdateSessionStatus` y
`useDeleteSession` solo invalidan `sessionDetailKey`; la lista del microciclo
(`cycleSessionsKey`) queda en caché hasta `staleTime` (sesión borrada visible ~30 s).

**Fix**: esas 3 mutaciones invalidan también la clave de lista de sesiones del ciclo
(prefix de la factory correspondiente; el `cycleId` de la sesión está disponible en la
respuesta/argumentos — usar `invalidateQueries` por prefijo si es más simple y seguro).
Test: tras borrar, la query de lista del ciclo queda invalidada.

## C3. [Contrato] Umbral de racha hardcodeado en UI ✅

**Evidencia**: `alerts-page.tsx:167` clasifica `consecutiveAbsenceCount >= 3` como
"Racha alta". El umbral es configuración del servidor (`TRAINING_ABSENCE_THRESHOLD`,
doc 05 §5); clasificar en el front deriva negocio (roza T10).

**Fix**: eliminar la clasificación y mostrar el conteo tal cual
("N ausencias consecutivas" + fecha). Ajustar el test afectado.

## C4. [Contrato] Validaciones de longitud inventadas en el front ✅

**Evidencia**: `plan-form.tsx` (`description` máx 1000) y `session-form.tsx`
(`observations` máx 2000). Verificado en `../athletecore-api`: NINGÚN `@Size` sobre esos
campos (`CreateTrainingPlanRequest`/`CreateSessionRequest`); el front bloquearía datos
válidos.

**Fix**: eliminar ambos límites. Mantener SOLO los documentados: `name` plan máx 150,
`volume` 0–100000, `intensity` 0–100, `distance` ≥ 0.

## C5. [Mantenibilidad] Petición con id `NaN` ✅

**Evidencia**: `plan-detail-page.tsx:36` y `session-detail-page.tsx:53` — el hook se
ejecuta antes del guard de NaN: URL con id no numérico dispara `GET .../NaN`.

**Fix**: parsear el parámetro con `Number(...)` y pasar `enabled: Number.isFinite(id)`
a la query (además del guard de render existente). Test: `/training/plans/abc` no lanza
request y muestra "no encontrado".

## C6. [Mantenibilidad] Página vacía tras dismiss en alertas ✅

**Evidencia**: `alerts-page.tsx` — si el usuario descarta todas las alertas de la página
actual, queda en una página vacía.

**Fix**: tras un dismiss, re-clamp del índice de página (`Math.min(page, totalPages-1)`,
como mínimo volver a la última página con contenido). Test que lo ejercite.

## C7. [Nit] Doble suscripción a la query de sesión ✅

**Evidencia**: `session-detail-page.tsx:203` — `SessionMetrics` vuelve a llamar
`useSession(sessionId)`.

**Fix**: recibir `session` por props.

## C8. [Nit] Parámetro muerto en SectionHeader de alertas ✅

**Evidencia**: `alerts-page.tsx:180-181` — `SectionHeader({ isAdmin })` con `void isAdmin`.

**Fix**: eliminar el parámetro (y la prop en el call-site).

## C9. [Nit] Query key literal fuera del patrón ✅

**Evidencia**: `attendance-grid.tsx:26` — `["training","athletes-all"]` literal.

**Fix**: factory exportada siguiendo el patrón del módulo (junto a `moduleQueryKey` en
`training-api.ts`, p. ej. `allAthletesKey`) y usarla en el grid.

## C10. [Cross-módulo, autorizado por el humano] Wiring de `setForbiddenHandler` ✅

`setForbiddenHandler` está exportado (`src/lib/api/http.ts:18`) pero **nadie lo registra**:
un 403 real de servidor no muestra la vista "sin permisos" global (cae al estado de error
genérico de la query).

**Fix (within `src/app/`)**: registrar el handler al montar el shell autenticado
(p. ej. `useEffect` en `AppShell`/`RequireAuth`): ante un 403 de servidor mostrar la vista
"sin permisos" ya existente (`ForbiddenState` de `guards.tsx`) **sin cerrar sesión**.
Desregistrar al desmontar. Test: una query que responde 403 lleva a la vista sin-permisos
y la sesión sigue activa. Si el mecanismo elegido difiere (estado en store, componente de
error boundary…), anotarlo en Desviaciones con justificación; el criterio de aceptación es
el de arriba.

## Cierre

- [x] Todos los ítems C1–C10 resueltos y marcados; desviaciones anotadas abajo.
- [x] `npm run test`, `npm run build`, `npm run design:check` en verde.
- [x] Commit/push/merge lo decide el humano.

## Desviaciones registradas

_(rellenar durante la corrección si algo difiere de este documento)_

## Residuales de la 2.ª revisión (resueltos por el planificador)

1. Test espejo C5 para sesiones: añadido en `session-detail-page.test.tsx`
   ("id no numérico no dispara request", dentro del describe "estado y borrado").
2. Test directo de invalidación de `useUpdateSession`: añadido en
   `training-api.test.tsx` ("C2: editar sesión invalida detalle + lista del ciclo").
   Resultado tras ambos: `npm run test` → 19 ficheros / **130 tests** en verde;
   build y `design:check` OK.

- **C2 — mecanismo de invalidación**: para `useUpdateSession`/`useUpdateSessionStatus` se
  usa el `cycleId` de la respuesta del PUT (invalida la lista exacta del ciclo); para
  `useDeleteSession` (204 sin body, sin cycleId) se invalida **por prefijo**
  (`cycleSessionsKeyPrefix`, nueva factory exportada) — todas las listas de ciclos se
  refrescan, que es la opción "simple y segura" que anticipaba el encargo.
- **C5 — mecanismo**: `enabled: Number.isFinite(id)` en `useTrainingPlan`/`useSession`
  (hooks con parámetro `enabled` opcional, default `true`) + guard de render ya existente.
- **C10 — mecanismo elegido**: registro del handler en `useEffect` de `AppShell`
  (dentro de `RequireAuth`, así siempre hay sesión al registrar); un 403 de servidor
  muestra `ForbiddenState` (el de `guards.tsx`/`states.tsx`) en lugar del `<Outlet />`,
  **sin cerrar sesión**; el flag se reinicia al cambiar de ruta (`location.pathname`)
  para que la vista no persiga al usuario por toda la app; desregistro en el unmount
  (`setForbiddenHandler(null)`). Test `src/app/app-shell.test.tsx` ejercita el camino
  real (fetch stubbeado → `apiFetch` → handler → vista) incluyendo el reset por navegación.
