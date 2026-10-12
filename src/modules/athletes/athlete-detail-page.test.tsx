// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";
import type { AthleteProfileResponse, AthleteResponse, SportResponse } from "@/lib/api/types";

import { AthleteDetailPage } from "./athlete-detail-page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

// Sin `globals: true` en Vitest no hay auto-cleanup del DOM entre tests.
afterEach(cleanup);

const athlete: AthleteResponse = {
  id: 7,
  username: "mphelps",
  email: "mphelps@club.com",
  firstName: "Michael",
  lastName: "Phelps",
  fullName: "Michael Phelps",
  birthDate: "1985-06-30",
  photoUrl: null,
  active: true,
};

const sportsCatalog: SportResponse[] = [
  { id: 1, name: "Natación", description: null, active: true, disciplineIds: [10, 11] },
  { id: 2, name: "Atletismo", description: null, active: true, disciplineIds: [] },
];

function mockBackend(overrides: {
  profile?: AthleteProfileResponse | "404" | "error";
  sportIds?: number[];
  delete?: "ok";
} = {}) {
  apiFetchMock.mockImplementation(async (path, options) => {
    if (path === "/athletes/7") {
      if (options?.method === "DELETE") {
        if (overrides.delete === "ok") {
          return undefined;
        }
        throw new Error("DELETE no debería llamarse en este test");
      }
      return athlete;
    }
    if (path === "/athletes/7/profile") {
      if (overrides.profile === "404") {
        throw new ApiError(404, { status: 404, error: "Not Found", message: "Perfil no encontrado" });
      }
      if (overrides.profile === "error") {
        throw new ApiError(500, { status: 500, error: "Internal Server Error", message: "Boom" });
      }
      return (
        overrides.profile ?? {
          id: 3,
          weightKgs: 79.5,
          heightCm: 193,
          armSpanCm: null,
          bmi: null,
          bmiCategory: null,
          notes: null,
          isComplete: false,
        }
      );
    }
    if (path === "/athletes/7/sports") {
      return overrides.sportIds ?? [];
    }
    if (path === "/athletes/sports") {
      return sportsCatalog;
    }
    throw new Error(`Endpoint inesperado en el test: ${path}`);
  });
}

function DetailRoutes() {
  return (
    <MemoryRouter initialEntries={["/athletes/7"]}>
      <Routes>
        <Route path="/athletes" element={<div data-testid="athletes-list-mock" />} />
        <Route path="/athletes/:id" element={<AthleteDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("AthleteDetailPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("con 404 de perfil muestra 'Sin perfil registrado' sin tratarlo como error", async () => {
    mockBackend({ profile: "404", sportIds: [1] });
    const { wrapper } = renderDetail();
    render(<DetailRoutes />, { wrapper });

    expect(await screen.findByText("Sin perfil registrado")).toBeInTheDocument();
    expect(screen.queryByTestId("athlete-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("athlete-profile-empty")).toBeInTheDocument();
  });

  it("con bmi/bmiCategory en null muestra 'no disponible', nunca un cálculo local", async () => {
    mockBackend({ profile: { id: 3, weightKgs: 79.5, heightCm: 193, armSpanCm: 203, bmi: null, bmiCategory: null, notes: null, isComplete: true } });
    const { wrapper } = renderDetail();
    render(<DetailRoutes />, { wrapper });

    expect(await screen.findByTestId("athlete-profile-bmi-value")).toHaveTextContent("no disponible");
    expect(screen.getByTestId("athlete-profile-bmi-category-value")).toHaveTextContent("no disponible");
    expect(screen.getByText("Michael Phelps")).toBeInTheDocument();
  });

  it("con 404 de atleta muestra 'Deportista no encontrado'", async () => {
    apiFetchMock.mockImplementation(async (path) => {
      if (path === "/athletes/7") {
        throw new ApiError(404, { status: 404, error: "Not Found", message: "No existe" });
      }
      throw new Error(`Endpoint inesperado en el test: ${path}`);
    });
    const { wrapper } = renderDetail();
    render(<DetailRoutes />, { wrapper });

    expect(await screen.findByTestId("athlete-not-found")).toBeInTheDocument();
  });

  it("el selector de deportes deshabilita guardar con la selección vacía (mín. 1)", async () => {
    mockBackend({ profile: "404", sportIds: [1] });
    const user = userEvent.setup();
    const { wrapper } = renderDetail();
    render(<DetailRoutes />, { wrapper });

    await screen.findByText("Michael Phelps");
    await user.click(screen.getByTestId("athlete-sports-edit"));

    const saveButton = await screen.findByTestId("athlete-sports-save");
    await waitFor(() => expect(saveButton).toBeEnabled());

    // Quitar el único deporte asignado → 0 seleccionados → guardar bloqueado.
    await user.click(screen.getByTestId("athlete-sports-toggle-1"));
    expect(saveButton).toBeDisabled();
    expect(screen.getByTestId("athlete-sports-range-error")).toBeInTheDocument();
  });

  it("resuelve los nombres de deportes cruzando con el catálogo y muestra disciplinas como IDs (D4)", async () => {
    mockBackend({ profile: "404", sportIds: [1] });
    const { wrapper } = renderDetail();
    render(<DetailRoutes />, { wrapper });

    expect(await screen.findByText("Natación")).toBeInTheDocument();
    expect(screen.getByText("Disciplinas (IDs): 10, 11")).toBeInTheDocument();
  });

  it("borrado: cancelar el AlertDialog no llama al back", async () => {
    const user = userEvent.setup();
    mockBackend({ profile: "404", sportIds: [1] });
    const { wrapper } = renderDetail();
    render(<DetailRoutes />, { wrapper });

    await screen.findByText("Michael Phelps");
    await user.click(screen.getByTestId("athlete-delete-button"));
    expect(await screen.findByText("¿Eliminar deportista?")).toBeInTheDocument();
    expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("athlete-delete-cancel"));
    await waitFor(() =>
      expect(screen.queryByText("¿Eliminar deportista?")).not.toBeInTheDocument(),
    );

    const deleteCalls = apiFetchMock.mock.calls.filter(([, options]) => options?.method === "DELETE");
    expect(deleteCalls).toHaveLength(0);
  });

  it("borrado: confirmar llama a DELETE y navega a la lista", async () => {
    const user = userEvent.setup();
    mockBackend({ profile: "404", sportIds: [1], delete: "ok" });
    const { wrapper } = renderDetail();
    render(<DetailRoutes />, { wrapper });

    await screen.findByText("Michael Phelps");
    await user.click(screen.getByTestId("athlete-delete-button"));
    await user.click(await screen.findByTestId("athlete-delete-confirm"));

    await waitFor(() => expect(screen.getByTestId("athletes-list-mock")).toBeInTheDocument());

    const deleteCalls = apiFetchMock.mock.calls.filter(([path, options]) => path === "/athletes/7" && options?.method === "DELETE");
    expect(deleteCalls).toHaveLength(1);
  });
});
