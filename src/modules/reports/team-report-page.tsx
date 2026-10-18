import { useState } from "react";

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
import type { TeamReportEntry } from "@/lib/api/types";
import { ClassificationBadge } from "@/modules/checkups/classification-badge";
import { categoryLabel, styleLabel } from "@/modules/checkups/format";
import { ReportsTabs } from "@/modules/reports/reports-tabs";
import { useTeamReport } from "@/modules/reports/reports-api";
import { EmptyState, ErrorState } from "@/shared/components/states";

/*
 * C4: reporte de equipo (`/reports/equipo`), solo lectura para cualquier
 * autenticado (ADMIN/COACH/USER ven lo mismo: el back es la autoridad de permisos).
 *
 * - Filtro de categoría SERVER-SIDE: "Todas" → sin `?category=` (misma query key que
 *   el dashboard, `staleTime` 5 min en el hook → una sola llamada compartida).
 * - Se renderiza TAL CUAL llega: el back ya agrega por `(style, distance, category)`.
 *   Lo único que hace el front es ORDENAR la tabla por `bestTimeSeconds` asc
 *   (presentación) y mostrar los strings que manda el servidor
 *   (`bestTimeFormatted`, `diffVsBronzeFormatted`, `classification`) sin recalcular
 *   ni formatear nada.
 *
 * El filtro reutiliza el `select` nativo con tokens del resto de barras de filtros
 * del proyecto (chequeos / tabla nacional): misma apariencia y comportamiento que
 * ya usan esos módulos, en vez de introducir un patrón distinto aquí.
 */

const CATEGORY_OPTIONS = ["INFANTIL", "JUVENIL", "MAYOR"] as const;

export function TeamReportPage() {
  const [categoryFilter, setCategoryFilter] = useState("");

  // "" = "Todas" → el hook no añade el query param (nunca filtrado en memoria).
  const category = categoryFilter === "" ? undefined : categoryFilter;
  const teamReportQuery = useTeamReport(category);

  return (
    <div className="grid gap-4" data-testid="team-report-page">
      <ReportsTabs />

      <header>
        <p className="text-heading text-strong font-semibold">Reporte de equipo</p>
        <p className="text-dim text-body">
          Ranking por prueba contra la tabla nacional, agrupado por estilo, distancia y categoría.
        </p>
      </header>

      <label className="grid w-fit gap-1">
        <span className="text-dim text-caption">Categoría</span>
        <select
          className="border-field-line bg-panel text-strong rounded-control h-9 border px-3 text-body"
          data-testid="team-report-filter-category"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="">Todas</option>
          {CATEGORY_OPTIONS.map((categoryValue) => (
            <option key={categoryValue} value={categoryValue}>
              {categoryLabel(categoryValue)}
            </option>
          ))}
        </select>
      </label>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Ranking por prueba</CardTitle>
          <CardDescription>
            Mejor marca de cada deportista, con la clasificación calculada por el servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {teamReportQuery.isPending ? (
            <div className="grid gap-3" data-testid="team-report-loading">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : teamReportQuery.isError ? (
            <div data-testid="team-report-error">
              <ErrorState
                title="No se pudo cargar el reporte de equipo"
                description="Inténtalo de nuevo en unos segundos."
              />
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void teamReportQuery.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            </div>
          ) : (teamReportQuery.data?.entries.length ?? 0) === 0 ? (
            <div data-testid="team-report-empty">
              <EmptyState
                title="Sin chequeos registrados"
                description="Cuando el equipo registre chequeos verás aquí el ranking por prueba."
              />
            </div>
          ) : (
            <div className="grid gap-6" data-testid="team-report-entries">
              {(teamReportQuery.data?.entries ?? []).map((entry) => (
                <TeamEntrySection key={`${entry.style}-${entry.distance}-${entry.category}`} entry={entry} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamEntrySection({ entry }: { entry: TeamReportEntry }) {
  // Orden por mejor tiempo ascendente (presentación de datos del servidor).
  const rankedAthletes = [...entry.athletes].sort((a, b) => a.bestTimeSeconds - b.bestTimeSeconds);

  return (
    <section className="grid gap-2" data-testid={`team-report-entry-${entry.style}-${entry.distance}-${entry.category}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-strong text-title font-semibold">
          {styleLabel(entry.style)} {entry.distance}m · {categoryLabel(entry.category)}
        </p>
        <p className="text-dim text-caption">
          {entry.athleteCount === 1 ? "1 deportista" : `${entry.athleteCount} deportistas`}
        </p>
      </header>

      {rankedAthletes.length === 0 ? (
        <p className="text-dim text-body">Esta prueba todavía no tiene deportistas registrados.</p>
      ) : (
        <div className="border-line overflow-hidden rounded-control border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deportista</TableHead>
                <TableHead>Mejor tiempo</TableHead>
                <TableHead>Clasificación</TableHead>
                <TableHead>Dif. vs bronce</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankedAthletes.map((athlete) => (
                <TableRow
                  key={athlete.athleteId}
                  data-testid={`team-report-athlete-${athlete.athleteId}`}
                >
                  <TableCell className="text-strong">{athlete.athleteFullName}</TableCell>
                  <TableCell>{athlete.bestTimeFormatted}</TableCell>
                  <TableCell>
                    <ClassificationBadge classification={athlete.classification} />
                  </TableCell>
                  <TableCell>{athlete.diffVsBronzeFormatted}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
