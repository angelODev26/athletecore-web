import { Link } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type { MedalProjectionResponse } from "@/lib/api/types";
import { useSessionRoles } from "@/lib/auth/session-store";
import { isIncompleteReferenceError, useAthleteProjections } from "@/modules/checkups/checkups-api";
import { styleLabel } from "@/modules/checkups/format";
import { ClassificationBadge } from "@/modules/checkups/classification-badge";

/*
 * C6: panel "Proyección de medallería" (GET /athletes/{id}/projections). El array
 * se renderiza TAL CUAL — puede repetir (style, distance) entre chequeos distintos
 * (gana el código sobre el doc); sin desduplicar ni seleccionar "el último".
 * `timeFormatted` y `diffVsBronzeFormatted` llegan del servidor (nunca formatear).
 * El 409 por triple incompleto es un estado dedicado, no un error genérico.
 */

export function ProjectionsPanel({ athleteId }: { athleteId: number }) {
  const projectionsQuery = useAthleteProjections(athleteId);
  const userRoles = useSessionRoles();
  const isAdmin = hasAnyRole(userRoles, ["ADMIN"]);

  if (projectionsQuery.isPending) {
    return (
      <div className="grid gap-2" data-testid="projections-loading">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  if (projectionsQuery.isError) {
    if (isIncompleteReferenceError(projectionsQuery.error)) {
      return (
        <IncompleteReferenceState testId="projections-incomplete-state" isAdmin={isAdmin} />
      );
    }
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-6 text-center"
        data-testid="projections-error"
        role="alert"
      >
        <div>
          <p className="text-strong text-body font-medium">No se pudo cargar la proyección</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void projectionsQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const projections = projectionsQuery.data ?? [];

  if (projections.length === 0) {
    return (
      <p className="text-dim text-body" data-testid="projections-empty">
        Sin proyección todavía: registra chequeos con tiempos de prueba.
      </p>
    );
  }

  return (
    <div className="border-line overflow-hidden rounded-control border" data-testid="projections-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prueba</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Tiempo</TableHead>
            <TableHead>Clasificación</TableHead>
            <TableHead>vs bronce</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projections.map((projection: MedalProjectionResponse, index) => (
            <TableRow key={`${projection.style}-${projection.distance}-${projection.timeFormatted}-${index}`}>
              <TableCell className="text-body">
                {styleLabel(projection.style)} {projection.distance}m
              </TableCell>
              <TableCell className="text-dim text-body">{projection.category}</TableCell>
              <TableCell className="text-body">{projection.timeFormatted}</TableCell>
              <TableCell>
                <span data-testid={`projection-badge-${index}`}>
                  <ClassificationBadge classification={projection.classification} />
                </span>
              </TableCell>
              <TableCell className="text-body">{projection.diffVsBronzeFormatted}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** C5: estado dedicado "Referencia incompleta" — no un toast de error. */
export function IncompleteReferenceState({ testId, isAdmin }: { testId: string; isAdmin: boolean }) {
  return (
    <Alert data-testid={testId}>
      <AlertTitle>Referencia incompleta</AlertTitle>
      <AlertDescription>
        No existe el triple completo de la tabla nacional para alguna prueba (faltan las 3
        posiciones del podio), así que la comparación no puede calcularse.
        {isAdmin ? (
          <Button asChild variant="outline" className="mt-3">
            <Link to="/tabla-nacional">Ir a la tabla nacional</Link>
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
