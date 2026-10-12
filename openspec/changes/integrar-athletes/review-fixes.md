# Correcciones de la revisión `/review` — integrar-athletes

> Encargo para el modelo implementador. Revisión de solo lectura completada; veredicto
> "corregir antes de continuar". **Aplicar TODO lo siguiente sin deuda** (como se hizo en
> `integrar-autenticacion`). Solo se tocan los archivos indicados. Al terminar:
> `npm run test`, `npm run build`, `npm run design:check` en verde y marcar los ítems.

## C1. BLOCKER — rol de token `border-field-line` en elementos que no son campos

DESIGN.md reserva `border.input` (`border-field-line`) a bordes de input/select/textarea.
Está aplicado a elementos de solo lectura o contenedores:

- `src/modules/athletes/athlete-detail-page.tsx:424` — `<li>` de deportes asignados:
  cambiar `border-field-line` → `border-line`.
- `src/modules/athletes/athlete-sports-form.tsx:75` — wrapper de checkbox+label:
  cambiar `border-field-line` → `border-line` (el borde de campo vive en el input, no en
  el contenedor de la fila).

Verificación: `grep -rn "border-field-line" src/` → solo debe quedar en inputs reales
(componentes `Input`/`Textarea`/`Select` y wrappers legítimos de campo), y
`npm run design:check` sigue en 0 violaciones.

## C2. Cobertura de tests pendiente del spec (spec de `gestion-deportistas`)

Añadir tests (Vitest + Testing Library, convención del módulo). Ninguno de estos
escenarios tiene hoy test que lo ejercite:

- [x] **Lista (`athletes-list-page.test.tsx`, nuevo):**
  - "Navegar de página": pulsar Siguiente pide `page=1` al mock y actualiza la tabla.
  - "Límites del paginador": con `first` → Anterior deshabilitado; con `last` → Siguiente
    deshabilitado; se muestra el total de elementos.
  - "Lista vacía": `content: []` muestra el estado vacío con CTA al alta
    (`athletes-empty` + enlace).
  - "Acceso al detalle": pulsar una fila navega a `/athletes/:id`.
- [x] **Alta, paso 3:** envío del perfil llama a `POST /{id}/profile` y navega a la ficha;
  "Omitir y terminar" navega sin llamar al back.
- [x] **Edición (A5):** el `PUT` enviado al mock NO contiene `username` ni `email`
  aunque estén en pantalla (assert directo sobre el body de la request).
- [x] **Borrado:** "Eliminar" abre el `AlertDialog`; cancelar no llama al back; confirmar
  llama a `DELETE` y navega a `/athletes`.

## C3. Componentes definidos dentro del render

`src/modules/athletes/athlete-detail-page.tsx:351` (`ProfileReadView`) y `:404`
(`SportsReadView`) se declaran dentro de `AthleteDetailPage` → cambian de identidad en
cada render y React los remonta. Extraer ambos a nivel de módulo del mismo archivo
(props tipadas arriba del componente). Sin cambios de comportamiento.

## C4. Avatar: reset del estado de error al cambiar la foto

`src/modules/athletes/athlete-avatar.tsx:15`: cuando `photoUrl` cambia (tras una edición),
`imageFailed` sigue en `true` y la imagen nueva nunca se intenta. Añadir
`useEffect(() => setImageFailed(false), [photoUrl])`. Testear si es trivial incluirlo.

## C5. Limpieza de clase autorreferente

`src/modules/athletes/athlete-detail-page.tsx:169`: `className="border-b [.border-b]:pb-4"`
es equivalente a `pb-4` (siempre lleva `border-b`). Sustituir por `border-b pb-4`.

## Cierre

- [x] `review-fixes` completado con los checks en verde y commit/push/merge lo decide el
      humano (rama `feature/integrar-athletes` ya existe; trabajar sobre ella).
- [x] Anotar abajo cualquier desviación y actualizar `tasks.md` marcando las tareas
      completadas si procede.

## Resultado de la verificación

- `npm run test` → 11 ficheros, **61 tests** en verde (eran 49; +12 de esta revisión).
- `npm run build` → sin errores de tipos.
- `npm run design:check` → 0 violaciones.
- Verificación C1: `grep -rn "border-field-line" src/` → **0 resultados** (los inputs del
  registry shadcn usan `border-input`, así que no queda ninguna ocurrencia en el repo).

## Desviaciones registradas

1. **C3, firma de `ProfileReadView`**: al extraerlo a nivel de módulo recibe `profile`
   como prop (antes leía `profileQuery.data` dentro del cierre) y la prop se renombra a
   `onEdit` (antes `onCompleteProfile`). Sin cambios de comportamiento.
2. **C4, test incluido** (era trivial): `athlete-avatar.test.tsx` cubre el reset del
   estado de error al cambiar la URL y el caso sin foto (iniciales, sin `<img>` vacío).
3. **C2, test de borrado**: el texto del diálogo se aserta con regex (`/no se puede
   deshacer/i`) porque la frase va dentro de un párrafo más largo con el nombre del
   deportista.
4. **`tasks.md`**: sin cambios — las 19 tareas originales ya estaban marcadas; estas
   correcciones son parte del ciclo de revisión, no tareas nuevas del plan.
