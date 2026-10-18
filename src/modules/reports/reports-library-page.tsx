import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
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
import type { ReportStatus, ReportType } from "@/lib/api/types";
import { hasAnyRole } from "@/lib/auth/jwt";
import { useSessionRoles } from "@/lib/auth/session-store";
import {
  REPORT_TYPE_LABELS,
  reportPeriodLabel,
  reportTargetLabel,
} from "@/modules/reports/format";
import { ReportFormDialog } from "@/modules/reports/report-form";
import { ReportStatusBadge } from "@/modules/reports/report-status-badge";
import { ReportsTabs } from "@/modules/reports/reports-tabs";
import { useReports } from "@/modules/reports/reports-api";
import type { ReportsFilters } from "@/modules/reports/reports-api";
import {
  allAthletesKey,
  fetchAllAthletes,
  paginateClientSide,
} from "@/modules/training/training-api";
import { formatInstantDate } from "@/shared/format/dates";
import { ErrorState } from "@/shared/components/states";

/*
 * C5: biblioteca de PDFs (`/reports`), la cara de "artefactos persistidos" del
 * módulo (frente a los dashboards JSON).
 *
 * - Filtros SERVER-SIDE condicionales (`?type=&athleteId=&status=`): un filtro vacío
 *   NO añade el parámetro — el filtro real vive en el back (en memoria, doc 07 §3),
 *   así que la UI nunca filtra el array en cliente.
 * - `GET /reports` NO paga en el back (D2/T9): la lista se pagina en CLIENTE con el
 *   adapter de `training-api` (pageSize 10). Pasar de página NO vuelve a llamar al back.
 * - Escrituras (generar) solo ADMIN/COACH (C9). El back es la autoridad: un 403 cae en
 *   el estado "sin permisos" del shell.
 *
 * El NOMBRE del deportista no viene en `ReportResponse` (solo `athleteId`): se resuelve
 * contra el listado de deportistas (`fetchAllAthletes`, la misma query que usa la
 * planilla de pase de lista — `allAthletesKey`), y si no está se muestra `Atleta #id`
 * como dato técnico (precedente D4). El detalle del reporte no repite esta llamada:
 * ahí se muestra el id con el mismo helper.
 */

/** Cap visual de la biblioteca (el listado llega completo de una vez). */
export const REPORTS_PAGE_SIZE = 10;

const TYPE_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "INDIVIDUAL", label: REPORT_TYPE_LABELS.INDIVIDUAL },
  { value: "GENERAL", label: REPORT_TYPE_LABELS.GENERAL },
];

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "PENDING", label: "Pendiente" },
  { value: "GENERATED", label: "Generado" },
  { value: "FAILED", label: "Fallido" },
];

export function ReportsLibraryPage() {
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [athleteFilter, setAthleteFilter] = useState("");
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);

  const userRoles = useSessionRoles();
  const canManage = hasAnyRole(userRoles, ["ADMIN", "COACH"]);

  // Objeto estable (identidad por render): la query key no cambia si los filtros no cambian.
  const filters: ReportsFilters = useMemo(
    () => ({
      ...(typeFilter === "" ? {} : { type: typeFilter as ReportType }),
      ...(statusFilter === "" ? {} : { status: statusFilter as ReportStatus }),
      ...(athleteFilter === "" ? {} : { athleteId: Number(athleteFilter) }),
    }),
    [typeFilter, statusFilter, athleteFilter],
  );

  const reportsQuery = useReports(filters);
  const athletesQuery = useQuery({ queryKey: allAthletesKey, queryFn: fetchAllAthletes });

  const athletes = athletesQuery.data ?? [];
  const athleteNames = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete.fullName])),
    [athletes],
  );

  const reports = reportsQuery.data ?? [];
  const pageModel = paginateClientSide(reports, page, REPORTS_PAGE_SIZE);
  const totalPages = Math.ceil(pageModel.totalItems / REPORTS_PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  // La columna "Período" solo existe si algún reporte trae year/month (C5).
  const hasPeriodColumn = reports.some((report) => reportPeriodLabel(report) !== null);

  // Cambiar un filtro invalida la página actual (si no, se vería una página vacía).
  const changeFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
  };

  return (
    <div className="grid gap-4" data-testid="reports-library-page">
      <ReportsTabs />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-heading text-strong font-semibold">Biblioteca de reportes</p>
          <p className="text-dim text-body">
            Reportes generados en PDF, con su estado de generación y descarga.
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={() => setFormOpen(true)} data-testid="report-new-button">
            Generar reporte
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-end gap-3" data-testid="reports-filters">
        <FilterSelect
          label="Tipo"
          testid="reports-filter-type"
          value={typeFilter}
          onChange={changeFilter(setTypeFilter)}
          options={TYPE_FILTER_OPTIONS}
        />
        <FilterSelect
          label="Estado"
          testid="reports-filter-status"
          value={statusFilter}
          onChange={changeFilter(setStatusFilter)}
          options={STATUS_FILTER_OPTIONS}
        />
        <FilterSelect
          label="Deportista"
          testid="reports-filter-athlete"
          value={athleteFilter}
          onChange={changeFilter(setAthleteFilter)}
          placeholder="Todos los deportistas"
          options={athletes.map((athlete) => ({
            value: String(athlete.id),
            label: athlete.fullName,
          }))}
        />
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Reportes generados</CardTitle>
          <CardDescription>
            El filtrado lo hace el servidor; la paginación es local sobre el listado completo.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {reportsQuery.isPending ? (
            <div className="grid gap-3" data-testid="reports-library-loading">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : reportsQuery.isError ? (
            <div data-testid="reports-library-error">
              <ErrorState
                title="No se pudo cargar la biblioteca"
                description="Inténtalo de nuevo en unos segundos."
              />
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void reportsQuery.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            </div>
          ) : reports.length === 0 ? (
            <div
              className="border-line bg-panel rounded-card grid place-items-center border border-dashed p-10 text-center"
              data-testid="reports-library-empty"
            >
              <div>
                <p className="text-strong text-title font-semibold">Sin reportes</p>
                <p className="text-dim mt-1 text-body">
                  {canManage
                    ? "Genera el primer reporte para verlo aquí."
                    : "Cuando el staff genere un reporte aparecerá aquí."}
                </p>
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => setFormOpen(true)}
                    data-testid="report-new-empty"
                  >
                    Generar reporte
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="border-line overflow-hidden rounded-control border">
              <Table data-testid="reports-list">
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Objetivo</TableHead>
                    {hasPeriodColumn ? <TableHead>Período</TableHead> : null}
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead aria-label="Acciones" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageModel.items.map((report) => (
                    <TableRow key={report.id} data-testid={`report-row-${report.id}`}>
                      <TableCell className="text-strong text-body font-medium">
                        {report.title}
                      </TableCell>
                      <TableCell>
                        {/*
                         * Badge neutro (outline): el color del acento queda para el
                         * badge de estado; el tipo no compite con él (DESIGN.md §3).
                         */}
                        <Badge variant="outline">
                          {REPORT_TYPE_LABELS[report.reportType] ?? report.reportType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-body">
                        {reportTargetLabel(report, athleteNames)}
                      </TableCell>
                      {hasPeriodColumn ? (
                        <TableCell className="text-body">
                          {reportPeriodLabel(report) ?? "—"}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <ReportStatusBadge status={report.status} />
                      </TableCell>
                      <TableCell className="text-dim text-body">
                        {formatInstantDate(report.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" data-testid={`report-open-${report.id}`}>
                          <Link to={`/reports/${report.id}`}>Ver</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {reports.length > 0 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Paginación de reportes">
          <p className="text-dim text-caption">
            Página {page + 1} de {Math.max(totalPages, 1)} · {pageModel.totalItems} reporte
            {pageModel.totalItems === 1 ? "" : "s"} en total
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!hasPrev}
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              data-testid="reports-pagination-prev"
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasNext}
              onClick={() => setPage((current) => current + 1)}
              data-testid="reports-pagination-next"
            >
              Siguiente
            </Button>
          </div>
        </nav>
      ) : null}

      <ReportFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

/*
 * Filtro de la barra de la biblioteca: `select` nativo con los tokens del proyecto
 * (mismo patrón que las barras de filtros de chequeos y del reporte de equipo).
 */
function FilterSelect({
  label,
  testid,
  value,
  onChange,
  options,
  placeholder = "Todos",
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterOption[];
  placeholder?: string;
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
        {options
          .filter((option) => option.value !== "")
          .map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </select>
    </label>
  );
}
