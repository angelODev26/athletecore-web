// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "react-chartjs-2";

import { apiFetch } from "@/lib/api";
import type {
  Classification,
  ReportResponse,
  ReportScheduleResponse,
  ReportStatus,
  TeamAthleteEntry,
  TeamReportEntry,
  TeamReportResponse,
} from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";

import { resetChartTokenCache } from "../reports/chart-theme";
import { installApiRoutes } from "../reports/test-utils";
import { DashboardPage, sortSchedulesByNextRun, summarizeTeamReport } from "./dashboard-page";

/*
 * Fase 3 de `integrar-reportes`: dashboard general (`/`) — KPIs agregados desde el
 * team report (dato ya clasificado por el servidor), gráfica de distribución,
 * list cards de reportes y próximas ejecuciones ordenadas por `nextRunAt`
 * (C3, C10, C11).
 */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

type BarChartProps = ComponentProps<typeof Bar>;

// jsdom no implementa `<canvas>`: se mockea `<Bar/>` y se aseveran sus props.
const chartSpy = vi.hoisted(() => ({ latest: null as unknown as { data: unknown; options: unknown } | null }));

vi.mock("react-chartjs-2", () => ({
  Bar: (props: BarChartProps) => {
    chartSpy.latest = props as unknown as { data: unknown; options: unknown };
    return null;
  },
}));

afterEach(cleanup);

/** Tokens simulados (no cromáticos: la fuente de color real es el tema). */
function stubComputedStyle() {
  const values: Record<string, string> = {
    "--color-data-series-1": "serie-uno",
    "--color-data-series-2": "serie-dos",
    "--color-data-series-3": "serie-tres",
    "--color-data-series-4": "serie-cuatro",
    "--color-border-default": "linea-base",
    "--color-text-subtle": "texto-tenue",
  };
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => values[name] ?? "",
      }) as unknown as CSSStyleDeclaration,
  );
}

/** JWT mínimo con roles en el claim (formato del back: `roles: ["ROLE_ADMIN", …]`). */
function tokenWithRoles(roles: string[]): string {
  const payload = {
    sub: "staff",
    roles: roles.map((role) => `ROLE_${role}`),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encoded = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  return `.${encoded}.`;
}

function signInAs(roles: string[]) {
  useSessionStore.setState({
    tokens: { access: tokenWithRoles(roles) },
    expiresAt: Date.now() + 3_600_000,
  });
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/reports/:reportId" element={<div data-testid="report-detail-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

function athlete(
  athleteId: number,
  classification: Classification,
  bestTimeSeconds = 60 + athleteId,
): TeamAthleteEntry {
  return {
    athleteId,
    athleteFullName: `Deportista ${athleteId}`,
    bestTimeSeconds,
    bestTimeFormatted: `00:${String(Math.round(bestTimeSeconds))}.000`,
    classification,
    diffVsBronzeSeconds: -1.5,
    diffVsBronzeFormatted: "-00:01.500",
  };
}

function entry(
  style: string,
  distance: number,
  category: string,
  athletes: TeamAthleteEntry[],
): TeamReportEntry {
  return { style, distance, category, athleteCount: athletes.length, athletes };
}

/**
 * Escenario vinculante del spec: 3 entradas, 9 atletas únicos y 4 con
 * `POR_ENCIMA_DEL_PODIO` → KPIs 9 / 4 / 3.
 */
const teamReportFixture: TeamReportResponse = {
  category: null,
  entries: [
    entry("LIBRE", 100, "JUVENIL", [
      athlete(1, "POR_ENCIMA_DEL_PODIO", 65.25),
      athlete(2, "CERCANO_A_MEDALLERIA", 66.4),
      athlete(3, "FUERA_DE_RANGO", 70.1),
    ]),
    entry("ESPALDA", 200, "JUVENIL", [
      athlete(4, "POR_ENCIMA_DEL_PODIO", 150.4),
      athlete(5, "CERCANO_A_MEDALLERIA", 152.2),
      athlete(6, "FUERA_DE_RANGO", 158.9),
    ]),
    entry("LIBRE", 50, "MAYOR", [
      athlete(7, "POR_ENCIMA_DEL_PODIO", 28.4),
      athlete(8, "POR_ENCIMA_DEL_PODIO", 28.9),
      athlete(9, "FUERA_DE_RANGO", 31.2),
    ]),
  ],
};

function reportFixture(id: number, status: ReportStatus, title = `Reporte ${id}`): ReportResponse {
  return {
    id,
    reportType: "GENERAL",
    athleteId: null,
    category: "JUVENIL",
    year: 2026,
    month: 9,
    title,
    status,
    errorMessage: status === "FAILED" ? "No hay datos para el período" : null,
    createdAt: `2026-09-0${id}T10:00:00Z`,
    updatedAt: `2026-09-0${id}T10:05:00Z`,
    active: true,
  };
}

function scheduleFixture(
  id: number,
  nextRunAt: string | null,
  overrides: Partial<ReportScheduleResponse> = {},
): ReportScheduleResponse {
  return {
    id,
    reportType: "GENERAL",
    athleteId: null,
    category: "JUVENIL",
    cronExpression: "0 0 6 1 * *",
    timezone: "America/Bogota",
    active: true,
    lastRunAt: null,
    nextRunAt,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

/** Desordenadas a propósito + 2 sin próxima ejecución. */
const schedulesFixture: ReportScheduleResponse[] = [
  scheduleFixture(1, "2026-10-01T11:00:00Z"),
  scheduleFixture(2, null, { active: false }),
  scheduleFixture(3, "2026-09-20T11:00:00Z"),
  scheduleFixture(4, "2026-11-01T11:00:00Z"),
  scheduleFixture(5, null, { reportType: "INDIVIDUAL", athleteId: 7, category: null }),
  scheduleFixture(6, "2026-09-10T11:00:00Z"),
  scheduleFixture(7, "2026-12-01T11:00:00Z"),
];

const reportsFixture: ReportResponse[] = [
  reportFixture(1, "GENERATED"),
  reportFixture(2, "FAILED"),
  reportFixture(3, "PENDING"),
  reportFixture(4, "GENERATED"),
  reportFixture(5, "GENERATED"),
  reportFixture(6, "GENERATED"),
  reportFixture(7, "GENERATED"),
];

function installDefaultRoutes(teamReport: TeamReportResponse = teamReportFixture) {
  installApiRoutes([
    { match: /^\/reports\/team$/, resolve: teamReport },
    { match: /^\/reports$/, resolve: reportsFixture },
    { match: /^\/report-schedules$/, resolve: schedulesFixture },
  ]);
}

describe("DashboardPage (C3, C10, C11)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    chartSpy.latest = null;
    resetChartTokenCache();
    stubComputedStyle();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetChartTokenCache();
  });

  it("agrega los 3 KPIs del team report SIN filtro (9 / 4 / 3)", async () => {
    signInAs(["USER"]);
    installDefaultRoutes();

    renderDashboard();

    await screen.findByTestId("dashboard-kpi-athletes-value");
    const kpis = screen.getByTestId("dashboard-kpis");
    expect(within(kpis).getByTestId("dashboard-kpi-athletes-value")).toHaveTextContent("9");
    expect(within(kpis).getByTestId("dashboard-kpi-podium-value")).toHaveTextContent("4");
    expect(within(kpis).getByTestId("dashboard-kpi-tests-value")).toHaveTextContent("3");

    // C3: el dashboard pide el reporte completo (sin `?category=`).
    const teamCalls = apiFetchMock.mock.calls.filter(([path]) => path.startsWith("/reports/team"));
    expect(teamCalls).toHaveLength(1);
    expect(teamCalls[0]?.[0]).toBe("/reports/team");
  });

  it("gráfica: dataset único series-1 con las 3 barras rotuladas y sin leyenda redundante", async () => {
    signInAs(["USER"]);
    installDefaultRoutes();

    renderDashboard();

    expect(await screen.findByTestId("dashboard-classification-chart")).toBeInTheDocument();
    const data = chartSpy.latest?.data as {
      labels: string[];
      datasets: { label: string; data: number[]; backgroundColor: string }[];
    };
    expect(data.labels).toEqual(["Por encima del podio", "Cercano a medallería", "Fuera de rango"]);
    expect(data.datasets).toHaveLength(1);
    expect(data.datasets[0]?.data).toEqual([4, 2, 3]);
    expect(data.datasets[0]?.backgroundColor).toBe("serie-uno");
  });

  it("«Reportes recientes»: hasta 5 con badge de estado del servidor y fecha formateada", async () => {
    signInAs(["ADMIN"]);
    installDefaultRoutes();

    renderDashboard();

    // La card existe desde el primer render: se espera a una fila para no aseverar
    // sobre el estado de carga.
    await screen.findByTestId("dashboard-recent-report-1");
    const card = screen.getByTestId("dashboard-recent-reports");
    expect(within(card).getByTestId("dashboard-recent-report-1")).toBeInTheDocument();
    expect(within(card).getByTestId("dashboard-recent-report-5")).toBeInTheDocument();
    expect(within(card).queryByTestId("dashboard-recent-report-6")).not.toBeInTheDocument();
    expect(within(card).queryByTestId("dashboard-recent-report-7")).not.toBeInTheDocument();

    const row2 = within(card).getByTestId("dashboard-recent-report-2");
    expect(within(row2).getByTestId("report-status-badge")).toHaveTextContent("Fallido");
    expect(within(row2).getByTestId("report-status-badge")).toHaveAttribute("data-status", "FAILED");
    // Fecha de presentación (helper de C10), nunca un tiempo de nado.
    expect(within(row2).getByText(/\d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();
  });

  it("«Próximas ejecuciones»: orden por nextRunAt asc (nulls al final) y corte a 5", async () => {
    signInAs(["USER"]);
    installDefaultRoutes();

    renderDashboard();

    await screen.findByTestId("dashboard-upcoming-schedule-6");
    const card = screen.getByTestId("dashboard-upcoming-schedules");
    const rows = within(card).getAllByTestId(/^dashboard-upcoming-schedule-/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "dashboard-upcoming-schedule-6",
      "dashboard-upcoming-schedule-3",
      "dashboard-upcoming-schedule-1",
      "dashboard-upcoming-schedule-4",
      "dashboard-upcoming-schedule-7",
    ]);
    // Las dos sin `nextRunAt` no entran en el top 5 (nulls al final).
    expect(within(card).queryByTestId("dashboard-upcoming-schedule-2")).not.toBeInTheDocument();
    expect(within(card).queryByTestId("dashboard-upcoming-schedule-5")).not.toBeInTheDocument();
  });

  it("«Próximas ejecuciones»: una programación pausada con `nextRunAt` futuro no promete ejecución", async () => {
    signInAs(["USER"]);
    /*
     * Back: `createSchedule`/`updateSchedule` calculan `nextRunAt` SIN mirar `active`, y
     * el scheduler solo ejecuta las activas. La fila pausada conserva la fecha que manda
     * el servidor, pero marcada como pausada (nunca sola, como si fuera a ejecutarse).
     */
    installApiRoutes([
      { match: /^\/reports\/team$/, resolve: teamReportFixture },
      { match: /^\/reports$/, resolve: [] },
      {
        match: /^\/report-schedules$/,
        resolve: [
          scheduleFixture(1, "2026-10-01T11:00:00Z", { active: false }),
          scheduleFixture(2, null, { active: false }),
          scheduleFixture(3, "2026-10-02T11:00:00Z"),
        ],
      },
    ]);

    renderDashboard();

    const card = screen.getByTestId("dashboard-upcoming-schedules");
    const pausedRow = await within(card).findByTestId("dashboard-upcoming-schedule-1");
    // La fecha sigue visible (C3: se ordena igual) pero acompañada de la marca de estado.
    expect(within(pausedRow).getByText("Pausada")).toBeInTheDocument();
    expect(within(pausedRow).getByText(/\d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();

    // Pausada sin `nextRunAt` (nulls al final): marca de estado + "Sin próxima ejecución".
    const pausedNullRow = within(card).getByTestId("dashboard-upcoming-schedule-2");
    expect(within(pausedNullRow).getByText("Pausada")).toBeInTheDocument();
    expect(within(pausedNullRow).getByText("Sin próxima ejecución")).toBeInTheDocument();

    // Una activa con fecha no lleva la marca.
    const activeRow = within(card).getByTestId("dashboard-upcoming-schedule-3");
    expect(within(activeRow).queryByText("Pausada")).not.toBeInTheDocument();
  });

  it("«Próximas ejecuciones»: `active: null` (nullable del DTO) también lleva la marca «Pausada»", async () => {
    signInAs(["USER"]);
    /*
     * Mismo caso que `active: false`, pero con el `null` del `Boolean` del DTO: el
     * scheduler solo ejecuta las filas con `active = TRUE`, así que una programación con
     * `nextRunAt` futuro y `active: null` NO debe presentarse como si fuera a ejecutarse.
     */
    installApiRoutes([
      { match: /^\/reports\/team$/, resolve: teamReportFixture },
      { match: /^\/reports$/, resolve: [] },
      {
        match: /^\/report-schedules$/,
        resolve: [
          scheduleFixture(1, "2026-10-01T11:00:00Z", { active: null }),
          scheduleFixture(2, "2026-10-02T11:00:00Z"),
        ],
      },
    ]);

    renderDashboard();

    const card = screen.getByTestId("dashboard-upcoming-schedules");
    const nullActiveRow = await within(card).findByTestId("dashboard-upcoming-schedule-1");
    expect(within(nullActiveRow).getByText("Pausada")).toBeInTheDocument();
    // Sigue ordenada por la fecha del servidor (C3), pero nunca sola.
    expect(within(nullActiveRow).getByText(/\d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();

    const activeRow = within(card).getByTestId("dashboard-upcoming-schedule-2");
    expect(within(activeRow).queryByText("Pausada")).not.toBeInTheDocument();
  });

  it("sortSchedulesByNextRun: asc con los null al final (estable entre nulls)", () => {
    const sorted = sortSchedulesByNextRun([
      scheduleFixture(2, null),
      scheduleFixture(1, "2026-10-01T11:00:00Z"),
      scheduleFixture(3, null),
      scheduleFixture(4, "2026-09-10T11:00:00Z"),
    ]);

    expect(sorted.map((schedule) => schedule.id)).toEqual([4, 1, 2, 3]);
  });

  it("summarizeTeamReport: atribuye por deportista (no cuenta dos veces al mismo atleta)", () => {
    const summary = summarizeTeamReport([
      entry("LIBRE", 100, "JUVENIL", [
        athlete(1, "POR_ENCIMA_DEL_PODIO", 65.25),
        athlete(2, "FUERA_DE_RANGO", 70.1),
      ]),
      // El mismo deportista 1 en otra prueba: sigue siendo 1 podio y 2 evaluados.
      entry("ESPALDA", 200, "JUVENIL", [athlete(1, "FUERA_DE_RANGO", 150.4)]),
    ]);

    expect(summary).toEqual({
      evaluatedAthletes: 2,
      podiumProjections: 1,
      testsWithRecords: 2,
      classificationCounts: [1, 0, 1],
    });
  });

  it("equipo sin datos: KPIs a 0, gráfica y listas con su estado vacío", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/reports\/team$/, resolve: { category: null, entries: [] } },
      { match: /^\/reports$/, resolve: [] },
      { match: /^\/report-schedules$/, resolve: [] },
    ]);

    renderDashboard();

    await screen.findByTestId("dashboard-kpi-athletes-value");
    const kpis = screen.getByTestId("dashboard-kpis");
    expect(within(kpis).getByTestId("dashboard-kpi-athletes-value")).toHaveTextContent("0");
    expect(within(kpis).getByTestId("dashboard-kpi-podium-value")).toHaveTextContent("0");
    expect(within(kpis).getByTestId("dashboard-kpi-tests-value")).toHaveTextContent("0");

    expect(await screen.findByTestId("dashboard-classification-chart-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-classification-chart")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-recent-reports-empty")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-upcoming-schedules-empty")).toBeInTheDocument();
  });

  it("mientras carga muestra un skeleton por card (sin canvas)", async () => {
    signInAs(["USER"]);
    const pending = () => new Promise<never>(() => {});
    installApiRoutes([
      { match: /^\/reports\/team$/, resolve: pending },
      { match: /^\/reports$/, resolve: pending },
      { match: /^\/report-schedules$/, resolve: pending },
    ]);

    renderDashboard();

    expect(await screen.findByTestId("dashboard-kpi-athletes-loading")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-classification-chart-loading")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-recent-reports-loading")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-upcoming-schedules-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-classification-chart")).not.toBeInTheDocument();
  });

  it("un USER ve el dashboard completo y sin acciones de escritura", async () => {
    signInAs(["USER"]);
    installDefaultRoutes();

    renderDashboard();

    await screen.findByTestId("dashboard-classification-chart");
    const page = screen.getByTestId("dashboard-page");
    expect(within(page).getByTestId("dashboard-kpis")).toBeInTheDocument();
    expect(within(page).getByTestId("dashboard-classification-chart")).toBeInTheDocument();
    expect(within(page).getByTestId("dashboard-recent-reports")).toBeInTheDocument();
    expect(within(page).getByTestId("dashboard-upcoming-schedules")).toBeInTheDocument();
    expect(
      within(page).queryByRole("button", { name: /generar|nuevo|borrar|eliminar|editar/i }),
    ).not.toBeInTheDocument();
  });
});
