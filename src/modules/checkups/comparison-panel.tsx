import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasAnyRole } from "@/lib/auth/jwt";
import type { TimeComparisonResponse } from "@/lib/api/types";
import { useSessionRoles } from "@/lib/auth/session-store";
import { isIncompleteReferenceError, useCheckupComparison } from "@/modules/checkups/checkups-api";
import { styleLabel } from "@/modules/checkups/format";
import { IncompleteReferenceState } from "@/modules/checkups/projections-panel";

/*
 * C8 (lazy): la comparación (GET /checkups/{id}/comparison) NO se dispara al
 * entrar al detalle — solo cuando el usuario pulsa "Comparar con referencia".
 * `retry: false`: el 409 "triple incompleto" es un estado de datos. Los valores
 * (`referenceTimeFormatted`, `absoluteDiffFormatted` con signo, `relativeDiffPercent`)
 * se muestran tal cual del servidor.
 */

const POSITION_LABELS: Record<number, string> = {
  1: "Oro",
  2: "Plata",
  3: "Bronce",
};

function positionLabel(position: number): string {
  return POSITION_LABELS[position] ?? `Posición ${position}`;
}

export function ComparisonPanel({ checkupId }: { checkupId: number }) {
  const [enabled, setEnabled] = useState(false);
  const comparisonQuery = useCheckupComparison(checkupId, enabled);
  const userRoles = useSessionRoles();
  const isAdmin = hasAnyRole(userRoles, ["ADMIN"]);

  // Lectura abierta del contrato: cualquier autenticado puede comparar (C3).
  if (!enabled) {
    return (
      <div className="grid gap-3" data-testid="comparison-idle">
        <p className="text-dim text-body">
          Compara los tiempos de este chequeo contra las referencias de la tabla nacional.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          data-testid="comparison-button"
          onClick={() => setEnabled(true)}
        >
          Comparar con referencia
        </Button>
      </div>
    );
  }

  if (comparisonQuery.isPending) {
    return (
      <div className="grid gap-2" data-testid="comparison-loading">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  if (comparisonQuery.isError) {
    if (isIncompleteReferenceError(comparisonQuery.error)) {
      return <IncompleteReferenceState testId="comparison-incomplete-state" isAdmin={isAdmin} />;
    }
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-6 text-center"
        data-testid="comparison-error"
        role="alert"
      >
        <div>
          <p className="text-strong text-body font-medium">No se pudo calcular la comparación</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void comparisonQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const comparisons = comparisonQuery.data ?? [];

  if (comparisons.length === 0) {
    return (
      <p className="text-dim text-body" data-testid="comparison-empty">
        Sin tiempos registrados en este chequeo para comparar.
      </p>
    );
  }

  return (
    <div className="grid gap-4" data-testid="comparison-panel">
      {comparisons.map((comparison: TimeComparisonResponse, index) => (
        <div key={`${comparison.style}-${comparison.distance}-${index}`} className="grid gap-2">
          <p className="text-body font-medium">
            {styleLabel(comparison.style)} {comparison.distance}m ·{" "}
            <span className="text-dim">
              prueba {comparison.trialTimeFormatted} (categoría {comparison.category})
            </span>
          </p>
          <div className="border-line overflow-hidden rounded-control border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Posición</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Diferencia</TableHead>
                  <TableHead>Relativa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.positions.map((position) => (
                  <TableRow key={position.position}>
                    <TableCell className="text-body">{positionLabel(position.position)}</TableCell>
                    <TableCell className="text-body">{position.referenceTimeFormatted}</TableCell>
                    <TableCell className="text-body">{position.absoluteDiffFormatted}</TableCell>
                    <TableCell className="text-dim text-body">
                      {position.relativeDiffPercent}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-dim text-caption">
            Signo de la diferencia: negativo = la prueba es más rápida que la referencia.
          </p>
        </div>
      ))}
    </div>
  );
}
