import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MedalProjectionResponse } from "@/lib/api/types";
import { ClassificationBadge } from "@/modules/checkups/classification-badge";
import { styleLabel } from "@/modules/checkups/format";

/*
 * C2/C11: proyecciones de medallería del dashboard del atleta.
 *
 * `projections` llega embebido en `GET /athletes/{id}/report` (una sola llamada):
 * el array se renderiza TAL CUAL — puede repetir `(style, distance)` en categorías
 * distintas; sin desduplicar ni elegir "la última". `timeFormatted`,
 * `classification` y `diffVsBronzeFormatted` son del servidor (nunca se recalculan),
 * y el badge se REUTILIZA de chequeos (`ClassificationBadge`).
 */

export function ReportProjections({ projections }: { projections: MedalProjectionResponse[] }) {
  if (projections.length === 0) {
    return (
      <p className="text-dim text-body" data-testid="report-projections-empty">
        Sin proyección todavía: registra chequeos con tiempos de prueba.
      </p>
    );
  }

  return (
    <div className="contents" data-testid="report-projections">
      <div className="border-line overflow-hidden rounded-control border">
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
            {projections.map((projection, index) => (
              <TableRow
                key={`${projection.style}-${projection.distance}-${projection.timeFormatted}-${index}`}
              >
                <TableCell className="text-body">
                  {styleLabel(projection.style)} {projection.distance}m
                </TableCell>
                <TableCell className="text-dim text-body">{projection.category}</TableCell>
                <TableCell className="text-body">{projection.timeFormatted}</TableCell>
                <TableCell>
                  <span data-testid={`report-projection-badge-${index}`}>
                    <ClassificationBadge classification={projection.classification} />
                  </span>
                </TableCell>
                <TableCell className="text-body">{projection.diffVsBronzeFormatted}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
