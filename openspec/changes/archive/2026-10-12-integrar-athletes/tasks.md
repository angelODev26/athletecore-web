# Tasks: integrar-athletes

> **Preconditions (NO saltarse):**
> 1. `npm install` al día en este repo.
> 2. Ramas: empezar desde `main` actualizado y crear `feature/integrar-athletes`
>    (el hook pre-commit rechaza commits directos a main).
> 3. Backend arriba para las verificaciones: `~/athletecore-api$ export $(grep -v '^#' .env | xargs) && ./mvnw spring-boot:run`
>    (perfil `local`, usuarios `demo.user`/`admin.demo` con `secret123`).
> 4. NO implementar nada de training/checkups/reports aquí.

## 1. Infra del módulo

- [x] 1.1 Instalar componentes shadcn **vía MCP shadcn** (no a mano): `table`, `badge`,
      `skeleton`, `textarea`, `checkbox`, `alert-dialog`. Si el CLI vuelve a crear un
      directorio literal `@/`, mover archivos a `src/components/ui/` y borrarlo (bug
      conocido). Verificación: existen los archivos y compilan al importarlos.
- [x] 1.2 Añadir los DTOs del módulo a `src/lib/api/types.ts` (shape EXACTO en
      `design.md` — `AthleteResponse`, `AthleteCreateRequest`, `AthleteUpdateRequest`,
      `AthleteProfileResponse`, `AthleteProfileUpsertRequest`, `SportResponse`,
      `AssignSportsRequest`).
- [x] 1.3 Crear `src/modules/athletes/athletes-api.ts` con los hooks exactos del
      `design.md` (sección "Hooks exactos"). Verificación: `queryKeyFactory` con
      `moduleQueryKey`, lista usa `toPageModel` + `placeholderData: keepPreviousData`,
      perfil tolera 404 → `null`, catálogo con `staleTime: Infinity`.

## 2. Páginas y rutas

- [x] 2.1 `athletes-list-page.tsx` (`/athletes`): tabla con username, fullName, email,
      avatar (foto o iniciales), paginador Anterior/Siguiente (10 por página), estados
      carga/vacío/error. `data-testid` según `design.md`.
- [x] 2.2 `athlete-detail-page.tsx` (`/athletes/:id`): ficha compuesta (4 queries),
      manejo de 404 de perfil = "sin perfil", de atleta = "no encontrado", botones de
      editar/eliminar/guardar deportes.
- [x] 2.3 `athlete-create-page.tsx` (`/athletes/nuevo`): wizard 3 pasos con estado local
      de paso; reutiliza `athlete-form.tsx` para el paso 1 y `athlete-profile-form.tsx`
      para el paso 3; se queda en `athlete-edit-page.tsx` nada (el paso 2 es solo
      birthDate + PUT). Incluir textos de abandono ("has creado el deportista; puedes
      completar su perfil desde la ficha").
- [x] 2.4 `athlete-edit-page.tsx` (`/athletes/:id/editar`): `athlete-form.tsx` prefijado,
      `username`/`email` deshabilitados con nota, `PUT` parcial solo con campos editables.
- [x] 2.5 `src/app/routes.tsx`: cambiar el placeholder `/athletes` por la lista y añadir
      las 3 rutas nuevas, todas dentro del guard de sesión (`RequireAuth`).

## 3. Tests unitarios (los escribe el implementador, jsdom ya configurado)

- [x] 3.1 Tests de `athletes-api.ts`: 404 de perfil → `null`; `toPageModel` se aplica a la
      lista; catálogo con `staleTime` infinito (verificar configuración de la query);
      `getDuplicateField` discrimina 409 de atleta (username vs email).
- [x] 3.2 Tests de wizard: paso 1 bloquea envío con validación client-side inválida; 409
      username/email caen en el campo correcto; abandono en paso 2 navega a la ficha.
- [x] 3.3 Tests de ficha: 404 de perfil muestra "Sin perfil registrado"; `bmi` null →
      "no disponible"; el selector de deportes deshabilita guardar con selección vacía.

## 4. Verificación obligatoria

- [x] 4.1 `npm run test` → todos verdes.
- [x] 4.2 `npm run build` → sin errores de tipos.
- [x] 4.3 `npm run design:check` → 0 violaciones.
- [x] 4.4 Dev server + MCP playwright (snapshot/evaluate; **NO screenshots**, límite de
      imágenes): login con `demo.user` → `/athletes` muestra la tabla, se crea un
      deportista nuevo con wizard completo (3 pasos), se edita (PUT), se asignan
      deportes, se borra con confirmación. Comprobar en DOM/network que la lista es
      server-side (query param `page` visible al navegar).
- [x] 4.5 Revisar que no se calculó BMI ni rachas en el front (grep por `bmi` en
      `src/modules/athletes/`: solo lectura/display).

## 5. Cierre

- [x] 5.1 Actualizar este archivo marcando los ítems realizados.
- [x] 5.2 Anotar cualquier desviación del `design.md` (y por qué).
- [x] 5.3 Commit/push/merge hecho por el humano en `main`; el change queda archivado tras el sync de specs.

## Desviaciones registradas (5.2)

1. **`src/app/routes.tsx` → `src/app/router.tsx`**: el nombre real del fichero de rutas en
   el repo es `router.tsx` (convención preexistente); las rutas nuevas viven ahí.
2. **"Terminar después" → "Omitir y terminar"**: la spec (escenario "Omitir paso 2 o 3")
   nombra explícitamente "Omitir y terminar"; se usó esa etiqueta en pasos 2 y 3 del wizard.
3. **`athlete-avatar.tsx`** es un fichero nuevo fuera de la lista de estructura del
   design.md: la lógica de avatar (A10) se necesita en lista y ficha, así que se extrajo
   para no duplicarla.
4. **`useUpsertAthleteProfile` invalida solo el perfil**: "invalida lista (no toca) y
   perfil" se interpretó como que la lista no necesita invalidación (no muestra datos de
   perfil) — se invalida la query de perfil.
5. **PUT de edición omite `birthDate`/`photoUrl` cuando quedan vacíos**: el PUT parcial
   ignora nulls (doc 04 §2), así que la API no permite borrar estos campos; omitirlos
   preserva el valor existente en lugar de enviar strings vacíos que el back rechazaría.
6. **`notes` se envía siempre** (incluso vacío) en el upsert de perfil para permitir
   limpiar notas; `armSpanCm` vacío se omite (mismas limitaciones del contrato).
7. **Ruido de consola tras DELETE**: al invalidar el detalle del atleta antes de
   desmontar la ficha, el refetch del detalle da 404 en consola (el back confirma el soft
   delete); no afecta a la UI porque la navegación ya ocurrió.
8. **Dependencias de testing añadidas** (aprobadas por el humano): `@testing-library/react`,
   `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`
   (eran necesarias para 3.2/3.3; jsdom ya estaba). Sin `globals: true` en Vitest, los
   tests llaman `afterEach(cleanup)` explícitamente.
9. **Verificación E2E (4.4)** hecha contra el dev server en `:5173` (el CORS del back solo
   permite 3000/5173); se sembraron 11 atletas vía fetch autenticado para probar el
   paginador (`page=0` → `page=1`, "Siguiente" deshabilitado en la última) y se
   soft-borraron al terminar para dejar la DB como estaba.
