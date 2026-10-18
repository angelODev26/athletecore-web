import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";

import { isApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/shared/components/states";
import { AttendanceCard } from "@/modules/reports/attendance-card";
import { ReportProjections } from "@/modules/reports/report-projections";
import { useAthleteReport } from "@/modules/reports/reports-api";

/*
 * C1/C2: dashboard del atleta (`/athletes/:id/report`), sub-ruta de la ficha.
 *
 * UNA sola llamada (`GET /athletes/{id}/report`) consolida evolución de tiempos,
 * asistencia y proyecciones. Es solo lectura: cualquier autenticado la ve, sin
 * acciones de escritura (el back es la autoridad de permisos).
 *
 * El id de la URL puede no ser numérico → se deshabilita la query (nunca
 * `/athletes/0/report`) y se muestra el estado "no encontrado".
 *
 * Orden de bloques (spec "Dashboard del atleta con gráfica de evolución", que lo enumera, y
 * DESIGN.md §7, que pone la gráfica justo tras la cabecera): gráfica de evolución → resumen
 * de asistencia → proyecciones.
 *
 * La gráfica se carga con `lazy()`: el componente importa `chart.js` (vía
 * `chart-registry`), así que mantenerlo fuera del grafo eager evita que el paquete entre
 * en el chunk de entrada.
 */

const EvolutionChart = lazy(() =>
  import("@/modules/reports/evolution-chart").then((module) => ({ default: module.EvolutionChart })),
);

export function AthleteReportPage() {
  const { id } = useParams();

  const parsedId = Number(id);
  const hasValidId = Number.isInteger(parsedId) && parsedId > 0;
  const athleteId = hasValidId ? parsedId : 0;

  const reportQuery = useAthleteReport(athleteId, hasValidId);

  if (!hasValidId) {
    return <AthleteNotFound backTo="/athletes" backLabel="Volver a la lista" />;
  }

  if (reportQuery.isPending) {
    return (
      <div className="grid gap-4" data-testid="athlete-report-loading">
        <Skeleton className="h-8 w-1/3" />
        {/*
         * Orden del spec ("Dashboard del atleta con gráfica de evolución"):
         * gráfica de evolución → resumen de asistencia → proyecciones.
         */}
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (reportQuery.isError) {
    if (isApiError(reportQuery.error) && reportQuery.error.status === 404) {
      return (
        <AthleteNotFound backTo={`/athletes/${athleteId}`} backLabel="Volver a la ficha" />
      );
    }

    return (
      <div className="grid gap-4" data-testid="athlete-report-error">
        <ErrorState
          title="No se pudo cargar el reporte"
          description="Inténtalo de nuevo en unos segundos."
        />
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => void reportQuery.refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const report = reportQuery.data;

  if (!report) {
    return null;
  }

  return (
    <div className="grid gap-4" data-testid="athlete-report-page">
      <div>
        <Button asChild variant="ghost" className="h-auto justify-start p-0 text-label">
          <Link to={`/athletes/${athleteId}`}>← Volver a la ficha</Link>
        </Button>
        <p className="text-heading text-strong font-semibold">{report.athleteFullName}</p>
        <p className="text-dim text-body">
          Evolución de tiempos, asistencia y proyección de medallería.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Evolución de tiempos</CardTitle>
          <CardDescription>
            Una serie por prueba. El eje vertical está invertido: menos segundos es mejor.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Suspense fallback={<Skeleton className="h-72 w-full" data-testid="evolution-chart-loading" />}>
            <EvolutionChart entries={report.timeEvolution} />
          </Suspense>
        </CardContent>
      </Card>

      <AttendanceCard attendance={report.attendance} />

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Proyección de medallería</CardTitle>
          <CardDescription>
            Clasificación calculada por el servidor contra el bronce de la tabla nacional.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ReportProjections projections={report.projections} />
        </CardContent>
      </Card>
    </div>
  );
}

/** 404 y id inválido comparten estado (C11: `athlete-report-not-found`). */
function AthleteNotFound({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  return (
    <div
      className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
      data-testid="athlete-report-not-found"
    >
      <div>
        <p className="text-strong text-title font-semibold">Deportista no encontrado</p>
        <p className="text-dim mt-1 text-body">
          Puede que haya sido eliminado o que el enlace sea incorrecto.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
