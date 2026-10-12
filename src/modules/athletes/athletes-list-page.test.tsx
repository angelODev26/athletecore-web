// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { AthleteResponse } from "@/lib/api/types";

import { AthletesListPage } from "./athletes-list-page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

// Sin `globals: true` en Vitest no hay auto-cleanup del DOM entre tests.
afterEach(cleanup);

function makeAthletes(count: number): AthleteResponse[] {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(2, "0");
    return {
      id: index + 1,
      username: `seed.pag.${n}`,
      email: `seed.pag.${n}@club.com`,
      firstName: "Seed",
      lastName: `Pagina${n}`,
      fullName: `Seed Pagina${n}`,
      birthDate: null,
      photoUrl: null,
      active: true,
    };
  });
}

/** Spring Page simulada por número de página (10 por página, como en la UI). */
function springPage(page: number, total: number) {
  const all = makeAthletes(total);
  return {
    content: all.slice(page * 10, page * 10 + 10),
    number: page,
    size: 10,
    totalElements: total,
  };
}

function ListRoutes() {
  return (
    <MemoryRouter initialEntries={["/athletes"]}>
      <Routes>
        <Route path="/athletes" element={<AthletesListPage />} />
        <Route path="/athletes/nuevo" element={<div data-testid="athlete-create-mock" />} />
        <Route path="/athletes/:id" element={<div data-testid="athlete-detail-mock" />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<ListRoutes />, { wrapper });
}

describe("AthletesListPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("navegar de página: Siguiente pide page=1 al servidor y actualiza la tabla", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation(async (path) => {
      const page = Number(new URL(path, "http://localhost").searchParams.get("page") ?? "0");
      return springPage(page, 11);
    });
    renderList();

    expect(await screen.findByText("Seed Pagina01")).toBeInTheDocument();
    await user.click(screen.getByTestId("athletes-pagination-next"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(apiFetchMock.mock.calls[1]?.[0]).toContain("page=1");
    expect(await screen.findByText("Seed Pagina11")).toBeInTheDocument();
  });

  it("límites del paginador: Anterior deshabilitado en first, Siguiente en last, y total visible", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation(async (path) => {
      const page = Number(new URL(path, "http://localhost").searchParams.get("page") ?? "0");
      return springPage(page, 11);
    });
    renderList();

    expect(await screen.findByText("11 deportistas en total")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByTestId("athletes-pagination-prev")).toBeDisabled();
    expect(screen.getByTestId("athletes-pagination-next")).toBeEnabled();

    await user.click(screen.getByTestId("athletes-pagination-next"));
    await waitFor(() => expect(screen.getByTestId("athletes-pagination-next")).toBeDisabled());
    expect(screen.getByTestId("athletes-pagination-prev")).toBeEnabled();
  });

  it("lista vacía: content [] muestra el estado vacío con CTA al alta", async () => {
    apiFetchMock.mockImplementation(async () => springPage(0, 0));
    renderList();

    const emptyState = await screen.findByTestId("athletes-empty");
    expect(emptyState).toBeInTheDocument();
    expect(
      within(emptyState).getByRole("link", { name: "Crear deportista" }),
    ).toHaveAttribute("href", "/athletes/nuevo");
  });

  it("acceso al detalle: pulsar una fila navega a /athletes/:id", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation(async () => springPage(0, 11));
    renderList();

    const rows = await screen.findAllByTestId("athletes-row");
    await user.click(rows[0]!);

    await waitFor(() => expect(screen.getByTestId("athlete-detail-mock")).toBeInTheDocument());
  });
});
