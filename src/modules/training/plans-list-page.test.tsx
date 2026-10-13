// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import type { TrainingPlanResponse } from "@/lib/api/types";

import { PlansListPage } from "./plans-list-page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

// Sin `globals: true` en Vitest no hay auto-cleanup del DOM entre tests.
afterEach(cleanup);

/** JWT mínimo con roles en el claim (formato del back: `roles: ["ROLE_ADMIN", …]`). */
function tokenWithRoles(roles: string[]): string {
  const payload = { sub: "staff", roles: roles.map((role) => `ROLE_${role}`), exp: Math.floor(Date.now() / 1000) + 3600 };
  const encoded = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  return `.${encoded}.`;
}

function signInAs(roles: string[]) {
  useSessionStore.setState({
    tokens: { access: tokenWithRoles(roles) },
    expiresAt: Date.now() + 3_600_000,
  });
}

function makePlans(count: number): TrainingPlanResponse[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Plan ${index + 1}`,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    description: null,
    active: true,
  }));
}

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/training"]}>
      <Routes>
        <Route path="/training" element={<PlansListPage />} />
        <Route path="/training/plans/:planId" element={<div data-testid="plan-detail-mock" />} />
        <Route path="/training/alerts" element={<div data-testid="alerts-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

describe("PlansListPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("T2/D2: pagina en cliente — Siguiente NO llama de nuevo al back", async () => {
    signInAs(["COACH"]);
    apiFetchMock.mockResolvedValueOnce(makePlans(12)); // un solo GET, array completo
    renderList();

    expect(await screen.findByText("Plan 1")).toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument();
    expect(screen.queryByText("Plan 11")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("plans-pagination-next"));

    // Slice local: sin nueva llamada (contrato T2) y segunda página visible.
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Plan 11")).toBeInTheDocument();
    expect(screen.getByText("Plan 12")).toBeInTheDocument();
    expect(screen.getByTestId("plans-pagination-next")).toBeDisabled();
  });

  it("lista vacía: estado vacío y CTA solo para ADMIN", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockResolvedValueOnce([]);
    renderList();

    const emptyState = await screen.findByTestId("plans-empty");
    expect(within(emptyState).getByTestId("plan-create")).toBeInTheDocument();
  });

  it("COACH ve la lista pero sin acciones de administración de planes (T8)", async () => {
    signInAs(["COACH"]);
    apiFetchMock.mockResolvedValueOnce(makePlans(3));
    renderList();

    expect(await screen.findByTestId("plan-row-1")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-create")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-edit-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-delete-1")).not.toBeInTheDocument();
  });

  it("ADMIN ve crear/editar/borrar y el formulario abre en modo alta", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockResolvedValueOnce(makePlans(1));
    renderList();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("plan-create"));

    const dialog = await screen.findByTestId("plan-form-dialog");
    expect(within(dialog).getByTestId("plan-form-name")).toHaveValue("");
    expect(within(dialog).getByTestId("plan-form-submit")).toHaveTextContent("Crear plan");
  });

  it("flujo de borrado: cancelar no llama al back; confirmar hace DELETE y refresca", async () => {
    signInAs(["ADMIN"]);
    // 1º GET: lista inicial; 2º GET (tras invalidar): lista sin el plan borrado.
    apiFetchMock.mockResolvedValueOnce(makePlans(2)).mockResolvedValueOnce(makePlans(1));
    renderList();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("plan-delete-2"));

    const dialog = await screen.findByTestId("plan-delete-confirm");
    expect(within(dialog).getByText(/¿Borrar el plan “Plan 2”\?/)).toBeInTheDocument();

    // Cancelar: sin DELETE y fila intacta.
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByTestId("plan-delete-confirm")).not.toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("plan-row-2")).toBeInTheDocument();

    // Confirmar: DELETE al recurso exacto y la lista se refresca sin el plan.
    await user.click(screen.getByTestId("plan-delete-2"));
    const confirmDialog = await screen.findByTestId("plan-delete-confirm");
    await user.click(within(confirmDialog).getByRole("button", { name: "Borrar plan" }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/training-plans/2", { method: "DELETE" }));
    await waitFor(() => expect(screen.queryByTestId("plan-row-2")).not.toBeInTheDocument());
  });

  it("error de carga: estado con reintento que vuelve a llamar al back", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(makePlans(1));
    renderList();

    const errorState = await screen.findByTestId("plans-error");
    expect(errorState).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(errorState).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("plan-row-1")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
