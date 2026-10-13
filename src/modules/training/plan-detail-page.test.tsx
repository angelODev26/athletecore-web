// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import type { TrainingCycleNode, TrainingPlanDetailResponse } from "@/lib/api/types";

import { PlanDetailPage } from "./plan-detail-page";
import { collectCycleNames, cycleFormSchema, validateCycleLocally } from "./cycle-form";

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

function microcycle(id: number, name: string, parentId: number): TrainingCycleNode {
  return {
    id,
    type: "MICROCICLO",
    name,
    startDate: "2026-01-05",
    endDate: "2026-01-11",
    orderIndex: 1,
    parentCycleId: parentId,
    children: [],
  };
}

const meso: TrainingCycleNode = {
  id: 10,
  type: "MESOCICLO",
  name: "Base Enero",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  orderIndex: 1,
  parentCycleId: null,
  children: [microcycle(11, "Semana 1", 10)],
};

const meso2: TrainingCycleNode = {
  id: 20,
  type: "MESOCICLO",
  name: "Base Febrero",
  startDate: "2026-02-01",
  endDate: "2026-02-28",
  orderIndex: 2,
  parentCycleId: null,
  children: [],
};

const planDetail: TrainingPlanDetailResponse = {
  id: 1,
  name: "Plan 2026",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  description: "Temporada 2026",
  active: true,
  cycles: [meso, meso2],
};

function renderDetail(planId = 1) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={[`/training/plans/${planId}`]}>
      <Routes>
        <Route path="/training/plans/:planId" element={<PlanDetailPage />} />
        <Route path="/training" element={<div data-testid="plans-mock" />} />
        <Route path="/training/sessions/:sessionId" element={<div data-testid="session-detail-mock" />} />
        <Route path="/training/alerts" element={<div data-testid="alerts-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

function mockPlanBackend(sessions: unknown[] = []) {
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path === "/training-plans/1") {
      return planDetail;
    }
    if (path.startsWith("/training-cycles/")) {
      return sessions;
    }
    throw new Error(`Unexpected GET ${path}`);
  });
}

describe("PlanDetailPage — árbol (T3)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("renderiza la jerarquía tal cual la entrega el back (meso → micro anidado, sin reordenar)", async () => {
    signInAs(["ADMIN"]);
    mockPlanBackend();
    renderDetail();

    const tree = await screen.findByTestId("plan-tree");

    // Orden del DOM = orden del back: meso1, su micro anidado, meso2.
    const nodeIds = Array.from(tree.querySelectorAll("[data-testid^='cycle-node-']")).map((node) =>
      node.getAttribute("data-testid"),
    );
    expect(nodeIds).toEqual(["cycle-node-10", "cycle-node-11", "cycle-node-20"]);

    // El micro está anidado DENTRO del meso (children tal cual).
    const mesoNode = within(tree).getByTestId("cycle-node-10");
    expect(within(mesoNode).getByTestId("cycle-node-11")).toBeInTheDocument();
    expect(within(tree).getByTestId("session-create-11")).toBeInTheDocument();
  });

  it("acciones por rol (T8): ADMIN crea ciclos; COACH solo sesiones", async () => {
    signInAs(["COACH"]);
    mockPlanBackend();
    renderDetail();

    await screen.findByTestId("plan-tree");
    expect(screen.queryByTestId("cycle-create-root")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cycle-create-10")).not.toBeInTheDocument();
    expect(screen.getByTestId("session-create-11")).toBeInTheDocument();

    cleanup();
    signInAs(["ADMIN"]);
    mockPlanBackend();
    renderDetail();

    expect(await screen.findByTestId("cycle-create-root")).toBeInTheDocument();
    expect(await screen.findByTestId("cycle-node-10")).toBeInTheDocument();
    expect(screen.getByTestId("cycle-create-10")).toBeInTheDocument();
  });

  it("sesiones del microciclo: filas con fecha T10 y estado, navegan al detalle", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/training-plans/1") {
        return planDetail;
      }
      if (path === "/training-cycles/11/sessions") {
        return [
          {
            id: 100,
            cycleId: 11,
            disciplineId: null,
            sessionDate: "2026-01-06",
            startTime: "07:30:00",
            status: "PROGRAMADA",
            volume: null,
            intensity: null,
            distance: null,
            observations: null,
            active: true,
          },
        ];
      }
      return [];
    });
    renderDetail();

    const user = userEvent.setup();
    const row = await screen.findByTestId("session-row-100");
    expect(row).toHaveTextContent("06/01/2026");
    expect(row).toHaveTextContent("07:30");

    await user.click(row);
    expect(screen.getByTestId("session-detail-mock")).toBeInTheDocument();
  });

  it("404 del plan muestra el estado de no encontrado (soft delete)", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(404, { status: 404, error: "Not Found", message: "Plan not found" }),
    );
    renderDetail();

    expect(await screen.findByTestId("plan-not-found")).toBeInTheDocument();
  });

  it("C5: id no numérico (/training/plans/abc) no dispara request y muestra no encontrado", async () => {
    signInAs(["ADMIN"]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={["/training/plans/abc"]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/training/plans/:planId" element={<PlanDetailPage />} />
            <Route path="/training" element={<div data-testid="plans-mock" />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("plan-not-found")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe("CycleFormDialog — bloqueos locales (T5)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("bloquea nombre duplicado en el plan sin llamar al back", async () => {
    signInAs(["ADMIN"]);
    mockPlanBackend();
    renderDetail();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("cycle-create-root"));

    const dialog = screen.getByTestId("cycle-form-dialog");
    fireEvent.change(within(dialog).getByTestId("cycle-form-name"), { target: { value: "Base Febrero" } });
    fireEvent.change(within(dialog).getByTestId("cycle-form-startDate"), { target: { value: "2026-03-01" } });
    fireEvent.change(within(dialog).getByTestId("cycle-form-endDate"), { target: { value: "2026-03-31" } });
    await user.click(within(dialog).getByTestId("cycle-form-submit"));

    expect(await screen.findByText("Ya existe un ciclo con ese nombre en el plan")).toBeInTheDocument();
    // El POST de ciclo nunca salió (los GET del plan y de sesiones son legítimos).
    expect(apiFetchMock).not.toHaveBeenCalledWith(
      "/training-plans/1/cycles",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("bloquea fechas fuera del rango del plan sin llamar al back", async () => {
    signInAs(["ADMIN"]);
    mockPlanBackend();
    renderDetail();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("cycle-create-root"));

    const dialog = screen.getByTestId("cycle-form-dialog");
    fireEvent.change(within(dialog).getByTestId("cycle-form-name"), { target: { value: "Base Marzo" } });
    fireEvent.change(within(dialog).getByTestId("cycle-form-startDate"), { target: { value: "2025-12-01" } });
    fireEvent.change(within(dialog).getByTestId("cycle-form-endDate"), { target: { value: "2026-03-31" } });
    await user.click(within(dialog).getByTestId("cycle-form-submit"));

    expect(await screen.findByText(/La fecha debe estar entre 2026-01-01 y 2026-12-31/)).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalledWith(
      "/training-plans/1/cycles",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("mapea un 400 del back a mensaje seguro (nunca texto crudo)", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/training-plans/1") {
        return planDetail;
      }
      if (path === "/training-plans/1/cycles" && options?.method === "POST") {
        throw new ApiError(400, {
          status: 400,
          error: "Bad Request",
          message: "Error de validación",
          details: "raw backend english validation detail",
        });
      }
      if (path.startsWith("/training-cycles/")) {
        return [];
      }
      throw new Error(`Unexpected ${path}`);
    });
    renderDetail();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("cycle-create-root"));

    const dialog = screen.getByTestId("cycle-form-dialog");
    fireEvent.change(within(dialog).getByTestId("cycle-form-name"), { target: { value: "Base Marzo" } });
    fireEvent.change(within(dialog).getByTestId("cycle-form-startDate"), { target: { value: "2026-03-01" } });
    fireEvent.change(within(dialog).getByTestId("cycle-form-endDate"), { target: { value: "2026-03-31" } });
    await user.click(within(dialog).getByTestId("cycle-form-submit"));

    const alert = await screen.findByTestId("cycle-form-error");
    expect(alert).toBeInTheDocument();
    expect(alert).not.toHaveTextContent("raw backend english validation detail");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/training-plans/1/cycles",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("validateCycleLocally (T5, unitarias)", () => {
  const planShape = {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    cycles: [meso, meso2],
  };

  const baseValues = {
    type: "MESOCICLO" as const,
    parentCycleId: "",
    name: "Base Marzo",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    orderIndex: "3",
  };

  it("MESOCICLO válido dentro del plan no produce errores", () => {
    expect(validateCycleLocally(baseValues, planShape)).toEqual({});
  });

  it("MICROCICLO sin padre → error en parentCycleId", () => {
    const errors = validateCycleLocally({ ...baseValues, type: "MICROCICLO", parentCycleId: "" }, planShape);
    expect(errors.parentCycleId).toBe("Un microciclo requiere un mesociclo padre del mismo plan");
  });

  it("MICROCICLO con fechas fuera del mesociclo padre → error de rango", () => {
    const errors = validateCycleLocally(
      { ...baseValues, type: "MICROCICLO", parentCycleId: "10", startDate: "2026-02-01", endDate: "2026-02-15" },
      planShape,
    );
    expect(errors.startDate).toContain("2026-01-01");
    expect(errors.startDate).toContain("2026-01-31");
  });

  it("endDate < startDate → error en endDate", () => {
    const errors = validateCycleLocally({ ...baseValues, startDate: "2026-03-31", endDate: "2026-03-01" }, planShape);
    expect(errors.endDate).toBe("La fecha de fin debe ser posterior o igual a la de inicio");
  });

  it("nombre duplicado (insensible a espacios) → error en name", () => {
    const errors = validateCycleLocally({ ...baseValues, name: "  Base Enero  " }, planShape);
    expect(errors.name).toBe("Ya existe un ciclo con ese nombre en el plan");
  });

  it("el schema valida el orden como entero ≥ 0", () => {
    const invalid = cycleFormSchema.safeParse({ ...baseValues, orderIndex: "-2" });
    expect(invalid.success).toBe(false);
    const valid = cycleFormSchema.safeParse(baseValues);
    expect(valid.success).toBe(true);
  });

  it("collectCycleNames recorre también los micros anidados", () => {
    expect(collectCycleNames([meso, meso2])).toEqual(["Base Enero", "Semana 1", "Base Febrero"]);
  });
});
