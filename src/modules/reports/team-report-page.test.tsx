// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type {
  Classification,
  TeamAthleteEntry,
  TeamReportEntry,
  TeamReportResponse,
} from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";

import { installApiRoutes } from "./test-utils";
import { TeamReportPage } from "./team-report-page";

/*
 * Fase 4 de `integrar-reportes`: reporte de equipo (`/reports/equipo`) — filtro de
 * categoría SERVER-SIDE, render tal cual del back con ranking ordenado por
 * `bestTimeSeconds`, badges de clasificación del servidor y lectura para cualquier
 * rol (COACH/USER incluidos). C4, C9, C11.
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/reports/equipo"]}>
      <TeamReportPage />
    </MemoryRouter>,
    { wrapper },
  );
}

function athlete(
  athleteId: number,
  classification: Classification,
  bestTimeSeconds: number,
  bestTimeFormatted: string,
  diffVsBronzeFormatted: string,
): TeamAthleteEntry {
  return {
    athleteId,
    athleteFullName: `Deportista ${athleteId}`,
    bestTimeSeconds,
    bestTimeFormatted,
    classification,
    diffVsBronzeSeconds: -1,
    diffVsBronzeFormatted,
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

/** Desordenado por tiempo a propósito: el front ordena por `bestTimeSeconds` asc. */
const unsortedEntry = entry("LIBRE", 100, "JUVENIL", [
  athlete(11, "FUERA_DE_RANGO", 70.1, "01:10.100", "+00:04.850"),
  athlete(12, "POR_ENCIMA_DEL_PODIO", 65.25, "01:05.250", "-00:00.000"),
  athlete(13, "CERCANO_A_MEDALLERIA", 68.0, "01:08.000", "+00:02.750"),
]);

const juvenileReport: TeamReportResponse = {
  category: "JUVENIL",
  entries: [
    unsortedEntry,
    entry("ESPALDA", 200, "JUVENIL", [athlete(14, "FUERA_DE_RANGO", 150.4, "02:30.400", "+00:12.400")]),
  ],
};

const allCategoriesReport: TeamReportResponse = {
  category: null,
  entries: [unsortedEntry, entry("LIBRE", 50, "MAYOR", [athlete(15, "CERCANO_A_MEDALLERIA", 28.4, "00:28.400", "+00:01.900")])],
};

function installRoutes() {
  installApiRoutes([
    { match: /^\/reports\/team$/, resolve: allCategoriesReport },
    { match: /^\/reports\/team\?category=JUVENIL$/, resolve: juvenileReport },
  ]);
}

describe("TeamReportPage (C4, C9, C11)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("con «Todas» llama sin query params y renderiza las entradas del servidor", async () => {
    signInAs(["COACH"]);
    installRoutes();

    renderPage();

    const entries = await screen.findByTestId("team-report-entries");
    expect(within(entries).getByTestId("team-report-entry-LIBRE-100-JUVENIL")).toBeInTheDocument();
    expect(within(entries).getByTestId("team-report-entry-LIBRE-50-MAYOR")).toBeInTheDocument();

    // Cabecera de la prueba: labels de presentación (nunca el enum crudo).
    expect(within(entries).getByText("Libre 100m · Juvenil")).toBeInTheDocument();
    expect(within(entries).getByText("Libre 50m · Mayor")).toBeInTheDocument();
    expect(within(entries).getByText("3 deportistas")).toBeInTheDocument();

    expect(apiFetchMock.mock.calls.map(([path]) => path)).toEqual(["/reports/team"]);
  });

  it("seleccionar JUVENIL pide ?category=JUVENIL y solo muestra esa categoría", async () => {
    signInAs(["COACH"]);
    installRoutes();

    renderPage();
    await screen.findByTestId("team-report-entries");

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId("team-report-filter-category"), "JUVENIL");

    const entries = await screen.findByTestId("team-report-entries");
    expect(within(entries).getByTestId("team-report-entry-ESPALDA-200-JUVENIL")).toBeInTheDocument();
    expect(within(entries).queryByTestId("team-report-entry-LIBRE-50-MAYOR")).not.toBeInTheDocument();

    expect(apiFetchMock.mock.calls.map(([path]) => path)).toContain("/reports/team?category=JUVENIL");
  });

  it("ranking ordenado por bestTimeSeconds asc con los strings del servidor", async () => {
    signInAs(["USER"]);
    installRoutes();

    renderPage();

    const entries = await screen.findByTestId("team-report-entries");
    const entrySection = within(entries).getByTestId("team-report-entry-LIBRE-100-JUVENIL");
    const rows = within(entrySection).getAllByTestId(/^team-report-athlete-/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "team-report-athlete-12",
      "team-report-athlete-13",
      "team-report-athlete-11",
    ]);

    // Tiempos y diferencia vs bronce TAL CUAL del servidor + badge del servidor.
    const first = within(entrySection).getByTestId("team-report-athlete-12");
    expect(within(first).getByText("01:05.250")).toBeInTheDocument();
    expect(within(first).getByText("-00:00.000")).toBeInTheDocument();
    expect(within(first).getByText("Por encima del podio")).toBeInTheDocument();
    expect(within(entrySection).getByTestId("team-report-athlete-13")).toHaveTextContent(
      "Cercano a medallería",
    );
    expect(within(entrySection).getByTestId("team-report-athlete-11")).toHaveTextContent(
      "Fuera de rango",
    );
  });

  it("estado vacío cuando el back no trae entradas", async () => {
    signInAs(["COACH"]);
    installApiRoutes([{ match: /^\/reports\/team$/, resolve: { category: null, entries: [] } }]);

    renderPage();

    const empty = await screen.findByTestId("team-report-empty");
    expect(within(empty).getByText("Sin chequeos registrados")).toBeInTheDocument();
    expect(screen.queryByTestId("team-report-entries")).not.toBeInTheDocument();
  });

  it("error de carga: estado con reintento que vuelve a llamar al back", async () => {
    signInAs(["ADMIN"]);
    let fail = true;
    installApiRoutes([
      {
        match: /^\/reports\/team$/,
        resolve: () =>
          fail ? Promise.reject(new Error("network down")) : Promise.resolve(allCategoriesReport),
      },
    ]);

    renderPage();

    const error = await screen.findByTestId("team-report-error");
    expect(within(error).getByText("No se pudo cargar el reporte de equipo")).toBeInTheDocument();

    const user = userEvent.setup();
    fail = false;
    await user.click(within(error).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("team-report-entries")).toBeInTheDocument();
  });

  it.each([["COACH"], ["USER"]])("%s ve la página completa en solo lectura", async (role) => {
    signInAs([role]);
    installRoutes();

    renderPage();

    await screen.findByTestId("team-report-entries");
    const page = screen.getByTestId("team-report-page");
    expect(within(page).getByTestId("reports-tabs")).toBeInTheDocument();
    expect(within(page).getByTestId("team-report-filter-category")).toBeInTheDocument();
    expect(within(page).getByTestId("team-report-entries")).toBeInTheDocument();

    // C9: sin acciones de escritura y sin el tab de gestión (solo ADMIN).
    expect(
      within(page).queryByRole("button", { name: /generar|nuevo|borrar|eliminar|editar|pausar/i }),
    ).not.toBeInTheDocument();
    expect(within(page).queryByRole("tab", { name: "Programaciones" })).not.toBeInTheDocument();
  });

  it("ADMIN ve además el tab de programaciones en la sección", async () => {
    signInAs(["ADMIN"]);
    installRoutes();

    renderPage();

    const page = await screen.findByTestId("team-report-page");
    expect(within(page).getByRole("tab", { name: "Programaciones" })).toBeInTheDocument();
  });
});
