// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { SessionResponse } from "@/lib/api/types";

import { SessionFormDialog, toContractTime } from "./session-form";
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

function renderDialog(props: Partial<Parameters<typeof SessionFormDialog>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <SessionFormDialog open onOpenChange={() => {}} onSaved={() => {}} cycleId={null} {...props} />,
    { wrapper },
  );
}

const existingSession: SessionResponse = {
  id: 100,
  cycleId: 11,
  disciplineId: null,
  sessionDate: "2026-01-06",
  startTime: "07:30:00",
  status: "PROGRAMADA",
  volume: 4000,
  intensity: 75,
  distance: 3000,
  observations: "Trabajo aeróbico",
  active: true,
};

describe("SessionFormDialog — creación anidada (T4)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("crea contra el endpoint anidado del ciclo con URL y body exactos", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 200 });
    renderDialog({ cycleId: 11 });

    const user = userEvent.setup();
    fireEvent.change(screen.getByTestId("session-form-date"), { target: { value: "2026-01-06" } });
    fireEvent.change(screen.getByTestId("session-form-startTime"), { target: { value: "07:30" } });
    await user.click(screen.getByTestId("session-form-submit"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-cycles/11/sessions", {
      method: "POST",
      body: {
        cycleId: 11,
        sessionDate: "2026-01-06",
        startTime: "07:30:00", // contrato doc 05 §3: HH:mm:ss
        status: "PROGRAMADA",
      },
    });
  });

  it("sessionDate obligatoria: sin fecha el envío se bloquea", async () => {
    renderDialog({ cycleId: 11 });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("session-form-submit"));

    expect(await screen.findByText("La fecha de sesión es obligatoria (AAAA-MM-DD)")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("nunca crea sesiones sueltas: sin cycleId no envía nada (T4)", async () => {
    renderDialog({ cycleId: null });
    fireEvent.change(screen.getByTestId("session-form-date"), { target: { value: "2026-01-06" } });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("session-form-submit"));

    expect(await screen.findByText(/Las sesiones se crean dentro de un microciclo/)).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe("SessionFormDialog — edición (PUT parcial)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("envía solo los campos modificados a PUT /training-sessions/{id}", async () => {
    apiFetchMock.mockResolvedValueOnce({ ...existingSession, status: "EJECUTADA" });
    renderDialog({ cycleId: 11, session: existingSession });

    const user = userEvent.setup();
    // Cambio de estado vía el Select de Radix (clic en trigger + opción).
    await user.click(screen.getByTestId("session-form-status"));
    await user.click(await screen.findByRole("option", { name: "Ejecutada" }));

    await user.click(screen.getByTestId("session-form-submit"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100", {
      method: "PUT",
      body: { status: "EJECUTADA" },
    });
  });

  it("C1: vaciar un opcional ya guardado (volume) muestra error de campo y NO llama al back", async () => {
    renderDialog({ cycleId: 11, session: existingSession }); // volume: 4000 guardado

    const user = userEvent.setup();
    fireEvent.change(screen.getByTestId("session-form-volume"), { target: { value: "" } });
    await user.click(screen.getByTestId("session-form-submit"));

    expect(
      await screen.findByText("Una vez guardado no se puede dejar vacío; solo puedes sustituirlo"),
    ).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("C1: un opcional SIN valor previo puede quedar vacío (significa 'no informado')", async () => {
    // Sesión sin opcionales guardados: enviar sin rellenarlos es válido.
    const sparseSession = {
      ...existingSession,
      startTime: null,
      volume: null,
      intensity: null,
      distance: null,
      observations: null,
    };
    apiFetchMock.mockResolvedValueOnce(sparseSession);
    renderDialog({ cycleId: 11, session: sparseSession });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("session-form-submit"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    // Nada cambió: PUT vacío (parcial) y sin errores de campo.
    expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100", {
      method: "PUT",
      body: {},
    });
  });
});

describe("toContractTime (doc 05 §3)", () => {
  it("amplía HH:mm a HH:mm:ss y respeta HH:mm:ss", () => {
    expect(toContractTime("07:30")).toBe("07:30:00");
    expect(toContractTime("07:30:15")).toBe("07:30:15");
    expect(toContractTime("")).toBe("");
  });
});
