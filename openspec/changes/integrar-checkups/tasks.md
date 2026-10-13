# Tasks: integrar-checkups

> Implementación completa del módulo de chequeos según `design.md` (decisiones
> C1–C10 vinculantes) y `specs/gestion-chequeos/spec.md`. Rama:
> `feature/integrar-checkups`. Trabajar solo dentro del alcance; desviaciones se
> anotan abajo. Verificación obligatoria al final: `npm run test`, `npm run build`,
> `npm run design:check` en verde. Componentes shadcn SOLO vía MCP (los existentes ya
> cubren dialog/select/table/badge/alert-dialog/form/input; si falta alguno, instalar
> vía MCP y vigilar el bug del CLI 4.21: si crea un directorio literal `@/`, mover a
> `src/components/ui/` y borrarlo).

## Fase 0 — Capa de datos y tipos

- [x] 0.1 Crear la rama `feature/integrar-checkups` (el pre-commit hook rechaza
      commits directos a `main`).
- [x] 0.2 Añadir a `src/lib/api/types.ts` los DTOs exactos de `design.md`:
      `SwimmingStyle`, `CheckupCategory`, `Classification`, `CheckupResponse`,
      `CheckupTimeResponse`, `CheckupDetailResponse`, `CreateCheckupRequest`,
      `AddCheckupTimeRequest`, `PositionComparison`, `TimeComparisonResponse`,
      `MedalProjectionResponse`, `NationalReferenceTimeListItemResponse`,
      `NationalReferenceTimeRequest`.
- [x] 0.3 Crear `src/modules/checkups/checkups-api.ts` con las query keys y hooks
      exactos de C8 (patrón `training-api.ts`), incluido
      `isIncompleteReferenceError(error)`; `useCheckupComparison` con `enabled` lazy y
      `retry: false`; invalidaciones exactas (lista del atleta en todas sus variantes
      de filtro tras crear/borrar, detalle tras agregar tiempo, lista de referencias
      tras CRUD).
- [x] 0.4 Añadir a `KNOWN_BACKEND_MESSAGES` en `src/lib/api/messages.ts` los 3
      duplicados en inglés de C5 con sus traducciones ES exactas.
- [x] 0.5 `checkups-api.test.tsx`: URL/método/body exactos de los 10 endpoints,
      query string condicional de `useAthleteCheckups` (con y sin filtros),
      invalidaciones tras cada mutación, `isIncompleteReferenceError` (409 con/sin
      "triple completo", 404 negativo).
- [x] 0.6 `messages.test.ts`: los 3 duplicados nuevos mapean a ES; texto desconocido
      sigue cayendo al fallback seguro.

## Fase 1 — Parser de tiempo y labels (C2)

- [x] 1.1 `src/modules/checkups/format.ts`: `parseTimeToSeconds` exacto de C2 (acepta
      `m:ss.fff`, `mm:ss.fff`, `h:mm:ss.fff`; exige 3 dígitos de milisegundos) y mapas
      de etiquetas ES para `SwimmingStyle`/`CheckupCategory`/`Classification` con
      fallback al valor crudo si es desconocido (tolerancia a extensión, doc 06 §1).
- [x] 1.2 `format.test.ts`: casos válidos (`01:05.250`→65.25, `1:05.250`→65.25,
      `1:02:03.750`→3723.75, `0:12.000`→12) e inválidos (sin `.fff`, segundos ≥ 60,
      texto libre → `null`).

## Fase 2 — Pestaña de chequeos del atleta (C1, C3, C5)

- [x] 2.1 `athlete-checkups-page.tsx`: cabecera con enlace de vuelta a la ficha,
      filtros `checkups-filter-year` / `checkups-filter-month` (query params
      condicionales a `useAthleteCheckups`), tabla `checkups-list` (período mes/año,
      categoría con etiqueta ES, notas), skeleton, vacío con CTA si ADMIN/COACH,
      error con reintento. Botón `checkup-new-button` visible solo ADMIN/COACH.
- [x] 2.2 `checkup-form.tsx` (dialog de alta): validación local completa del contrato
      (año 1900–2100, mes 1–12, categoría enum, `athleteId` de la ruta en el body),
      detección local de duplicado contra la lista ya cargada; envío con enums en
      mayúsculas; 400 residual → mensaje global seguro (`toUserFacingMessage`); 409 →
      mensaje mapeado de C5. Se cierra e invalida la lista al crear.
- [x] 2.3 `projections-panel.tsx` (dentro de la pestaña): `useAthleteProjections`,
      badge por `classification` según la tabla de C6 (`classification-badge.tsx`),
      `timeFormatted` y `diffVsBronzeFormatted` tal cual, array sin desduplicar,
      409 → estado `projections-incomplete-state` con enlace a `/tabla-nacional` para
      ADMIN, vacío con su estado.
- [x] 2.4 `athlete-detail-page.tsx`: añadir enlace "Chequeos"
      (`athlete-checkups-link`) a `/athletes/:id/chequeos`; mantener el resto intacto.
- [x] 2.5 Tests: pagina con filtros (URL con/sin params), roles (USER no ve
      `checkup-new-button`), validación local del form (mes 13 bloqueado; año 1899
      bloqueado), duplicado 409 mapeado, panel de proyección (badges por
      classification, 409 referencia incompleta, array repetido sin desduplicar).

## Fase 3 — Detalle del chequeo: tiempos, comparación, borrado (C2, C4, C5)

- [x] 3.1 `checkup-detail-page.tsx`: cabecera con período/categoría/notas del chequeo,
      tabla `checkup-times-table` con `timeFormatted` tal cual, estado "sin tiempos",
      enlace de vuelta a la pestaña.
- [x] 3.2 `time-form.tsx` (ADMIN/COACH, dialog o sección): select de estilo con
      etiquetas ES, distancia entera ≥ 1, input `time-input` `mm:ss.fff` parseado con
      `parseTimeToSeconds`; prevalidación de `(style, distance)` duplicado contra
      `detail.times`; 409 residual mapeado; invalida el detalle al crear.
- [x] 3.3 `comparison-panel.tsx`: botón `comparison-button` (lazy), skeleton mientras
      carga, tabla por posición (oro/plata/bronce) con `referenceTimeFormatted`,
      `absoluteDiffFormatted` con signo y `relativeDiffPercent` tal cual; 409 →
      `comparison-incomplete-state` (con enlace a `/tabla-nacional` si ADMIN);
      error genérico con reintento.
- [x] 3.4 Borrado T5: botón `checkup-delete-button` (ADMIN/COACH) + `alert-dialog`
      con la copy explícita de C4 (`checkup-delete-confirm`); tras 204, navegar a la
      pestaña del atleta.
- [x] 3.5 Tests: URL/método de add-time con `timeSeconds` numérico (input `01:05.250`
      → `65.25`), input inválido bloqueado, duplicado local bloqueado, comparación
      lazy (no hay llamada hasta pulsar), 409 comparación → estado dedicado sin toast
      de error, borrado (cancelar/confirmar + navegación), roles (USER no ve
      time-form ni delete).

## Fase 4 — Matriz de tabla nacional (C7, C9)

- [x] 4.1 `national-reference-page.tsx` bajo `RequireRoles(["ADMIN"])`: agrupación en
      memoria por `${style}|${distance}|${category}` (orden estable style→distance→
      category), fila por combinación con 3 celdas `timeFormatted`, filtros
      client-side por estilo y categoría, skeleton/vacío/error, aviso de triple
      incompleto (`reference-incomplete-warning-{key}`) cuando < 3 posiciones.
- [x] 4.2 `reference-form.tsx` (dialog por celda o combinación nueva): en edición y en
      celda vacía de grupo existente, style/distance/category/position bloqueados y
      pre-cargados; solo se edita el tiempo (input `mm:ss.fff` →
      `parseTimeToSeconds`); alta de combinación nueva permite elegir los 5 campos;
      envío `POST` o `PUT` **completo** (5 campos); duplicado local + 409 mapeado.
- [x] 4.3 Borrado por celda con `alert-dialog` (`reference-delete-confirm`) →
      `DELETE` 204 + refresco.
- [x] 4.4 Tests: agrupación correcta y aviso de triple incompleto, orden estable,
      filtros por estilo/categoría sin nueva llamada, PUT completo con los 5 campos,
      duplicado bloqueado localmente, borrado con confirmación.

## Fase 5 — Rutas y navegación (C1)

- [x] 5.1 `src/app/router.tsx`: añadir `athletes/:id/chequeos` →
      `AthleteCheckupsPage`, `athletes/:id/chequeos/:checkupId` → `CheckupDetailPage`
      (ambas autenticadas), `tabla-nacional` → `NationalReferencePage` bajo
      `RequireRoles(["ADMIN"])`; eliminar la ruta `/checkups` y el import.
- [x] 5.2 `src/app/app-shell.tsx`: quitar `{ to: "/checkups", label: "Chequeos" }` de
      `NAV_ITEMS`; añadir `{ to: "/tabla-nacional", label: "Tabla nacional",
      roles: ["ADMIN"] }`. Borrar `src/modules/checkups/checkups-page.tsx` y su test
      si existiera.
- [x] 5.3 Actualizar `app-shell.test.tsx`: nav sin "Chequeos", "Tabla nacional" solo
      para ADMIN (roles COACH/USER no la ven).

## Fase 6 — Cierre

- [x] 6.1 `npm run test`, `npm run build` y `npm run design:check` en verde.
- [x] 6.2 Verificación visual con MCP playwright (`browser_snapshot` /
      `browser_evaluate`, nunca `browser_take_screenshot`): con el back local arriba
      (ver design.md §Verificación visual), login `admin.demo` — pestaña, alta de
      chequeo + tiempo, comparación (con tabla cargada y con combinación sin triple →
      estado dedicado), matriz con alta/edición/borrado; login `demo.user` — solo
      lectura, sin botones de escritura, `/tabla-nacional` directo → "sin permisos".
- [x] 6.3 Actualizar `AGENTS.md` (sección Estructura) con el módulo `checkups`.
- [x] 6.4 Anotar aquí cualquier desviación del diseño antes de pedir `/review`.

## Desviaciones

1. **Validación de contrato en el schema (`superRefine`), no solo en el handler.**
   `react-hook-form` + `zodResolver` no invoca el callback de `handleSubmit` si
   cualquier campo falla la validación base (p. ej. categoría sin seleccionar), así
   que una validación "solo en el handler" jamás marcaría año/mes en ese caso. Las
   reglas exactas del contrato (C5/C7) viven en las funciones puras exportadas
   (`validateCheckupLocally`, `validateTimeLocally`, `validateReferenceLocally`) y se
   conectan al schema vía `superRefine` — mismo patrón que `cycle-form` (orderIndex).
   Mensajes idénticos a los planeados; fuente única de verdad.
2. **Filtros de página con `<select>` nativo** (año/mes en la pestaña; estilo/categoría
   en la matriz). El diseño no fijaba el componente para los filtros de página; se
   mantienen los testids del C10 y el comportamiento server-side/client-side
   especificado. Los Selects Radix se usan en los dialogs como indica el diseño.
3. **Observación de entorno (no es desviación de código):** durante la verificación
   visual otra sesión concurrente mutaba el mismo backend local (creó los chequeos 81
   y 82, borró la referencia oro id 1 y la recargó como id 4). La UI reaccionó
   correctamente a esos cambios: la comparación pasó al estado dedicado
   "Referencia incompleta" en cuanto el triple quedó incompleto y se recuperó al
   recargarse. Indica que el backend local es compartido entre sesiones de prueba.
4. **Flakiness preexistente de la suite completa:** con 24 workers en paralelo, la
   interacción Radix (Select/Dialog) falla de forma intermitente también en módulos
   no tocados (athletes/training). Aislados y en ejecuciones completas consecutivas,
   los 206 tests pasan. No se introduce ningún cambio de configuración en este change.
