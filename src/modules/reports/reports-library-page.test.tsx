// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { AthleteResponse, ReportResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";
import { formatInstantDate } from "@/shared/format/dates";

import { ReportsLibraryPage } from "./reports-library-page";
import { installApiRoutes } from "./test-utils";

/*
 * Fase 5 de `integrar-reportes`: biblioteca de PDFs (`/reports`) — filtros SERVER-SIDE
 * condicionales (query string exacta, un filtro vacío no añade parámetro), paginación
 * CLIENT-SIDE sin volver a llamar al back, resolución del nombre del deportista con
 * fallback `Atleta #id`, acciones de generación solo ADMIN/COACH (C5, C9, C11).
 */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

afterEach(cleanup);

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

function athlete(id: number, fullName: string): AthleteResponse {
  return {
    id,
    username: `user${id}`,
    email: `user${id}@athletecore.test`,
    firstName: "Nombre",
    lastName: fullName,
    fullName,
    birthDate: null,
    photoUrl: null,
    active: true,
  };
}

const ATHLETES = [athlete(7, "Michael Phelps"), athlete(8, "Katie Ledecky")];

function report(overrides: Partial<ReportResponse> & { id: number }): ReportResponse {
  return {
    reportType: "INDIVIDUAL",
    athleteId: null,
    category: null,
    year: null,
    month: null,
    title: `Reporte ${overrides.id}`,
    status: "GENERATED",
    errorMessage: null,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:01Z",
    active: true,
    ...overrides,
  };
}

/** Listado paginado de deportistas (lo consume `fetchAllAthletes`). */
const ATHLETES_PAGE = { content: ATHLETES, last: true, totalElements: ATHLETES.length };

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/reports"]}>
      <ReportsLibraryPage />
    </MemoryRouter>,
    { wrapper },
  );
}

function requestedPaths(): string[] {
  return apiFetchMock.mock.calls.map(([path]) => path as string);
}

function postCalls(): number {
  return apiFetchMock.mock.calls.filter(([, options]) => options?.method === "POST").length;
}

const mixedReports: ReportResponse[] = [
  report({
    id: 7,
    athleteId: 7,
    year: 2026,
    month: 3,
    title: "Informe marzo",
    status: "GENERATED",
  }),
  report({
    id: 8,
    reportType: "GENERAL",
    category: "JUVENIL",
    title: "Equipo juvenil Q1",
    status: "FAILED",
    errorMessage: "El atleta no tiene chequeos registrados",
  }),
  report({ id: 9, athleteId: 99, title: "Sin nombre en la lista", status: "PENDING" }),
];

function installLibraryRoutes(reports: ReportResponse[] = mixedReports) {
  installApiRoutes([
    { match: /^\/reports(\?.+)?$/, resolve: reports },
    { match: /^\/athletes\?/, resolve: ATHLETES_PAGE },
  ]);
}

describe("ReportsLibraryPage — filtros, lista y paginación (C5, C9, C11)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("sin filtros llama a /reports sin query params y resuelve el objetivo de cada tipo", async () => {
    signInAs(["ADMIN"]);
    installLibraryRoutes();

    renderPage();

    const list = await screen.findByTestId("reports-list");
    expect(screen.getByTestId("reports-library-page")).toBeInTheDocument();
    expect(screen.getByTestId("reports-tabs")).toBeInTheDocument();

    // Query string CONDICIONAL: sin filtros el path es exactamente "/reports".
    expect(requestedPaths().filter((path) => path === "/reports")).toHaveLength(1);
    expect(requestedPaths().some((path) => path.startsWith("/athletes?page=0&size=100"))).toBe(true);

    // Individual → nombre del deportista (resuelto desde el listado).
    const individual = within(list).getByTestId("report-row-7");
    expect(within(individual).getByText("Informe marzo")).toBeInTheDocument();
    expect(within(individual).getByText("Individual")).toBeInTheDocument();
    expect(within(individual).getByText("Michael Phelps")).toBeInTheDocument();
    // Período solo con year/month.
    expect(within(individual).getByText("Marzo 2026")).toBeInTheDocument();
    expect(within(individual).getByText("Generado")).toBeInTheDocument();
    expect(within(individual).getByText(formatInstantDate("2026-09-01T10:00:00Z"))).toBeInTheDocument();
    expect(within(individual).getByRole("link", { name: "Ver" })).toHaveAttribute(
      "href",
      "/reports/7",
    );

    // General → "General · categoría".
    const general = within(list).getByTestId("report-row-8");
    expect(within(general).getByText("General")).toBeInTheDocument();
    expect(within(general).getByText("General · Juvenil")).toBeInTheDocument();
    expect(within(general).getByText("Fallido")).toBeInTheDocument();
    // Sin year/month la celda de período queda vacía.
    expect(within(general).getByText("—")).toBeInTheDocument();

    // Deportista que no está en el listado → id como dato técnico (D4).
    const unknown = within(list).getByTestId("report-row-9");
    expect(within(unknown).getByText("Atleta #99")).toBeInTheDocument();
    expect(within(unknown).getByText("Pendiente")).toBeInTheDocument();
  });

  it("omite la columna Período cuando ningún reporte trae year/month", async () => {
    signInAs(["COACH"]);
    installLibraryRoutes([report({ id: 1, title: "Sin período" })]);

    renderPage();
    await screen.findByTestId("reports-list");

    expect(screen.queryByRole("columnheader", { name: "Período" })).not.toBeInTheDocument();
  });

  it("filtros combinados: pide ?type=INDIVIDUAL&status=GENERATED sin athleteId", async () => {
    signInAs(["ADMIN"]);
    installLibraryRoutes();

    renderPage();
    await screen.findByTestId("reports-list");

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId("reports-filter-type"), "INDIVIDUAL");
    await waitFor(() =>
      expect(requestedPaths()).toContain("/reports?type=INDIVIDUAL"),
    );

    await user.selectOptions(screen.getByTestId("reports-filter-status"), "GENERATED");
    await waitFor(() =>
      expect(requestedPaths()).toContain("/reports?type=INDIVIDUAL&status=GENERATED"),
    );
    expect(requestedPaths().some((path) => path.includes("athleteId"))).toBe(false);
  });

  it("filtro de deportista: añade athleteId y lo quita al volver a «Todos los deportistas»", async () => {
    signInAs(["ADMIN"]);
    installLibraryRoutes();

    renderPage();
    await screen.findByTestId("reports-list");

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId("reports-filter-athlete"), "8");
    await waitFor(() => expect(requestedPaths()).toContain("/reports?athleteId=8"));

    await user.selectOptions(screen.getByTestId("reports-filter-athlete"), "");
    await waitFor(() => expect(requestedPaths().filter((p) => p === "/reports")).toHaveLength(2));
  });

  it("pagina en cliente (pageSize 10) sin volver a llamar al back", async () => {
    signInAs(["ADMIN"]);
    const reports = Array.from({ length: 25 }, (_, index) =>
      report({ id: index + 1, title: `Reporte ${String(index + 1).padStart(2, "0")}` }),
    );
    installLibraryRoutes(reports);

    renderPage();
    const list = await screen.findByTestId("reports-list");

    // Página 1: los 10 primeros.
    expect(within(list).getByTestId("report-row-1")).toBeInTheDocument();
    expect(within(list).getByTestId("report-row-10")).toBeInTheDocument();
    expect(within(list).queryByTestId("report-row-11")).not.toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 3 · 25 reportes en total/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("reports-pagination-next"));

    // Página 2: los siguientes 10, SIN nueva petición al back.
    expect(within(list).getByTestId("report-row-11")).toBeInTheDocument();
    expect(within(list).getByTestId("report-row-20")).toBeInTheDocument();
    expect(within(list).queryByTestId("report-row-21")).not.toBeInTheDocument();
    expect(within(list).queryByTestId("report-row-1")).not.toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 3 · 25 reportes en total/)).toBeInTheDocument();
    expect(requestedPaths().filter((path) => path === "/reports")).toHaveLength(1);

    await user.click(screen.getByTestId("reports-pagination-prev"));
    expect(within(list).getByTestId("report-row-1")).toBeInTheDocument();
    expect(requestedPaths().filter((path) => path === "/reports")).toHaveLength(1);
  });

  it("cambiar un filtro vuelve a la primera página", async () => {
    signInAs(["ADMIN"]);
    const reports = Array.from({ length: 25 }, (_, index) => report({ id: index + 1 }));
    installLibraryRoutes(reports);

    renderPage();
    await screen.findByTestId("reports-list");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("reports-pagination-next"));
    expect(await screen.findByTestId("report-row-11")).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("reports-filter-status"), "GENERATED");
    await waitFor(() => expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument());
  });

  it("lista vacía: estado vacío con CTA para ADMIN/COACH", async () => {
    signInAs(["COACH"]);
    installLibraryRoutes([]);

    renderPage();

    const empty = await screen.findByTestId("reports-library-empty");
    expect(within(empty).getByText("Sin reportes")).toBeInTheDocument();
    expect(within(empty).getByTestId("report-new-empty")).toBeInTheDocument();
    expect(screen.getByTestId("report-new-button")).toBeInTheDocument();
  });

  it("USER: solo lectura, sin «Generar reporte» ni CTA en el estado vacío", async () => {
    signInAs(["USER"]);
    installLibraryRoutes([]);

    renderPage();

    await screen.findByTestId("reports-library-empty");
    const page = screen.getByTestId("reports-library-page");
    expect(within(page).queryByTestId("report-new-button")).not.toBeInTheDocument();
    expect(within(page).queryByTestId("report-new-empty")).not.toBeInTheDocument();
    expect(within(page).queryByRole("button", { name: /generar/i })).not.toBeInTheDocument();
  });

  it("USER ve la lista completa en solo lectura (columnas y acciones de ver)", async () => {
    signInAs(["USER"]);
    installLibraryRoutes();

    renderPage();

    const list = await screen.findByTestId("reports-list");
    expect(within(list).getByTestId("report-row-7")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("reports-library-page")).queryByTestId("report-new-button"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-form")).not.toBeInTheDocument();
    expect(postCalls()).toBe(0);
  });

  it("estado de error con reintento que vuelve a pedir la lista", async () => {
    signInAs(["ADMIN"]);
    let fail = true;
    installApiRoutes([
      {
        match: /^\/reports(\?.+)?$/,
        resolve: () => (fail ? Promise.reject(new Error("network down")) : Promise.resolve(mixedReports)),
      },
      { match: /^\/athletes\?/, resolve: ATHLETES_PAGE },
    ]);

    renderPage();

    const error = await screen.findByTestId("reports-library-error");
    expect(within(error).getByText("No se pudo cargar la biblioteca")).toBeInTheDocument();

    const user = userEvent.setup();
    fail = false;
    await user.click(within(error).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("reports-list")).toBeInTheDocument();
  });
});
