import { useMemo, useState } from "react";

import { isApiError, toUserFacingMessage } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NationalReferenceTimeListItemResponse } from "@/lib/api/types";
import {
  categoryLabel,
  styleLabel,
  TIME_POSITION,
} from "@/modules/checkups/format";
import {
  useDeleteReferenceTime,
  useNationalReferenceTimes,
} from "@/modules/checkups/checkups-api";
import { ReferenceFormDialog, type ReferenceFormMode } from "@/modules/checkups/reference-form";

/*
 * C9: matriz de administración de la tabla nacional (solo ADMIN, ruta con
 * RequireRoles). La lista plana del back se agrupa EN MEMORIA por
 * `${style}|${distance}|${category}` con orden estable style→distance→category;
 * cada fila muestra las 3 celdas del podio (`timeFormatted` tal cual). Un grupo
 * con < 3 posiciones se marca con aviso: la comparación fallará (409). Filtros
 * en cliente por estilo y categoría (sin nueva llamada).
 */

interface ReferenceGroup {
  key: string;
  style: string;
  distance: number;
  category: string;
  /** Por posición 1..3 → referencia (hueco si falta). */
  cells: (NationalReferenceTimeListItemResponse | null)[];
  complete: boolean;
}

const STYLE_FILTER_VALUES = ["LIBRE", "ESPALDA", "BRAZA", "MARIPOSA", "COMBINADO"] as const;
const CATEGORY_FILTER_VALUES = ["INFANTIL", "JUVENIL", "MAYOR"] as const;

/** Agrupación en memoria con orden estable (C9). */
export function groupReferences(
  references: NationalReferenceTimeListItemResponse[],
): ReferenceGroup[] {
  const groups = new Map<string, ReferenceGroup>();

  for (const reference of references) {
    const key = `${reference.style}|${reference.distance}|${reference.category}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        style: reference.style,
        distance: reference.distance,
        category: reference.category,
        cells: [null, null, null],
        complete: false,
      };
      groups.set(key, group);
    }
    if (reference.position >= 1 && reference.position <= 3) {
      group.cells[reference.position - 1] = reference;
    }
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.complete = group.cells.every((cell) => cell !== null);
  }

  // Orden estable: style → distance → category (alfabético por valor crudo del enum).
  result.sort(
    (a, b) =>
      a.style.localeCompare(b.style) ||
      a.distance - b.distance ||
      a.category.localeCompare(b.category),
  );

  return result;
}

export function NationalReferencePage() {
  const referencesQuery = useNationalReferenceTimes();

  const [styleFilter, setStyleFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [formMode, setFormMode] = useState<ReferenceFormMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NationalReferenceTimeListItemResponse | null>(null);

  const deleteReference = useDeleteReferenceTime(deleteTarget?.id ?? 0);

  const references = referencesQuery.data ?? [];

  const filtered = useMemo(() => {
    return references.filter(
      (reference) =>
        (styleFilter === "" || reference.style === styleFilter) &&
        (categoryFilter === "" || reference.category === categoryFilter),
    );
  }, [references, styleFilter, categoryFilter]);

  const groups = useMemo(() => groupReferences(filtered), [filtered]);

  return (
    <div className="grid gap-4" data-testid="reference-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-heading text-strong font-semibold">Tabla nacional</p>
          <p className="text-dim text-body">
            Tiempos de referencia del podio por estilo, distancia y categoría.
          </p>
        </div>
        <Button
          type="button"
          data-testid="reference-new-button"
          onClick={() => setFormMode({ kind: "new-combination" })}
        >
          Nueva referencia
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3" data-testid="reference-filters">
        <FilterSelect
          label="Estilo"
          testid="reference-filter-style"
          value={styleFilter}
          onChange={setStyleFilter}
          placeholder="Todos los estilos"
          options={STYLE_FILTER_VALUES.map((style) => ({
            value: style,
            label: styleLabel(style),
          }))}
        />
        <FilterSelect
          label="Categoría"
          testid="reference-filter-category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          placeholder="Todas las categorías"
          options={CATEGORY_FILTER_VALUES.map((category) => ({
            value: category,
            label: categoryLabel(category),
          }))}
        />
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Matriz de referencias</CardTitle>
          <CardDescription>
            Cada fila es una combinación con las 3 posiciones del podio. Si falta alguna, la
            comparación de ese estilo/distancia/categoría fallará.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <MatrixBody
            query={referencesQuery}
            groups={groups}
            onNewCell={(group, position) =>
              setFormMode({
                kind: "new-cell",
                style: group.style,
                distance: group.distance,
                category: group.category,
                position,
              })
            }
            onEdit={(reference) => setFormMode({ kind: "edit", reference })}
            onDelete={(reference) => setDeleteTarget(reference)}
          />
        </CardContent>
      </Card>

      {formMode ? (
        <ReferenceFormDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setFormMode(null);
            }
          }}
          mode={formMode}
          existing={references}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!deleteReference.isPending && !open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent data-testid="reference-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta referencia?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Se dará de baja la posición ${TIME_POSITION[deleteTarget.position] ?? deleteTarget.position} de ${styleLabel(deleteTarget.style)} ${deleteTarget.distance}m (${categoryLabel(deleteTarget.category)}). Si el triple queda incompleto, la comparación de esa combinación fallará.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteReference.error ? (
            <Alert variant="destructive" role="alert" data-testid="reference-delete-error">
              <AlertTitle>No se pudo borrar</AlertTitle>
              <AlertDescription>
                {isApiError(deleteReference.error)
                  ? toUserFacingMessage(deleteReference.error)
                  : "Inténtalo de nuevo en unos segundos."}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="reference-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="reference-delete-action"
              onClick={(event) => {
                // Evitar el cierre automático: el diálogo se cierra al 204.
                event.preventDefault();
                deleteReference.mutate(undefined, {
                  onSuccess: () => setDeleteTarget(null),
                  onError: (error) => {
                    // Soft delete ya aplicado en otro lado: cerrar igualmente.
                    if (isApiError(error) && error.status === 404) {
                      setDeleteTarget(null);
                    }
                  },
                });
              }}
            >
              {deleteReference.isPending ? "Borrando…" : "Borrar referencia"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MatrixBody({
  query,
  groups,
  onNewCell,
  onEdit,
  onDelete,
}: {
  query: ReturnType<typeof useNationalReferenceTimes>;
  groups: ReferenceGroup[];
  onNewCell: (group: ReferenceGroup, position: number) => void;
  onEdit: (reference: NationalReferenceTimeListItemResponse) => void;
  onDelete: (reference: NationalReferenceTimeListItemResponse) => void;
}) {
  if (query.isPending) {
    return (
      <div className="grid gap-2" data-testid="reference-loading">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-6 text-center"
        data-testid="reference-error"
        role="alert"
      >
        <div>
          <p className="text-strong text-body font-medium">No se pudo cargar la tabla nacional</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border border-dashed p-8 text-center"
        data-testid="reference-empty"
      >
        <div>
          <p className="text-strong text-body font-medium">Sin referencias</p>
          <p className="text-dim mt-1 text-body">
            Crea las 3 posiciones (oro, plata y bronce) de cada combinación para que la
            comparación funcione.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-line overflow-hidden rounded-control border" data-testid="reference-matrix">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Estilo</TableHead>
            <TableHead>Distancia</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Oro</TableHead>
            <TableHead>Plata</TableHead>
            <TableHead>Bronce</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.key} data-testid={`reference-row-${group.key}`}>
              <TableCell className="text-body">{styleLabel(group.style)}</TableCell>
              <TableCell className="text-body">{group.distance}m</TableCell>
              <TableCell className="text-body">{categoryLabel(group.category)}</TableCell>
              {[1, 2, 3].map((position) => {
                const cell = group.cells[position - 1];
                return (
                  <TableCell key={position}>
                    {cell ? (
                      <div className="flex items-center gap-1">
                        <span className="text-body" data-testid={`reference-cell-${group.key}-${position}`}>
                          {cell.timeFormatted}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 px-2 text-caption"
                          data-testid={`reference-edit-${group.key}-${position}`}
                          onClick={() => onEdit(cell)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-danger h-7 px-2 text-caption"
                          data-testid={`reference-delete-${group.key}-${position}`}
                          onClick={() => onDelete(cell)}
                        >
                          Borrar
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-caption"
                        data-testid={`reference-fill-${group.key}-${position}`}
                        onClick={() => onNewCell(group, position)}
                      >
                        {TIME_POSITION[position]} vacante
                      </Button>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {groups
        .filter((group) => !group.complete)
        .map((group) => (
          <p
            key={`${group.key}-warning`}
            className="text-warning mt-2 px-2 text-caption"
            data-testid={`reference-incomplete-warning-${group.key}`}
            role="status"
          >
            Triple incompleto: la comparación de este estilo/distancia/categoría fallará
            (falta {missingPositionsLabel(group)}).
          </p>
        ))}
    </div>
  );
}

function missingPositionsLabel(group: ReferenceGroup): string {
  const missing = group.cells
    .map((cell, index) => (cell === null ? TIME_POSITION[index + 1] : null))
    .filter(Boolean);
  return missing.join(" y ");
}

function FilterSelect({
  label,
  testid,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-dim text-caption">{label}</span>
      <select
        className="border-field-line bg-panel text-strong rounded-control h-9 border px-3 text-body"
        data-testid={testid}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
