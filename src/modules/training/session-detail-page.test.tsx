// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import type { AttendanceRecord, SessionDetailResponse } from "@/lib/api/types";

import { SessionDetailPage } from "./session-detail-page";
import { installRadixPointerPolyfills } from "./test-setup";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

beforeAll(() => {
  installRadixPointerPolyfills();
});

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

function athleteOf(id: number) {
  return {
    id,
    username: `u${id}`,
    email: `u${id}@club.com`,
    firstName: "A",
    lastName: `L${id}`,
    fullName: `Atleta ${id}`,
    birthDate: null,
    photoUrl: null,
    active: true,
  };
}

function attendanceOf(athleteId: number, status: AttendanceRecord["status"]): AttendanceRecord {
  return {
    id: 55 + athleteId,
    sessionId: 100,
    sessionDate: "2026-01-06",
    athleteId,
    athleteFullName: `Atleta ${athleteId}`,
    status,
  };
}

function baseSession(overrides: Partial<SessionDetailResponse> = {}): SessionDetailResponse {
  return {
    id: 100,
    cycleId: 11,
    disciplineId: null,
    sessionDate: "2026-01-06",
    startTime: "07:30:00",
    status: "PROGRAMADA",
    volume: 4000,
    intensity: 75,
    distance: 3000,
    observations: null,
    active: true,
    attendance: [attendanceOf(7, "PRESENTE")],
    ...overrides,
  };
}

describe("SessionDetailPage — pase de lista (T6)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
    signInAs(["ADMIN"]);
  });

  it("planilla completa: combina asistencia embebida + todos los deportistas; sin marcar visible", async () => {
    const session = baseSession();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/training-sessions/100") return session;
      if (path.startsWith("/athletes?")) {
        expect(path).toContain("size=100");
        return { content: [athleteOf(7), athleteOf(8)], last: true };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    renderPage();

    const row7 = await screen.findByTestId("attendance-row-7");
    expect(within(row7).getByTestId("attendance-PRESENTE-7")).toHaveAttribute("aria-pressed", "true");
    const row8 = await screen.findByTestId("attendance-row-8");
    expect(within(row8).getByTestId("attendance-unmarked-8")).toBeInTheDocument();
  });

  it("corrección por upsert: re-marcar envía UN POST y refresca sin duplicar", async () => {
    let current = baseSession();
    const posts: unknown[] = [];
    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === "/training-sessions/100") return current;
      if (path.startsWith("/athletes?")) {
        return { content: [athleteOf(7), athleteOf(8)], last: true };
      }
      if (path === "/training-sessions/100/attendance" && options?.method === "POST") {
        posts.push(options.body);
        const body = options.body as { athleteId: number; status: AttendanceRecord["status"] };
        current = {
          ...current,
          attendance: [
            ...current.attendance.filter((record) => record.athleteId !== body.athleteId),
            attendanceOf(body.athleteId, body.status),
          ],
        };
        return { id: 99 };
      }
      throw new Error(`Unexpected ${options?.method ?? "GET"} ${path}`);
    });
    renderPage();

    const user = userEvent.setup();
    // Atleta 7 está PRESENTE: se re-marca a AUSENTE (corrección, sin borrado).
    await user.click(await screen.findByTestId("attendance-AUSENTE-7"));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ athleteId: 7, status: "AUSENTE" });

    // Tras invalidar el detalle, la fila refleja el nuevo estado (un solo registro).
    const row = await screen.findByTestId("attendance-row-7");
    await waitFor(() =>
      expect(within(row).getByTestId("attendance-AUSENTE-7")).toHaveAttribute("aria-pressed", "true"),
    );
    expect(posts).toHaveLength(1);
  });

  it("sesión CANCELADA: aviso visible y controles deshabilitados (sin POST posibles)", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/training-sessions/100") {
        return baseSession({ status: "CANCELADA" });
      }
      if (path.startsWith("/athletes?")) {
        return { content: [athleteOf(7)], last: true };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    renderPage();

    expect(await screen.findByTestId("attendance-cancelled")).toHaveTextContent(
      "La sesión está cancelada; no admite asistencia",
    );
    expect(await screen.findByTestId("attendance-row-7")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-PRESENTE-7")).toBeDisabled();
    expect(screen.getByTestId("attendance-AUSENTE-7")).toBeDisabled();
    expect(screen.getByTestId("attendance-JUSTIFICADO-7")).toBeDisabled();
  });

  it("400 al marcar (sesión cancelada en el back): mensaje mapeado, nunca crudo", async () => {
    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/training-sessions/100") return baseSession();
      if (path.startsWith("/athletes?")) {
        return { content: [athleteOf(7)], last: true };
      }
      if (path === "/training-sessions/100/attendance" && options?.method === "POST") {
        // Caso de carrera: la sesión se canceló entre carga y marca (doc 05 §4).
        throw new ApiError(400, {
          status: 400,
          error: "Bad Request",
          message: "Error de validación",
          details: "La sesión está cancelada, raw backend detail",
        });
      }
      throw new Error(`Unexpected ${options?.method ?? "GET"} ${path}`);
    });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("attendance-PRESENTE-7"));

    const alert = await screen.findByTestId("attendance-error");
    expect(alert).toBeInTheDocument();
    expect(alert).not.toHaveTextContent("raw backend detail");
  });
});

describe("SessionDetailPage — estado y borrado", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("cambio de estado: PUT .../status con solo { status } (T3.2)", async () => {
    signInAs(["COACH"]);
    let current = baseSession();
    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === "/training-sessions/100") return current;
      if (path.startsWith("/athletes?")) {
        return { content: [athleteOf(7)], last: true };
      }
      if (path === "/training-sessions/100/status" && options?.method === "PUT") {
        current = { ...current, status: (options.body as { status: string }).status as SessionDetailResponse["status"] };
        return current;
      }
      throw new Error(`Unexpected ${options?.method ?? "GET"} ${path}`);
    });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("session-status-select"));
    await user.click(await screen.findByRole("option", { name: "Cancelada" }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100/status", {
      method: "PUT",
      body: { status: "CANCELADA" },
    }));
    await waitFor(() => expect(screen.getByTestId("attendance-cancelled")).toBeInTheDocument());
  });

  it("COACH no ve la acción de borrar; ADMIN sí y con confirmación (T3.2/T8)", async () => {
    signInAs(["COACH"]);
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/training-sessions/100") return baseSession();
      if (path.startsWith("/athletes?")) {
        return { content: [athleteOf(7)], last: true };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    renderPage();

    await screen.findByTestId("attendance-grid");
    expect(screen.queryByTestId("session-delete")).not.toBeInTheDocument();

    cleanup();
    signInAs(["ADMIN"]);
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/training-sessions/100") return baseSession();
      if (path.startsWith("/athletes?")) {
        return { content: [athleteOf(7)], last: true };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("session-delete"));
    const dialog = await screen.findByTestId("session-delete-confirm");
    await user.click(within(dialog).getByRole("button", { name: "Borrar sesión" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100", { method: "DELETE" }),
    );
  });

  it("404 muestra el estado de sesión no encontrada (soft delete)", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(404, { status: 404, error: "Not Found", message: "Session not found" }),
    );
    renderPage();

    expect(await screen.findByTestId("session-not-found")).toBeInTheDocument();
  });

  it("C5: id no numérico (/training/sessions/abc) no dispara request y muestra no encontrado", async () => {
    signInAs(["ADMIN"]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={["/training/sessions/abc"]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/training/sessions/:sessionId" element={<SessionDetailPage />} />
            <Route path="/training" element={<div data-testid="plans-mock" />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("session-not-found")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/training/sessions/100"]}>
      <Routes>
        <Route path="/training/sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="/training" element={<div data-testid="plans-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}
