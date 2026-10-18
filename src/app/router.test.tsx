// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRoutes } from "@/app/router";
import { apiFetch } from "@/lib/api";
import type {
  AthleteResponse,
  IndividualReportResponse,
  ReportDetailResponse,
  TeamReportResponse,
} from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";
import { installApiRoutes } from "@/modules/reports/test-utils";

/*
 * Fase 7 de `integrar-reportes`: las RUTAS reales del módulo (C1, C9).
 *
 * Se monta la tabla REAL del router (`appRoutes`) con `createMemoryRouter` — mismo
 * grafo que producción, sin `window.history`. Se cubren los tres escenarios del spec
 * "Acceso y ubicación de la UI de reportes" más el control positivo de la ruta de
 * programaciones y la sub-ruta del dashboard del atleta.
 *
 * Cero red: `apiFetch` se mockea y se resuelve por path+method (`installApiRoutes`).
 * En jsdom no hay `<canvas>`, así que `react-chartjs-2` se mockea igual que en los
 * tests del módulo (la gráfica se prueba en `evolution-chart.test.tsx`).
 */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const chartRenders = vi.hoisted(() => ({ line: 0, bar: 0 }));

vi.mock("react-chartjs-2", () => ({
  Line: () => {
    chartRenders.line += 1;
    return null;
  },
  Bar: () => {
    chartRenders.bar += 1;
    return null;
  },
}));

const apiFetchMock = vi.mocked(apiFetch);

/** JWT mínimo con roles en el claim (formato del back: `roles: ["ROLE_ADMIN", …]`). */
function tokenWithRoles(roles: string[]): string {
  const payload = {
    sub: "staff",
    roles: roles.map((role) => `ROLE_${role}`),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.`;
}

function signInAs(roles: string[]) {
  useSessionStore.setState({
    tokens: { access: tokenWithRoles(roles) },
    expiresAt: Date.now() + 3_600_000,
  });
}

const ATHLETES_PAGE = {
  content: [
    {
      id: 1,
      username: "user1",
      email: "user1@athletecore.test",
      firstName: "Nombre",
      lastName: "Apellido",
      fullName: "Ana Apellido",
      birthDate: null,
      photoUrl: null,
      active: true,
    } satisfies AthleteResponse,
  ],
  last: true,
  totalElements: 1,
};

const EMPTY_TEAM_REPORT: TeamReportResponse = { category: null, entries: [] };

const REPORT_DETAIL: ReportDetailResponse = {
  id: 12,
  reportType: "INDIVIDUAL",
  athleteId: 1,
  category: null,
  year: 2026,
  month: 3,
  title: "Informe marzo",
  status: "GENERATED",
  errorMessage: null,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:01Z",
  exports: [],
};

const ATHLETE_REPORT: IndividualReportResponse = {
  athleteId: 1,
  athleteFullName: "Ana Apellido",
  timeEvolution: [
    { year: 2026, month: 3, style: "LIBRE", distance: 50, timeSeconds: 28.4, timeFormatted: "00:28.400" },
  ],
  attendance: {
    totalSessions: 10,
    presentCount: 8,
    absentCount: 1,
    justifiedCount: 1,
    currentAbsenceStreak: 0,
  },
  projections: [],
};

/**
 * Rutas de red del módulo + la lista de deportistas que consumen la biblioteca y las
 * programaciones (`fetchAllAthletes`).
 */
function installReportRoutes() {
  installApiRoutes([
    { match: /^\/athletes\?/, resolve: ATHLETES_PAGE },
    { match: /^\/athletes\/1\/report$/, resolve: ATHLETE_REPORT },
    { match: /^\/reports\/team(\?.+)?$/, resolve: EMPTY_TEAM_REPORT },
    { match: /^\/reports\/12$/, resolve: REPORT_DETAIL },
    { match: /^\/reports(\?.+)?$/, resolve: [] },
    { match: /^\/report-schedules(\?.+)?$/, resolve: [] },
  ]);
}

function renderRoute(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(appRoutes, { initialEntries: [initialPath] });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

function requestedPaths(): string[] {
  return apiFetchMock.mock.calls.map(([path]) => path as string);
}

describe("Router — rutas del módulo de reportes (C1, C9)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    chartRenders.line = 0;
    chartRenders.bar = 0;
  });

  afterEach(() => {
    cleanup();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("la sub-navegación de la sección navega de Biblioteca a Equipo (y no cae en :reportId)", async () => {
    signInAs(["ADMIN"]);
    installReportRoutes();

    const router = renderRoute("/reports");

    expect(await screen.findByTestId("reports-library-page")).toBeInTheDocument();

    const tabs = screen.getByTestId("reports-tabs");
    const user = userEvent.setup();
    // El trigger del registry expone el rol "tab" aunque sea un `NavLink` real (href).
    await user.click(within(tabs).getByRole("tab", { name: "Equipo" }));

    await waitFor(() => expect(screen.getByTestId("team-report-page")).toBeInTheDocument());
    expect(screen.queryByTestId("reports-library-page")).not.toBeInTheDocument();
    // `equipo` es estática: nunca se resuelve como `:reportId` (detalle).
    expect(screen.queryByTestId("report-detail-page")).not.toBeInTheDocument();
    expect(requestedPaths()).not.toContain("/reports/equipo");
    expect(router.state.location.pathname).toBe("/reports/equipo");
  });

  it("USER por URL directa a /reports/programaciones ve 'sin permisos' y la sesión sigue viva", async () => {
    signInAs(["USER"]);
    installReportRoutes();

    const router = renderRoute("/reports/programaciones");

    const forbidden = await screen.findByTestId("forbidden-state");
    expect(forbidden).toHaveTextContent("Tu usuario no tiene permisos para ver esta sección.");
    // La página real nunca se monta (el guard de rol corta antes) ni se llama al back.
    expect(screen.queryByTestId("schedules-page")).not.toBeInTheDocument();
    expect(requestedPaths()).not.toContain("/report-schedules");
    // No es un 401 ni una expiración: no se cierra sesión ni se redirige a login.
    expect(useSessionStore.getState().tokens?.access).not.toBeNull();
    expect(router.state.location.pathname).toBe("/reports/programaciones");
  });

  it("ADMIN por URL directa a /reports/programaciones sí ve la página de programaciones", async () => {
    signInAs(["ADMIN"]);
    installReportRoutes();

    const router = renderRoute("/reports/programaciones");

    expect(await screen.findByTestId("schedules-page")).toBeInTheDocument();
    expect(screen.queryByTestId("forbidden-state")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/reports/programaciones");
  });

  it("/reports/:reportId resuelve el detalle del reporte", async () => {
    signInAs(["ADMIN"]);
    installReportRoutes();

    const router = renderRoute("/reports/12");

    const detail = await screen.findByTestId("report-detail-page");
    expect(within(detail).getByText("Informe marzo")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/reports/12");
  });

  it("/athletes/:id/report resuelve el dashboard del atleta", async () => {
    signInAs(["ADMIN"]);
    installReportRoutes();

    const router = renderRoute("/athletes/1/report");

    expect(await screen.findByTestId("athlete-report-page")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-card")).toBeInTheDocument();
    // La gráfica de evolución se monta (mockeada en jsdom) al resolver su chunk diferido.
    expect(await screen.findByTestId("evolution-chart")).toBeInTheDocument();
    expect(chartRenders.line).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe("/athletes/1/report");
  });
});
