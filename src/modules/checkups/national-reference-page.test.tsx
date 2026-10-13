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
import { groupReferences, NationalReferencePage } from "./national-reference-page";
import {
  isReferenceDuplicate,
  validateReferenceLocally,
} from "./reference-form";

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
    sub: "admin",
    roles: roles.map((role) => `ROLE_${role}`),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encoded = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  return `.${encoded}.`;
}

function signInAsAdmin() {
  useSessionStore.setState({
    tokens: { access: tokenWithRoles(["ADMIN"]) },
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
    <MemoryRouter initialEntries={["/tabla-nacional"]}>
      <Routes>
        <Route path="/tabla-nacional" element={<NationalReferencePage />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

function referenceOf(
  id: number,
  style: string,
  distance: number,
  category: string,
  position: number,
  timeFormatted: string,
) {
  const whole = timeFormatted.split(":");
  const seconds = whole.length === 2
    ? Number(whole[0]) * 60 + Number(whole[1])
    : Number(whole[0]) * 3600 + Number(whole[1]) * 60 + Number(whole[2]);
  return { id, style, distance, category, position, timeSeconds: seconds, timeFormatted };
}

// LIBRE 100 JUVENIL completo (oro/plata/bronce) + ESPALDA 50 MAYOR incompleto (solo 1 y 2).
const flatReferences = [
  referenceOf(7, "LIBRE", 100, "JUVENIL", 3, "01:03.300"),
  referenceOf(5, "LIBRE", 100, "JUVENIL", 1, "01:00.000"),
  referenceOf(6, "LIBRE", 100, "JUVENIL", 2, "01:01.500"),
  referenceOf(8, "ESPALDA", 50, "MAYOR", 1, "00:28.000"),
  referenceOf(9, "ESPALDA", 50, "MAYOR", 2, "00:29.000"),
];

describe("groupReferences — agrupación en memoria (C9)", () => {
  it("agrupa por (style, distance, category) con 3 celdas y detecta el triple incompleto", () => {
    const groups = groupReferences(flatReferences);

    expect(groups).toHaveLength(2);

    const libre = groups.find((g) => g.style === "LIBRE");
    const espalda = groups.find((g) => g.style === "ESPALDA");
    expect(libre?.complete).toBe(true);
    expect(libre?.cells.map((cell) => cell?.timeFormatted)).toEqual([
      "01:00.000",
      "01:01.500",
      "01:03.300",
    ]);
    expect(espalda?.complete).toBe(false);
    expect(espalda?.cells[2]).toBeNull();
  });

  it("orden estable: style → distance → category", () => {
    const groups = groupReferences([
      referenceOf(1, "MARIPOSA", 100, "MAYOR", 1, "01:00.000"),
      referenceOf(2, "BRAZA", 200, "JUVENIL", 1, "02:30.000"),
      referenceOf(3, "BRAZA", 50, "INFANTIL", 1, "00:30.000"),
      referenceOf(4, "BRAZA", 50, "MAYOR", 1, "00:29.000"),
      referenceOf(5, "LIBRE", 200, "JUVENIL", 1, "02:00.000"),
    ]);

    expect(groups.map((g) => `${g.style}|${g.distance}|${g.category}`)).toEqual([
      "BRAZA|50|INFANTIL",
      "BRAZA|50|MAYOR",
      "BRAZA|200|JUVENIL",
      "LIBRE|200|JUVENIL",
      "MARIPOSA|100|MAYOR",
    ]);
  });
});

describe("validateReferenceLocally / isReferenceDuplicate (C5/C7)", () => {
  it("rechaza tiempo sin 3 decimales, posición fuera de 1–3 y tiempo = 0", () => {
    expect(validateReferenceLocally({ distance: "100", position: "2", time: "1:5.25" }).time).toMatch(
      /Formato esperado/,
    );
    expect(validateReferenceLocally({ distance: "100", position: "4", time: "01:02.500" }).position).toMatch(
      /entre 1 y 3/,
    );
    expect(validateReferenceLocally({ distance: "0", position: "1", time: "01:02.500" }).distance).toMatch(
      /entero mayor o igual que 1/,
    );
    // El contrato exige timeSeconds > 0 (@DecimalMin inclusive = false, doc 06).
    expect(validateReferenceLocally({ distance: "100", position: "1", time: "0:00.000" }).time).toMatch(
      /mayor que 0/,
    );
  });

  it("duplicado (style, distance, category, position) contra la lista", () => {
    expect(
      isReferenceDuplicate(
        { style: "LIBRE", distance: 100, category: "JUVENIL", position: 1 },
        flatReferences,
      ),
    ).toBe(true);
    expect(
      isReferenceDuplicate(
        { style: "LIBRE", distance: 100, category: "JUVENIL", position: 1 },
        flatReferences,
        5,
      ),
    ).toBe(false);
  });
});

describe("NationalReferencePage — matriz (solo ADMIN)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("filas agrupadas con celdas timeFormatted y aviso de triple incompleto", async () => {
    signInAsAdmin();
    installApiRoutes([
      { match: /^\/national-reference-times$/, resolve: flatReferences },
    ]);

    renderPage();

    const matrix = await screen.findByTestId("reference-matrix");
    expect(within(matrix).getByTestId("reference-cell-LIBRE|100|JUVENIL-1")).toHaveTextContent("01:00.000");
    expect(within(matrix).getByTestId("reference-cell-LIBRE|100|JUVENIL-3")).toHaveTextContent("01:03.300");

    const warning = screen.getByTestId("reference-incomplete-warning-ESPALDA|50|MAYOR");
    expect(warning).toHaveTextContent(/Triple incompleto/);
    // La fila completa no lleva aviso.
    expect(screen.queryByTestId("reference-incomplete-warning-LIBRE|100|JUVENIL")).not.toBeInTheDocument();
  });

  it("filtros en cliente por estilo y categoría SIN nueva llamada", async () => {
    signInAsAdmin();
    installApiRoutes([
      { match: /^\/national-reference-times$/, resolve: flatReferences },
    ]);

    renderPage();
    await screen.findByTestId("reference-matrix");
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId("reference-filter-style"), { target: { value: "ESPALDA" } });
    fireEvent.change(screen.getByTestId("reference-filter-category"), { target: { value: "MAYOR" } });

    // Solo la fila ESPALDA 50 MAYOR sigue visible (y su aviso).
    await waitFor(() =>
      expect(screen.getByTestId("reference-row-ESPALDA|50|MAYOR")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("reference-row-LIBRE|100|JUVENIL")).not.toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // sin refetch

    fireEvent.change(screen.getByTestId("reference-filter-style"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("reference-filter-category"), { target: { value: "" } });
    expect(await screen.findByTestId("reference-row-LIBRE|100|JUVENIL")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("editar celda → PUT COMPLETO con los 5 campos y la matriz se refresca", async () => {
    signInAsAdmin();
    installApiRoutes([
      { match: /^\/national-reference-times$/, method: "GET" as const, resolve: flatReferences },
      { match: /^\/national-reference-times\/6$/, method: "PUT" as const, resolve: { id: 6 } },
    ]);

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("reference-edit-LIBRE|100|JUVENIL-2"));
    await screen.findByTestId("reference-form");

    // Los campos bloqueados vienen pre-cargados; solo se edita el tiempo.
    expect(screen.getByTestId("reference-form-style")).toBeDisabled();
    expect(screen.getByTestId("reference-form-distance")).toBeDisabled();
    expect(screen.getByTestId("reference-form-category")).toBeDisabled();
    expect(screen.getByTestId("reference-form-position")).toBeDisabled();

    fireEvent.change(screen.getByTestId("reference-form-time"), { target: { value: "01:02.500" } });
    await user.click(screen.getByTestId("reference-form-submit"));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/national-reference-times/6", {
        method: "PUT",
        body: { style: "LIBRE", distance: 100, category: "JUVENIL", position: 2, timeSeconds: 62.5 },
      }),
    );
  });

  it("alta de combinación nueva con los 5 campos editables; duplicado bloqueado localmente", async () => {
    signInAsAdmin();
    installApiRoutes([
      { match: /^\/national-reference-times$/, method: "GET" as const, resolve: flatReferences },
    ]);

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("reference-new-button"));
    await screen.findByTestId("reference-form");

    expect(screen.getByTestId("reference-form-style")).toBeEnabled();

    // Seleccionar una combinación que ya existe (LIBRE 100 JUVENIL posición 1).
    await user.click(screen.getByTestId("reference-form-style"));
    await user.click(await screen.findByRole("option", { name: "Libre" }));
    fireEvent.change(screen.getByTestId("reference-form-distance"), { target: { value: "100" } });
    await user.click(screen.getByTestId("reference-form-category"));
    await user.click(await screen.findByRole("option", { name: "Juvenil" }));
    await user.click(screen.getByTestId("reference-form-position"));
    await user.click(await screen.findByRole("option", { name: "Oro (1º)" }));
    fireEvent.change(screen.getByTestId("reference-form-time"), { target: { value: "01:00.000" } });
    await user.click(screen.getByTestId("reference-form-submit"));

    expect(await screen.findByTestId("reference-form-duplicate")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // sin POST
  });

  it("borrar celda: cancelar no llama al back; confirmar hace DELETE (204)", async () => {
    signInAsAdmin();
    installApiRoutes([
      { match: /^\/national-reference-times$/, method: "GET" as const, resolve: flatReferences },
      { match: /^\/national-reference-times\/6$/, method: "DELETE" as const, resolve: undefined },
    ]);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("reference-delete-LIBRE|100|JUVENIL-2"));
    const dialog = await screen.findByTestId("reference-delete-confirm");

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByTestId("reference-delete-confirm")).not.toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("reference-delete-LIBRE|100|JUVENIL-2"));
    await user.click(
      within(await screen.findByTestId("reference-delete-confirm")).getByRole("button", {
        name: "Borrar referencia",
      }),
    );

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/national-reference-times/6", { method: "DELETE" }),
    );
  });

  it("409 residual en alta mapeado al mensaje seguro (C5)", async () => {
    signInAsAdmin();
    installApiRoutes([
      { match: /^\/national-reference-times$/, method: "GET" as const, resolve: flatReferences },
      {
        match: /^\/national-reference-times$/,
        method: "POST" as const,
        resolve: () =>
          Promise.reject(
            apiErrorWith(
              409,
              "NationalReferenceTime with style/distance/category/position already exists",
            ),
          ),
      },
    ]);

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("reference-new-button"));
    await screen.findByTestId("reference-form");

    // Combinación NUEVA (no duplicada en cliente): BRAZA 50 INFANTIL posición 1.
    await user.click(screen.getByTestId("reference-form-style"));
    await user.click(await screen.findByRole("option", { name: "Braza" }));
    fireEvent.change(screen.getByTestId("reference-form-distance"), { target: { value: "50" } });
    await user.click(screen.getByTestId("reference-form-category"));
    await user.click(await screen.findByRole("option", { name: "Infantil" }));
    await user.click(screen.getByTestId("reference-form-position"));
    await user.click(await screen.findByRole("option", { name: "Oro (1º)" }));
    fireEvent.change(screen.getByTestId("reference-form-time"), { target: { value: "00:40.000" } });
    await user.click(screen.getByTestId("reference-form-submit"));

    const error = await screen.findByTestId("reference-form-error");
    expect(
      within(error).getByText("Ya existe una referencia para ese estilo, distancia, categoría y posición"),
    ).toBeInTheDocument();
  });

  it("estados: vacío y error con reintento", async () => {
    signInAsAdmin();
    installApiRoutes([{ match: /^\/national-reference-times$/, resolve: [] }]);

    renderPage();
    expect(await screen.findByTestId("reference-empty")).toBeInTheDocument();
  });

  it("estado de error con reintento que vuelve a llamar al back", async () => {
    signInAsAdmin();
    let fail = true;
    installApiRoutes([
      {
        match: /^\/national-reference-times$/,
        resolve: () =>
          fail ? Promise.reject(new Error("network down")) : Promise.resolve(flatReferences),
      },
    ]);

    renderPage();
    const errorState = await screen.findByTestId("reference-error");
    const user = userEvent.setup();
    fail = false;
    await user.click(within(errorState).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("reference-matrix")).toBeInTheDocument();
  });
});
