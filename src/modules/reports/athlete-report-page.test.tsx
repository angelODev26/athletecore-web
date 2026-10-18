// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";
import type { IndividualReportResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";

import { AthleteReportPage } from "./athlete-report-page";
import { resetChartTokenCache } from "./chart-theme";
import { installApiRoutes, type LineChartProps } from "./test-utils";

/*
 * Fase 2 de `integrar-reportes`: dashboard del atleta (`/athletes/:id/report`) —
 * una sola llamada, evolución + asistencia + proyecciones, estados de 404/sin
 * datos/error con reintento y lectura para cualquier rol (C1, C2, C9, C11).
 */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

// jsdom no implementa `<canvas>`: se mockea `<Line/>` y se aseveran sus props.
const chartSpy = vi.hoisted(() => ({ latest: null as LineChartProps | null }));

vi.mock("react-chartjs-2", () => ({
  Line: (props: LineChartProps) => {
    chartSpy.latest = props;
    return null;
  },
}));

afterEach(cleanup);

function apiErrorWith(status: number, message: string): ApiError {
  return new ApiError(status, { status, error: "", message });
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

function renderPage(path = "/athletes/7/report") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/athletes/:id/report" element={<AthleteReportPage />} />
        <Route path="/athletes/:id" element={<div data-testid="athlete-detail-mock" />} />
        <Route path="/athletes" element={<div data-testid="athletes-list-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

const report: IndividualReportResponse = {
  athleteId: 7,
  athleteFullName: "Michael Phelps",
  timeEvolution: [
    { year: 2026, month: 1, style: "LIBRE", distance: 100, timeSeconds: 65.25, timeFormatted: "01:05.250" },
    { year: 2026, month: 3, style: "LIBRE", distance: 100, timeSeconds: 64.1, timeFormatted: "01:04.100" },
    { year: 2026, month: 2, style: "ESPALDA", distance: 200, timeSeconds: 150.4, timeFormatted: "02:30.400" },
  ],
  attendance: {
    totalSessions: 12,
    presentCount: 8,
    absentCount: 3,
    justifiedCount: 1,
    currentAbsenceStreak: 2,
  },
  projections: [
    {
      style: "LIBRE",
      distance: 100,
      category: "JUVENIL",
      classification: "POR_ENCIMA_DEL_PODIO",
      timeSeconds: 58.4,
      timeFormatted: "00:58.400",
      diffVsBronzeSeconds: -2.1,
      diffVsBronzeFormatted: "-00:02.100",
    },
  ],
};

describe("AthleteReportPage (C1, C2, C9, C11)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    chartSpy.latest = null;
    resetChartTokenCache();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("consume UNA sola llamada y renderiza los testids del dashboard", async () => {
    signInAs(["COACH"]);
    installApiRoutes([{ match: /^\/athletes\/7\/report$/, resolve: report }]);

    renderPage();

    expect(await screen.findByTestId("athlete-report-page")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-card")).toBeInTheDocument();
    // La gráfica llega en un chunk diferido (`lazy`): se espera su montaje.
    expect(await screen.findByTestId("evolution-chart")).toBeInTheDocument();
    expect(screen.getByTestId("report-projections")).toBeInTheDocument();

    const reportCalls = apiFetchMock.mock.calls.filter(([path]) => path === "/athletes/7/report");
    expect(reportCalls).toHaveLength(1);
  });

  it("cabecera con el nombre del servidor y vuelta a la ficha", async () => {
    signInAs(["USER"]);
    installApiRoutes([{ match: /^\/athletes\/7\/report$/, resolve: report }]);

    renderPage();

    expect(await screen.findByText("Michael Phelps")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Volver a la ficha" })).toHaveAttribute(
      "href",
      "/athletes/7",
    );
  });

  it("muestra los contadores de asistencia TAL CUAL del servidor (nunca recalcula la racha)", async () => {
    signInAs(["USER"]);
    installApiRoutes([{ match: /^\/athletes\/7\/report$/, resolve: report }]);

    renderPage();

    const card = await screen.findByTestId("attendance-card");
    expect(within(card).getByTestId("attendance-total-sessions")).toHaveTextContent("12");
    expect(within(card).getByTestId("attendance-present-count")).toHaveTextContent("8");
    expect(within(card).getByTestId("attendance-absent-count")).toHaveTextContent("3");
    expect(within(card).getByTestId("attendance-justified-count")).toHaveTextContent("1");
    expect(within(card).getByTestId("attendance-absence-streak")).toHaveTextContent("2");
  });

  it("proyecciones: valores y badge del servidor (ClassificationBadge reutilizado)", async () => {
    signInAs(["USER"]);
    installApiRoutes([{ match: /^\/athletes\/7\/report$/, resolve: report }]);

    renderPage();

    const projections = await screen.findByTestId("report-projections");
    expect(within(projections).getByText("00:58.400")).toBeInTheDocument();
    expect(within(projections).getByText("-00:02.100")).toBeInTheDocument();
    expect(within(projections).getByTestId("report-projection-badge-0")).toHaveTextContent(
      "Por encima del podio",
    );
  });

  it("la gráfica recibe las series por prueba y el eje Y invertido", async () => {
    signInAs(["USER"]);
    installApiRoutes([{ match: /^\/athletes\/7\/report$/, resolve: report }]);

    renderPage();
    await screen.findByTestId("evolution-chart");

    expect(chartSpy.latest?.data.datasets.map((dataset) => dataset.label)).toEqual([
      "LIBRE 100m",
      "ESPALDA 200m",
    ]);
    expect(chartSpy.latest?.options?.scales?.y?.reverse).toBe(true);
  });

  it("atleta sin datos de chequeo: estados vacíos de gráfica y proyecciones con la asistencia visible", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      {
        match: /^\/athletes\/7\/report$/,
        resolve: { ...report, timeEvolution: [], projections: [] },
      },
    ]);

    renderPage();

    expect(await screen.findByTestId("evolution-empty")).toBeInTheDocument();
    expect(screen.getByTestId("report-projections-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("evolution-chart")).not.toBeInTheDocument();
    expect(screen.getByTestId("attendance-card")).toBeInTheDocument();
  });

  it("404 → estado 'Deportista no encontrado' con vuelta a la ficha", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      {
        match: /^\/athletes\/7\/report$/,
        resolve: () => Promise.reject(apiErrorWith(404, "Athlete not found with id: 7")),
      },
    ]);

    renderPage();

    const notFound = await screen.findByTestId("athlete-report-not-found");
    expect(within(notFound).getByText("Deportista no encontrado")).toBeInTheDocument();
    expect(within(notFound).getByRole("link", { name: "Volver a la ficha" })).toHaveAttribute(
      "href",
      "/athletes/7",
    );
  });

  it("id no numérico: no llama al back y ofrece volver a la lista", async () => {
    signInAs(["USER"]);
    installApiRoutes([]);

    renderPage("/athletes/no-num/report");

    const notFound = await screen.findByTestId("athlete-report-not-found");
    expect(within(notFound).getByRole("link", { name: "Volver a la lista" })).toHaveAttribute(
      "href",
      "/athletes",
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("error de carga: estado con reintento que vuelve a llamar al back", async () => {
    signInAs(["ADMIN"]);
    let fail = true;
    installApiRoutes([
      {
        match: /^\/athletes\/7\/report$/,
        resolve: () =>
          fail ? Promise.reject(new Error("network down")) : Promise.resolve(report),
      },
    ]);

    renderPage();

    const errorState = await screen.findByTestId("athlete-report-error");
    expect(within(errorState).getByText("No se pudo cargar el reporte")).toBeInTheDocument();

    const user = userEvent.setup();
    fail = false;
    await user.click(within(errorState).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("athlete-report-page")).toBeInTheDocument();
  });

  it("USER ve la página completa y sin acciones de escritura (solo lectura)", async () => {
    signInAs(["USER"]);
    installApiRoutes([{ match: /^\/athletes\/7\/report$/, resolve: report }]);

    renderPage();

    const page = await screen.findByTestId("athlete-report-page");
    expect(await within(page).findByTestId("evolution-chart")).toBeInTheDocument();
    expect(within(page).getByTestId("report-projections")).toBeInTheDocument();
    expect(
      within(page).queryByRole("button", { name: /borrar|eliminar|generar|nuevo|editar/i }),
    ).not.toBeInTheDocument();
  });
});
