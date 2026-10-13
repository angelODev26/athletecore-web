// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import type { AttendanceAlertResponse } from "@/lib/api/types";

import { AlertsPage } from "./alerts-page";
import { useAlertsAckStore } from "./alerts-ack-store";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

afterEach(cleanup);

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

function alertOf(athleteId: number, count: number, lastAbsenceDate: string): AttendanceAlertResponse {
  return {
    athleteId,
    athleteFullName: `Atleta ${athleteId}`,
    consecutiveAbsenceCount: count,
    lastAbsenceDate,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/training/alerts"]}>
      <Routes>
        <Route path="/training/alerts" element={<AlertsPage />} />
        <Route path="/training" element={<div data-testid="plans-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

describe("AlertsPage (T7 — acknowledge local)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
    useAlertsAckStore.setState({ acked: {} });
    signInAs(["ADMIN"]);
  });

  it("muestra tarjetas con racha y última fecha en formato T10, sin clasificar (C3)", async () => {
    apiFetchMock.mockResolvedValueOnce([alertOf(7, 4, "2026-01-20")]);
    renderPage();

    const card = await screen.findByTestId("alert-card-7");
    expect(within(card).getByText("Atleta 7")).toBeInTheDocument();
    expect(within(card).getByText("4")).toBeInTheDocument();
    expect(within(card).getByText(/20\/01\/2026/)).toBeInTheDocument();
    // C3: el umbral de racha es del servidor — el front no clasifica ("Racha alta").
    expect(within(card).queryByText("Racha alta")).not.toBeInTheDocument();
    expect(within(card).queryByText("En seguimiento")).not.toBeInTheDocument();
  });

  it("dismiss oculta la tarjeta SIN llamar al back (ni acknowledge ni recarga)", async () => {
    apiFetchMock.mockResolvedValueOnce([alertOf(7, 4, "2026-01-20"), alertOf(8, 3, "2026-01-18")]);
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("alert-ack-7"));

    expect(await screen.findByTestId("alert-card-8")).toBeInTheDocument();
    expect(screen.queryByTestId("alert-card-7")).not.toBeInTheDocument();
    // GET inicial de alertas + nada más: el dismiss es 100 % local (T7).
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("reaparece cuando la racha crece: mismo athleteId con lastAbsenceDate nuevo", async () => {
    apiFetchMock.mockResolvedValueOnce([alertOf(7, 4, "2026-01-20")]);
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("alert-ack-7"));
    expect(await screen.findByTestId("alerts-all-dismissed")).toBeInTheDocument();

    // Nueva visita con la racha crecida (nueva ausencia el 27): el ack guardado apunta
    // al par (7, 2026-01-20) y ya NO coincide → la alerta vuelve a mostrarse.
    cleanup();
    apiFetchMock.mockResolvedValueOnce([alertOf(7, 5, "2026-01-27")]);
    renderPage();

    expect(await screen.findByTestId("alert-card-7")).toBeInTheDocument();
  });

  it("bandeja vacía: estado vacío cuando el back no devuelve alertas", async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByTestId("alerts-empty")).toBeInTheDocument();
  });

  it("copy honesto: avisa que el dismiss es local y puede reaparecer", async () => {
    apiFetchMock.mockResolvedValueOnce([alertOf(7, 4, "2026-01-20")]);
    renderPage();

    const notice = await screen.findByTestId("alerts-local-notice");
    expect(notice).toHaveTextContent("solo en este navegador");
    expect(notice).toHaveTextContent("puede reaparecer");
  });

  it("C6: descartar la última alerta de la página 2 re-clampa a la página 1 (sin página vacía)", async () => {
    // 11 alertas, PAGE_SIZE 10 → página 2 con una sola alerta (Atleta 11).
    const alerts = Array.from({ length: 11 }, (_, index) => alertOf(index + 1, 3, "2026-01-20"));
    apiFetchMock.mockResolvedValueOnce(alerts);
    renderPage();

    const user = userEvent.setup();
    expect(await screen.findByTestId("alert-card-1")).toBeInTheDocument();
    await user.click(screen.getByTestId("alerts-pagination-next"));
    expect(await screen.findByTestId("alert-card-11")).toBeInTheDocument();

    // Se descarta la única de la página 2: quedan 10 visibles → re-clamp a página 1.
    await user.click(screen.getByTestId("alert-ack-11"));
    expect(screen.queryByTestId("alert-card-11")).not.toBeInTheDocument();
    expect(await screen.findByTestId("alert-card-1")).toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 1/)).toBeInTheDocument();
    expect(screen.getByTestId("alerts-pagination-next")).toBeDisabled();
  });
});
