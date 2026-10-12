import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { SportResponse } from "@/lib/api/types";

/*
 * Selector de deportes con semántica de REEMPLAZO TOTAL (doc 04 §4 / design A7):
 * al guardar se envía siempre el set final completo (1–10). Un set vacío da 400,
 * así que "Guardar" se deshabilita fuera del rango.
 */

const MIN_SPORTS = 1;
const MAX_SPORTS = 10;

interface AthleteSportsFormProps {
  catalog: SportResponse[];
  assignedIds: number[];
  pending?: boolean;
  serverError?: string | null;
  onSave: (sportIds: number[]) => void;
  onCancel?: () => void;
}

export function AthleteSportsForm({ catalog, assignedIds, pending = false, serverError, onSave, onCancel }: AthleteSportsFormProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(assignedIds));

  // La asignación llega de forma asíncrona: sincronizar cuando cambie (clave
  // estable para no recrear el estado en cada render del padre).
  const assignedKey = assignedIds.join(",");
  useEffect(() => {
    const ids = assignedKey === "" ? [] : assignedKey.split(",").map(Number);
    setSelected(new Set(ids));
  }, [assignedKey]);

  const toggle = (sportId: number, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(sportId);
      } else {
        next.delete(sportId);
      }
      return next;
    });
  };

  const count = selected.size;
  const outOfRange = count < MIN_SPORTS || count > MAX_SPORTS;

  const handleSave = () => {
    if (outOfRange) {
      return;
    }
    onSave([...selected]);
  };

  return (
    <div className="grid gap-4" data-testid="athlete-sports-form">
      {serverError ? (
        <Alert variant="destructive" role="alert" data-testid="athlete-sports-error">
          <AlertTitle>No se pudo guardar la asignación</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-dim text-caption">
        Guardar reemplaza todos los deportes asignados del deportista. Selecciona entre {MIN_SPORTS} y {MAX_SPORTS}.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {catalog.map((sport) => {
          const checkboxId = `athlete-sport-${sport.id}`;
          return (
            <div key={sport.id} className="border-line flex items-center gap-2 rounded-control border p-2">
              <Checkbox
                id={checkboxId}
                checked={selected.has(sport.id)}
                onCheckedChange={(checked) => toggle(sport.id, checked === true)}
                disabled={pending}
                data-testid={`athlete-sports-toggle-${sport.id}`}
              />
              <Label htmlFor={checkboxId} className="text-body font-normal">
                {sport.name}
              </Label>
            </div>
          );
        })}
        {catalog.length === 0 ? (
          <p className="text-dim text-body" data-testid="athlete-sports-empty-catalog">
            No hay deportes en el catálogo.
          </p>
        ) : null}
      </div>
      <p className="text-dim text-caption" data-testid="athlete-sports-count">
        Seleccionados: {count} de {MAX_SPORTS}
      </p>
      {outOfRange ? (
        <p className="text-danger text-caption" role="alert" data-testid="athlete-sports-range-error">
          Debe haber entre {MIN_SPORTS} y {MAX_SPORTS} deportes seleccionados.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={pending || outOfRange} data-testid="athlete-sports-save">
          {pending ? "Guardando…" : "Guardar deportes"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel} data-testid="athlete-sports-cancel">
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
