import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReportScheduleResponse, TeamReportEntry } from "@/lib/api/types";
import { categoryLabel } from "@/modules/checkups/format";
import { isScheduleActive } from "@/modules/reports/format";
import { ReportStatusBadge } from "@/modules/reports/report-status-badge";
import { useReportSchedules, useReports, useTeamReport } from "@/modules/reports/reports-api";
import { EmptyState, ErrorState } from "@/shared/components/states";
import { formatInstantDate, formatInstantDateTime } from "@/shared/format/dates";

/*
 * C3: dashboard general (`/`), visible para CUALQUIER usuario autenticado (solo
 * lectura: aquí no hay acciones de escritura).
 *
 * Composición (DESIGN.md §7): fila de 3 KPI cards + card de gráfica + 2 list cards.
 *
 * Fuente de los KPIs y de la gráfica: `GET /reports/team` SIN filtro (todas las
 * categorías), a través de `useTeamReport()` (staleTime 5 min — lectura pesada, sin
 * polling agresivo). El front SOLO agrega y ordena datos que el servidor ya
 * clasificó; nunca calcula una clasificación a partir de tiempos.
 *
 * Las list cards usan `GET /reports` (biblioteca, sin paginar → se corta a 5 en
 * presentación) y `GET /report-schedules` (ordenado por `nextRunAt`), también como
 * cualquier autenticado puede leerlos.
 *
 * La gráfica de distribución se carga con `lazy()` (`./classification-chart`): el
 * dashboard es la ruta INDEX y se importa eager en el router, así que si trajera
 * `chart.js` en su grafo de imports el paquete entraría en el chunk de entrada.
 */

const ClassificationDistributionChart = lazy(() =>
  import("./classification-chart").then((module) => ({
    default: module.ClassificationDistributionChart,
  })),
);

const RECENT_REPORTS_LIMIT = 5;
const UPCOMING_SCHEDULES_LIMIT = 5;

/** Clasificaciones del contrato, en orden de presentación: Podio → Cercano → Fuera. */
const CLASSIFICATION_ORDER = [
  "POR_ENCIMA_DEL_PODIO",
  "CERCANO_A_MEDALLERIA",
  "FUERA_DE_RANGO",
] as const;

/** Posición de una clasificación conocida; las desconocidas quedan al final. */
function classificationRank(classification: string): number {
  const index = CLASSIFICATION_ORDER.findIndex((known) => known === classification);
  return index === -1 ? CLASSIFICATION_ORDER.length : index;
}

export interface TeamSummary {
  /** `athleteId` únicos en `entries[].athletes`. */
  evaluatedAthletes: number;
  /** Deportistas distintos cuya mejor clasificación es `POR_ENCIMA_DEL_PODIO`. */
  podiumProjections: number;
  /** `entries.length`: pruebas (estilo + distancia + categoría) con registro. */
  testsWithRecords: number;
  /** Conteo por clasificación, en el orden de `CLASSIFICATION_ORDER` (gráfica). */
  classificationCounts: number[];
}

/**
 * KPIs del dashboard a partir del team report.
 *
 * Atribución POR DEPORTISTA, no por fila: un deportista puede aparecer en varias
 * entradas si compite en más de una prueba. El escenario vinculante del spec es
 * "3 entradas, 9 atletas únicos, 4 con clasificación POR_ENCIMA_DEL_PODIO → 9 / 4 /
 * 3", así que los deportistas se cuentan UNA sola vez con su MEJOR clasificación
 * (elegir la mejor de las que el servidor ya calculó es agregación, nunca calcular
 * una clasificación nueva). Efecto: las 3 barras de la gráfica suman exactamente los
 * deportistas evaluados y la barra del podio coincide con la KPI 2.
 */
export function summarizeTeamReport(entries: TeamReportEntry[]): TeamSummary {
  const bestByAthlete = new Map<number, string>();

  for (const entry of entries) {
    for (const athlete of entry.athletes) {
      const previous = bestByAthlete.get(athlete.athleteId);
      if (previous === undefined || classificationRank(athlete.classification) < classificationRank(previous)) {
        bestByAthlete.set(athlete.athleteId, athlete.classification);
      }
    }
  }

  const classificationCounts: number[] = CLASSIFICATION_ORDER.map(() => 0);
  for (const classification of bestByAthlete.values()) {
    const rank = classificationRank(classification);
    if (rank < CLASSIFICATION_ORDER.length) {
      classificationCounts[rank] += 1;
    }
  }

  return {
    evaluatedAthletes: bestByAthlete.size,
    // Índice 0 = POR_ENCIMA_DEL_PODIO (orden de CLASSIFICATION_ORDER).
    podiumProjections: classificationCounts[0],
    testsWithRecords: entries.length,
    classificationCounts,
  };
}

/**
 * Orden por `nextRunAt` asc con NULLS AL FINAL (C3): una programación sin próxima
 * ejecución no debe encabezar la lista. El servidor manda los timestamps; aquí solo
 * se ordenan (presentación).
 */
export function sortSchedulesByNextRun(
  schedules: ReportScheduleResponse[],
): ReportScheduleResponse[] {
  return [...schedules].sort((a, b) => {
    if (a.nextRunAt === null) {
      return b.nextRunAt === null ? 0 : 1;
    }
    if (b.nextRunAt === null) {
      return -1;
    }
    return Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt);
  });
}

/**
 * Objetivo de una programación. El DTO de schedules solo trae `athleteId` (sin
 * nombre): resolver nombres exigiría `fetchAllAthletes()` (llamada de lista completa)
 * en el dashboard, así que se muestra el id como dato técnico (precedente D4).
 */
export function scheduleTargetLabel(schedule: ReportScheduleResponse): string {
  if (schedule.reportType === "INDIVIDUAL") {
    return schedule.athleteId === null ? "Reporte individual" : `Atleta #${schedule.athleteId}`;
  }
  return schedule.category
    ? `General · ${categoryLabel(schedule.category)}`
    : "General · todas las categorías";
}

interface KpiDefinition {
  key: string;
  label: string;
  value: number;
  hint: string;
}

export function DashboardPage() {
  const teamQuery = useTeamReport();

  const summary = useMemo(
    () => summarizeTeamReport(teamQuery.data?.entries ?? []),
    [teamQuery.data],
  );

  const kpis: KpiDefinition[] = [
    {
      key: "athletes",
      label: "Deportistas evaluados",
      value: summary.evaluatedAthletes,
      hint: "Atletas únicos con chequeos en el reporte de equipo.",
    },
    {
      key: "podium",
      label: "Proyecciones al podio",
      value: summary.podiumProjections,
      hint: "Clasificación por encima del podio, calculada por el servidor.",
    },
    {
      key: "tests",
      label: "Pruebas con registro",
      value: summary.testsWithRecords,
      hint: "Pruebas (estilo y distancia) con al menos una marca.",
    },
  ];

  return (
    <div className="grid gap-4" data-testid="dashboard-page">
      <header>
        <p className="text-heading text-strong font-semibold">Dashboard</p>
        <p className="text-dim text-body">
          Resumen del equipo: cobertura de chequeos, proyección de medallería y actividad de
          reportes.
        </p>
      </header>

      {teamQuery.isError ? (
        <CardError
          testid="dashboard-team-error"
          title="No se pudo cargar el resumen del equipo"
          onRetry={() => void teamQuery.refetch()}
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3" data-testid="dashboard-kpis">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.key} kpi={kpi} loading={teamQuery.isPending} />
            ))}
          </section>

          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Distribución de clasificaciones</CardTitle>
              <CardDescription>
                Clasificación de medallería del servidor por deportista evaluado.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {/*
               * Mismo testid en los dos estados de carga: el `Suspense` mientras se
               * descarga el chunk de la gráfica y el skeleton interno mientras carga
               * el team report (nunca se ven a la vez).
               */}
              <Suspense
                fallback={
                  <Skeleton
                    className="h-64 w-full"
                    data-testid="dashboard-classification-chart-loading"
                  />
                }
              >
                <ClassificationDistributionChart
                  counts={summary.classificationCounts}
                  loading={teamQuery.isPending}
                />
              </Suspense>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentReportsCard />
        <UpcomingSchedulesCard />
      </div>
    </div>
  );
}

function KpiCard({ kpi, loading }: { kpi: KpiDefinition; loading: boolean }) {
  return (
    <Card data-testid={`dashboard-kpi-${kpi.key}`}>
      <CardContent>
        <p className="text-dim text-caption">{kpi.label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-16" data-testid={`dashboard-kpi-${kpi.key}-loading`} />
        ) : (
          <p className="text-strong text-metric font-bold" data-testid={`dashboard-kpi-${kpi.key}-value`}>
            {kpi.value}
          </p>
        )}
        <p className="text-dim text-caption">{kpi.hint}</p>
      </CardContent>
    </Card>
  );
}

function RecentReportsCard() {
  const reportsQuery = useReports({});
  const recentReports = (reportsQuery.data ?? []).slice(0, RECENT_REPORTS_LIMIT);

  return (
    <Card data-testid="dashboard-recent-reports">
      <CardHeader className="border-b pb-4">
        <CardTitle>Reportes recientes</CardTitle>
        <CardDescription>Los últimos reportes de la biblioteca.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {reportsQuery.isPending ? (
          <SkeletonList testid="dashboard-recent-reports-loading" />
        ) : reportsQuery.isError ? (
          <CardError
            testid="dashboard-recent-reports-error"
            title="No se pudieron cargar los reportes"
            onRetry={() => void reportsQuery.refetch()}
          />
        ) : recentReports.length === 0 ? (
          <div data-testid="dashboard-recent-reports-empty">
            <EmptyState
              title="Sin reportes"
              description="Cuando se genere un reporte aparecerá aquí."
            />
          </div>
        ) : (
          <ul className="grid gap-3">
            {recentReports.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-2"
                data-testid={`dashboard-recent-report-${report.id}`}
              >
                <Link to={`/reports/${report.id}`} className="text-strong text-body font-medium hover:text-primary-text">
                  {report.title}
                </Link>
                <span className="flex items-center gap-2">
                  <ReportStatusBadge status={report.status} />
                  <span className="text-dim text-caption">{formatInstantDate(report.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingSchedulesCard() {
  const schedulesQuery = useReportSchedules();

  const upcomingSchedules = useMemo(
    () => sortSchedulesByNextRun(schedulesQuery.data ?? []).slice(0, UPCOMING_SCHEDULES_LIMIT),
    [schedulesQuery.data],
  );

  return (
    <Card data-testid="dashboard-upcoming-schedules">
      <CardHeader className="border-b pb-4">
        <CardTitle>Próximas ejecuciones</CardTitle>
        <CardDescription>Programaciones automáticas ordenadas por próxima ejecución.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {schedulesQuery.isPending ? (
          <SkeletonList testid="dashboard-upcoming-schedules-loading" />
        ) : schedulesQuery.isError ? (
          <CardError
            testid="dashboard-upcoming-schedules-error"
            title="No se pudieron cargar las programaciones"
            onRetry={() => void schedulesQuery.refetch()}
          />
        ) : upcomingSchedules.length === 0 ? (
          <div data-testid="dashboard-upcoming-schedules-empty">
            <EmptyState
              title="Sin programaciones"
              description="Cuando programes un reporte verás aquí su próxima ejecución."
            />
          </div>
        ) : (
          <ul className="grid gap-3">
            {upcomingSchedules.map((schedule) => (
              <li
                key={schedule.id}
                className="flex flex-wrap items-center justify-between gap-2"
                data-testid={`dashboard-upcoming-schedule-${schedule.id}`}
              >
                <span className="text-strong text-body font-medium">
                  {scheduleTargetLabel(schedule)}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {/*
                   * El back calcula `nextRunAt` aunque la programación esté pausada
                   * (`computeNextRun` no mira `active`; el scheduler solo ejecuta las
                   * activas) y las pausadas se ordenan por esa fecha igual que las
                   * activas (C3). Por eso la fecha NUNCA se pinta sola: una fila
                   * inactiva lleva siempre su marca de estado, para no prometer una
                   * ejecución que no va a ocurrir. Mismo criterio que la página de
                   * programaciones (badge Activo/Pausado junto a la fecha).
                   *
                   * `active` es NULLABLE en el DTO y solo `true` ejecuta: el estado se
                   * resuelve con `isScheduleActive` (un `null` se marca como "Pausada").
                   */}
                  {isScheduleActive(schedule) ? null : <Badge variant="outline">Pausada</Badge>}
                  <span className="text-dim text-caption">
                    {schedule.nextRunAt
                      ? formatInstantDateTime(schedule.nextRunAt)
                      : "Sin próxima ejecución"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonList({ testid }: { testid: string }) {
  return (
    <div className="grid gap-3" data-testid={testid}>
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}

function CardError({
  testid,
  title,
  description = "Inténtalo de nuevo en unos segundos.",
  onRetry,
}: {
  testid: string;
  title: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <div data-testid={testid}>
      <ErrorState title={title} description={description} />
      <div className="mt-4 flex justify-center">
        <Button type="button" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
