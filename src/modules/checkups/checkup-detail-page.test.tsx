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
import { CheckupDetailPage } from "./checkup-detail-page";

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

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/athletes/7/chequeos/20"]}>
      <Routes>
        <Route path="/athletes/:id/chequeos/:checkupId" element={<CheckupDetailPage />} />
        <Route path="/athletes/:id/chequeos" element={<div data-testid="checkups-list-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

const checkupDetail = {
  id: 20,
  athleteId: 7,
  year: 2026,
  month: 3,
  category: "JUVENIL",
  notes: "Chequeo de marzo",
  createdAt: "2026-03-05T10:15:00Z",
  updatedAt: "2026-03-05T10:15:00Z",
  active: true,
  times: [
    {
      id: 30,
      checkupId: 20,
      style: "LIBRE",
      distance: 100,
      timeSeconds: 65.25,
      timeFormatted: "01:05.250",
    },
  ],
};

const comparison = [
  {
    style: "LIBRE",
    distance: 100,
    category: "JUVENIL",
    trialTimeSeconds: 65.25,
    trialTimeFormatted: "01:05.250",
    positions: [
      {
        position: 1,
        referenceTimeSeconds: 60,
        referenceTimeFormatted: "01:00.000",
        absoluteDiffSeconds: 5.25,
        absoluteDiffFormatted: "+00:05.250",
        relativeDiffPercent: 8.75,
      },
      {
        position: 3,
        referenceTimeSeconds: 63.3,
        referenceTimeFormatted: "01:03.300",
        absoluteDiffSeconds: 1.95,
        absoluteDiffFormatted: "+00:01.950",
        relativeDiffPercent: 3.08,
      },
    ],
  },
];

function baseRoutes(overrides: Array<Parameters<typeof installApiRoutes>[0][number]> = []) {
  return [
    { match: /^\/checkups\/20$/, method: "GET" as const, resolve: checkupDetail },
    ...overrides,
  ];
}

describe("CheckupDetailPage — tiempos embebidos (C2)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("muestra timeFormatted del servidor tal cual, ordenado por timeSeconds", async () => {
    signInAs(["USER"]);
    installApiRoutes(
      baseRoutes(),
    );
    // Segundo tiempo con timeSeconds menor (orden del back distinto del numérico).
    installApiRoutes([
      {
        match: /^\/checkups\/20$/,
        method: "GET" as const,
        resolve: {
          ...checkupDetail,
          times: [
            { id: 31, checkupId: 20, style: "ESPALDA", distance: 50, timeSeconds: 28.5, timeFormatted: "00:28.500" },
            { id: 30, checkupId: 20, style: "LIBRE", distance: 100, timeSeconds: 65.25, timeFormatted: "01:05.250" },
          ],
        },
      },
    ]);

    renderDetail();

    const table = await screen.findByTestId("checkup-times-table");
    const rows = within(table).getAllByTestId(/^checkup-time-row-/);
    // Orden por timeSeconds numérico, nunca por el string formateado.
    expect(within(rows[0]).getByText("00:28.500")).toBeInTheDocument();
    expect(within(rows[1]).getByText("01:05.250")).toBeInTheDocument();
  });

  it("chequeo sin tiempos → estado vacío dentro de la tabla", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/checkups\/20$/, method: "GET" as const, resolve: { ...checkupDetail, times: [] } },
    ]);

    renderDetail();

    expect(await screen.findByTestId("checkup-times-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("checkup-times-table")).not.toBeInTheDocument();
  });

  it("USER NO ve botones de escritura (time-form ni delete) pero SÍ puede comparar (C3)", async () => {
    signInAs(["USER"]);
    installApiRoutes(baseRoutes());

    renderDetail();

    expect(await screen.findByTestId("checkup-detail-page")).toBeInTheDocument();
    expect(screen.queryByTestId("time-new-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("checkup-delete-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("comparison-button")).toBeInTheDocument();
  });
});

describe("TimeFormDialog — alta de tiempo (C2/C5)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  async function openTimeForm() {
    signInAs(["COACH"]);
    installApiRoutes(baseRoutes());
    renderDetail();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("time-new-button"));
    await screen.findByTestId("time-form-dialog");
    return user;
  }

  async function pickStyle(label: string) {
    const user = userEvent.setup();
    await user.click(screen.getByTestId("time-style-select"));
    await user.click(await screen.findByRole("option", { name: label }));
  }

  it("input 01:05.250 → POST con timeSeconds: 65.25 (número) y estilo en mayúsculas", async () => {
    const user = await openTimeForm();
    installApiRoutes([
      { match: /^\/checkups\/20$/, method: "GET" as const, resolve: checkupDetail },
      { match: /^\/checkups\/20\/times$/, method: "POST" as const, resolve: { id: 31 } },
    ]);

    await pickStyle("Braza");
    fireEvent.change(screen.getByTestId("time-distance-input"), { target: { value: "50" } });
    fireEvent.change(screen.getByTestId("time-input"), { target: { value: "01:05.250" } });
    await user.click(screen.getByTestId("time-submit-button"));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/checkups/20/times", {
        method: "POST",
        body: { style: "BRAZA", distance: 50, timeSeconds: 65.25 },
      }),
    );
  });

  it("input inválido (1:5.25) bloqueado sin llamar al back", async () => {
    const user = await openTimeForm();

    await pickStyle("Libre");
    fireEvent.change(screen.getByTestId("time-distance-input"), { target: { value: "100" } });
    fireEvent.change(screen.getByTestId("time-input"), { target: { value: "1:5.25" } });
    await user.click(screen.getByTestId("time-submit-button"));

    expect(await screen.findByText(/Formato esperado mm:ss.fff/)).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // solo el GET del detalle
  });

  it("tiempo 0:00.000 (timeSeconds = 0) bloqueado: el contrato exige > 0 (doc 06)", async () => {
    const user = await openTimeForm();

    await pickStyle("Libre");
    fireEvent.change(screen.getByTestId("time-distance-input"), { target: { value: "100" } });
    fireEvent.change(screen.getByTestId("time-input"), { target: { value: "0:00.000" } });
    await user.click(screen.getByTestId("time-submit-button"));

    expect(await screen.findByText("El tiempo debe ser mayor que 0")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // sin POST
  });

  it("duplicado (style, distance) prevalidado localmente contra detail.times", async () => {
    const user = await openTimeForm();

    await pickStyle("Libre");
    fireEvent.change(screen.getByTestId("time-distance-input"), { target: { value: "100" } });
    fireEvent.change(screen.getByTestId("time-input"), { target: { value: "00:59.000" } });
    await user.click(screen.getByTestId("time-submit-button"));

    const duplicate = await screen.findByTestId("time-form-duplicate");
    expect(duplicate).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // sin POST
  });

  it("409 residual mapeado al mensaje seguro (C5)", async () => {
    const user = await openTimeForm();
    installApiRoutes([
      { match: /^\/checkups\/20$/, method: "GET" as const, resolve: checkupDetail },
      {
        match: /^\/checkups\/20\/times$/,
        method: "POST" as const,
        resolve: () =>
          Promise.reject(
            apiErrorWith(409, "CheckupTime with checkupId/style/distance already exists"),
          ),
      },
    ]);

    await pickStyle("Espalda");
    fireEvent.change(screen.getByTestId("time-distance-input"), { target: { value: "50" } });
    fireEvent.change(screen.getByTestId("time-input"), { target: { value: "00:30.000" } });
    await user.click(screen.getByTestId("time-submit-button"));

    const error = await screen.findByTestId("time-form-error");
    expect(
      within(error).getByText("Ya existe un tiempo registrado para ese estilo y distancia en este chequeo"),
    ).toBeInTheDocument();
  });
});

describe("ComparisonPanel — comparación lazy (C8)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("NO hay llamada hasta pulsar el botón; al pulsar pide GET /checkups/{id}/comparison", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/checkups\/20$/, method: "GET" as const, resolve: checkupDetail },
      { match: /^\/checkups\/20\/comparison$/, resolve: comparison },
    ]);

    renderDetail();
    await screen.findByTestId("checkup-times-table");
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // solo el detalle

    const user = userEvent.setup();
    await user.click(screen.getByTestId("comparison-button"));

    const panel = await screen.findByTestId("comparison-panel");
    expect(within(panel).getByText("01:00.000")).toBeInTheDocument();
    expect(within(panel).getByText("+00:05.250")).toBeInTheDocument();
    expect(within(panel).getByText("8.75%")).toBeInTheDocument();
    expect(within(panel).getByText("Oro")).toBeInTheDocument();
    expect(within(panel).getByText("Bronce")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith("/checkups/20/comparison");
  });

  it("409 por triple incompleto → estado dedicado (no error genérico), enlace para ADMIN", async () => {
    signInAs(["ADMIN"]);
    installApiRoutes([
      { match: /^\/checkups\/20$/, method: "GET" as const, resolve: checkupDetail },
      {
        match: /^\/checkups\/20\/comparison$/,
        resolve: () =>
          Promise.reject(
            apiErrorWith(409, "No existe el triple completo para MARIPOSA 100m en categoría JUVENIL"),
          ),
      },
    ]);

    renderDetail();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("comparison-button"));

    const state = await screen.findByTestId("comparison-incomplete-state");
    expect(within(state).getByText("Referencia incompleta")).toBeInTheDocument();
    expect(within(state).getByRole("link", { name: "Ir a la tabla nacional" })).toBeInTheDocument();
    // Sin error genérico: el panel de fallo no aparece.
    expect(screen.queryByTestId("comparison-error")).not.toBeInTheDocument();
  });

  it("error genérico → estado con reintento", async () => {
    signInAs(["USER"]);
    installApiRoutes([
      { match: /^\/checkups\/20$/, method: "GET" as const, resolve: checkupDetail },
      {
        match: /^\/checkups\/20\/comparison$/,
        resolve: () => Promise.reject(new Error("network down")),
      },
    ]);

    renderDetail();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("comparison-button"));

    expect(await screen.findByTestId("comparison-error")).toBeInTheDocument();
  });
});

describe("Borrado del chequeo (T5/C4)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("cancelar no llama al back; confirmar hace DELETE y navega a la pestaña", async () => {
    signInAs(["ADMIN"]);
    installApiRoutes([
      { match: /^\/checkups\/20$/, method: "GET" as const, resolve: checkupDetail },
      { match: /^\/checkups\/20$/, method: "DELETE" as const, resolve: undefined },
    ]);

    renderDetail();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("checkup-delete-button"));

    const dialog = await screen.findByTestId("checkup-delete-confirm");
    // Copy explícita de la deuda T5 (C4).
    expect(within(dialog).getByText(/No se pueden editar chequeos ni tiempos/)).toBeInTheDocument();
    expect(within(dialog).getByText(/elimina todos sus tiempos/)).toBeInTheDocument();

    // Cancelar: sin DELETE y sin navegación.
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByTestId("checkup-delete-confirm")).not.toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // Confirmar: DELETE al recurso exacto y vuelta a la pestaña del atleta.
    await user.click(screen.getByTestId("checkup-delete-button"));
    await user.click(within(await screen.findByTestId("checkup-delete-confirm")).getByRole("button", { name: "Borrar chequeo" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/checkups/20", { method: "DELETE" }),
    );
    expect(await screen.findByTestId("checkups-list-mock")).toBeInTheDocument();
  });

  it("USER no ve el botón de borrado (C3)", async () => {
    signInAs(["USER"]);
    installApiRoutes(baseRoutes());

    renderDetail();

    expect(await screen.findByTestId("checkup-detail-page")).toBeInTheDocument();
    expect(screen.queryByTestId("checkup-delete-button")).not.toBeInTheDocument();
  });
});
