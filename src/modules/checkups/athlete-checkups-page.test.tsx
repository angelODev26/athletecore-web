// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";

import { installRadixPointerPolyfills } from "./test-setup";
import { installApiRoutes } from "./test-utils";
import { AthleteCheckupsPage } from "./athlete-checkups-page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

beforeAll(() => {
  installRadixPointerPolyfills();
});

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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/athletes/7/chequeos"]}>
      <Routes>
        <Route path="/athletes/:id/chequeos" element={<AthleteCheckupsPage />} />
        <Route path="/athletes/:id" element={<div data-testid="athlete-detail-mock" />} />
        <Route path="/athletes/:id/chequeos/:checkupId" element={<div data-testid="checkup-detail-mock" />} />
        <Route path="/tabla-nacional" element={<div data-testid="national-reference-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

const checkupMarch = {
  id: 20,
  athleteId: 7,
  year: 2026,
  month: 3,
  category: "JUVENIL",
  notes: "Chequeo de marzo",
  createdAt: "2026-03-05T10:15:00Z",
  updatedAt: "2026-03-05T10:15:00Z",
  active: true,
};

const projection = {
  style: "LIBRE",
  distance: 100,
  category: "JUVENIL",
  classification: "POR_ENCIMA_DEL_PODIO",
  timeSeconds: 58.4,
  timeFormatted: "00:58.400",
  diffVsBronzeSeconds: -2.1,
  diffVsBronzeFormatted: "-00:02.100",
};

describe("AthleteCheckupsPage — lista y filtros", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("carga la lista SIN query params al entrar sin filtros", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [checkupMarch] },
      { match: /^\/athletes\/7\/projections$/, resolve: [projection] },
    ]);

    renderPage();

    expect(await screen.findByText("Marzo 2026")).toBeInTheDocument();
    expect(await screen.findByTestId("projection-badge-0")).toBeInTheDocument();
  });

  it("filtra server-side: seleccionar año y mes re-consulta con ?year=&month=", async () => {
    signInAs(["USER"]);
    const seenPaths: string[] = [];
    installApiRoutes([
      {
        match: /^\/athletes\/7\/checkups/,
        resolve: (path: string) => {
          seenPaths.push(path);
          return Promise.resolve([checkupMarch]);
        },
      },
      { match: /^\/athletes\/7\/projections$/, resolve: [] },
    ]);

    renderPage();
    await screen.findByText("Marzo 2026");

    fireEvent.change(screen.getByTestId("checkups-filter-year"), { target: { value: "2026" } });

    await waitFor(() =>
      expect(seenPaths).toContain("/athletes/7/checkups?year=2026"),
    );

    fireEvent.change(screen.getByTestId("checkups-filter-month"), { target: { value: "3" } });

    await waitFor(() =>
      expect(seenPaths).toContain("/athletes/7/checkups?year=2026&month=3"),
    );
  });

  it("USER ve la lista pero NO ve checkup-new-button (C3)", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [checkupMarch] },
      { match: /^\/athletes\/7\/projections$/, resolve: [projection] },
    ]);

    renderPage();

    expect(await screen.findByTestId("checkups-list")).toBeInTheDocument();
    expect(screen.queryByTestId("checkup-new-button")).not.toBeInTheDocument();
  });

  it("lista vacía: estado vacío y CTA solo para ADMIN/COACH", async () => {
    signInAs(["COACH"]);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [] },
      { match: /^\/athletes\/7\/projections$/, resolve: [] },
    ]);

    renderPage();

    const emptyState = await screen.findByTestId("checkups-empty");
    expect(within(emptyState).getByTestId("checkup-new-empty")).toBeInTheDocument();
  });

  it("error de carga: estado con reintento que vuelve a llamar al back", async () => {
    signInAs(["ADMIN"]);
    let fail = true;
    installApiRoutes([
      {
        match: /^\/athletes\/7\/checkups$/,
        resolve: () => (fail ? Promise.reject(new Error("network down")) : Promise.resolve([checkupMarch])),
      },
      { match: /^\/athletes\/7\/projections$/, resolve: [] },
    ]);

    renderPage();

    const errorState = await screen.findByTestId("checkups-error");
    const user = userEvent.setup();
    fail = false;
    await user.click(within(errorState).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("checkups-list")).toBeInTheDocument();
    expect(screen.getByText("Marzo 2026")).toBeInTheDocument();
  });
});

describe("CheckupFormDialog — validación local y alta (C5)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  async function openFormAs(roles: string[]) {
    signInAs(roles);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [checkupMarch] },
      { match: /^\/athletes\/7\/projections$/, resolve: [projection] },
    ]);
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("checkup-new-button"));
    await screen.findByTestId("checkup-form-dialog");
    return user;
  }

  async function pickSelect(testId: string, optionLabel: string) {
    const user = userEvent.setup();
    await user.click(screen.getByTestId(testId));
    await user.click(await screen.findByRole("option", { name: optionLabel }));
  }

  it("año 1899 bloqueado: no llama al back", async () => {
    const user = await openFormAs(["COACH"]);

    await pickSelect("checkup-form-month", "Marzo");
    await pickSelect("checkup-form-category", "Juvenil");
    fireEvent.change(screen.getByTestId("checkup-form-year"), { target: { value: "1899" } });
    await user.click(screen.getByTestId("checkup-form-submit"));

    expect(await screen.findByText("El año debe estar entre 1900 y 2100")).toBeInTheDocument();
    expect(screen.queryByTestId("checkup-form-error")).not.toBeInTheDocument();
  });

  it("sin categoría seleccionada el envío se bloquea", async () => {
    const user = await openFormAs(["COACH"]);

    fireEvent.change(screen.getByTestId("checkup-form-year"), { target: { value: "2026" } });
    await user.click(screen.getByTestId("checkup-form-submit"));

    expect(await screen.findByText("Selecciona la categoría")).toBeInTheDocument();
  });

  it("duplicado (year, month, category) detectado en cliente contra la lista cargada", async () => {
    const user = await openFormAs(["COACH"]);

    await pickSelect("checkup-form-month", "Marzo");
    fireEvent.change(screen.getByTestId("checkup-form-year"), { target: { value: "2026" } });
    await pickSelect("checkup-form-category", "Juvenil");
    await user.click(screen.getByTestId("checkup-form-submit"));

    expect(await screen.findByTestId("checkup-form-duplicate")).toBeInTheDocument();
  });

  it("409 residual del back se muestra con el mensaje seguro mapeado (C5)", async () => {
    const user = await openFormAs(["ADMIN"]);

    // Duplicado de otra categoría: pasa la pre-validación local pero el back responde 409.
    await pickSelect("checkup-form-month", "Marzo");
    fireEvent.change(screen.getByTestId("checkup-form-year"), { target: { value: "2026" } });
    await pickSelect("checkup-form-category", "Mayor");
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, method: "GET", resolve: [checkupMarch] },
      { match: /^\/athletes\/7\/projections$/, resolve: [projection] },
      {
        match: /^\/athletes\/7\/checkups$/,
        method: "POST",
        resolve: () =>
          Promise.reject(
            apiErrorWith(409, "Checkup with athleteId/year/month/category already exists"),
          ),
      },
    ]);
    await user.click(screen.getByTestId("checkup-form-submit"));

    const error = await screen.findByTestId("checkup-form-error");
    expect(
      within(error).getByText("Ya existe un chequeo de ese año y mes para esta categoría"),
    ).toBeInTheDocument();
  });

  it("alta válida hace POST con body exacto (enums mayúsculas, athleteId de la ruta)", async () => {
    const user = await openFormAs(["COACH"]);

    await pickSelect("checkup-form-month", "Abril");
    fireEvent.change(screen.getByTestId("checkup-form-year"), { target: { value: "2026" } });
    await pickSelect("checkup-form-category", "Infantil");
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, method: "GET", resolve: [checkupMarch] },
      { match: /^\/athletes\/7\/projections$/, resolve: [projection] },
      { match: /^\/athletes\/7\/checkups$/, method: "POST", resolve: { id: 21 } },
    ]);
    await user.click(screen.getByTestId("checkup-form-submit"));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/athletes/7/checkups", {
        method: "POST",
        body: { athleteId: 7, year: 2026, month: 4, category: "INFANTIL" },
      }),
    );
  });
});

describe("ProjectionsPanel (C6)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("renderiza badges por classification y los valores tal cual del servidor", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [checkupMarch] },
      {
        match: /^\/athletes\/7\/projections$/,
        resolve: [
          { ...projection, classification: "POR_ENCIMA_DEL_PODIO" },
          { ...projection, classification: "CERCANO_A_MEDALLERIA", timeFormatted: "01:03.800" },
          { ...projection, classification: "FUERA_DE_RANGO", timeFormatted: "01:09.000" },
        ],
      },
    ]);

    renderPage();

    expect(await screen.findByTestId("projection-badge-0")).toHaveTextContent("Por encima del podio");
    expect(screen.getByTestId("projection-badge-1")).toHaveTextContent("Cercano a medallería");
    expect(screen.getByTestId("projection-badge-2")).toHaveTextContent("Fuera de rango");
    expect(screen.getByText("00:58.400")).toBeInTheDocument();
    expect(screen.getAllByText("-00:02.100").length).toBeGreaterThan(0);
  });

  it("array repetido (mismo style+distance en meses distintos) SIN desduplicar", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [checkupMarch] },
      {
        match: /^\/athletes\/7\/projections$/,
        resolve: [projection, { ...projection, timeFormatted: "00:59.900" }],
      },
    ]);

    renderPage();

    await screen.findByTestId("projection-badge-1");
    expect(screen.getByText("00:58.400")).toBeInTheDocument();
    expect(screen.getByText("00:59.900")).toBeInTheDocument();
  });

  it("409 por triple incompleto → estado dedicado con enlace a /tabla-nacional para ADMIN", async () => {
    signInAs(["ADMIN"]);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [checkupMarch] },
      {
        match: /^\/athletes\/7\/projections$/,
        resolve: () =>
          Promise.reject(
            apiErrorWith(409, "No existe el triple completo para LIBRE 100m en categoría JUVENIL"),
          ),
      },
    ]);

    renderPage();

    const state = await screen.findByTestId("projections-incomplete-state");
    expect(within(state).getByText("Referencia incompleta")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(state).getByRole("link", { name: "Ir a la tabla nacional" }));
    expect(await screen.findByTestId("national-reference-mock")).toBeInTheDocument();
  });

  it("409 por triple incompleto para USER: sin enlace a la matriz", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [checkupMarch] },
      {
        match: /^\/athletes\/7\/projections$/,
        resolve: () =>
          Promise.reject(
            apiErrorWith(409, "No existe el triple completo para LIBRE 100m en categoría JUVENIL"),
          ),
      },
    ]);

    renderPage();

    const state = await screen.findByTestId("projections-incomplete-state");
    expect(within(state).queryByRole("link")).not.toBeInTheDocument();
  });

  it("atleta sin chequeos → estado vacío del panel", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/athletes\/7\/checkups$/, resolve: [] },
      { match: /^\/athletes\/7\/projections$/, resolve: [] },
    ]);

    renderPage();

    expect(await screen.findByTestId("projections-empty")).toBeInTheDocument();
  });
});
