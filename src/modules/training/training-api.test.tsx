// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";

import {
  attendanceAlertsKey,
  cycleSessionsKey,
  fetchAllAthletes,
  sessionDetailKey,
  trainingPlanDetailKey,
  trainingPlansListKey,
  useCreateCycle,
  useCreateSession,
  useCreateTrainingPlan,
  useDeleteSession,
  useDeleteTrainingPlan,
  useAttendanceAlerts,
  useSession,
  useTrainingPlan,
  useTrainingPlans,
  useUpdateSession,
  useUpdateSessionStatus,
  useUpdateTrainingPlan,
  useUpsertAttendance,
} from "./training-api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

const plan = {
  id: 1,
  name: "Plan 2026",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  description: null,
  active: true,
};

const planDetail = {
  ...plan,
  cycles: [
    {
      id: 10,
      type: "MESOCICLO" as const,
      name: "Base Enero",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      orderIndex: 1,
      parentCycleId: null,
      children: [],
    },
  ],
};

describe("queries de entrenamientos", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useTrainingPlans pide GET /training-plans (array completo, sin paginar)", async () => {
    apiFetchMock.mockResolvedValueOnce([plan]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTrainingPlans(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([plan]);
    expect(apiFetchMock).toHaveBeenCalledWith("/training-plans");
  });

  it("useTrainingPlan pide GET /training-plans/{id} con la jerarquía", async () => {
    apiFetchMock.mockResolvedValueOnce(planDetail);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTrainingPlan(1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-plans/1");
    expect(result.current.data?.cycles[0]?.children).toEqual([]);
  });

  it("useSession pide GET /training-sessions/{id} con asistencia embebida", async () => {
    apiFetchMock.mockResolvedValueOnce({
      ...{
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
      },
      attendance: [
        {
          id: 55,
          sessionId: 100,
          sessionDate: "2026-01-06",
          athleteId: 7,
          athleteFullName: "Michael Phelps",
          status: "PRESENTE",
        },
      ],
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSession(100), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100");
    expect(result.current.data?.attendance).toHaveLength(1);
  });
});

describe("fetchAllAthletes", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("agota GET /athletes (size 100) hasta last=true y concatena las páginas", async () => {
    const athleteOf = (id: number) => ({
      id,
      username: `u${id}`,
      email: `u${id}@club.com`,
      firstName: "A",
      lastName: `L${id}`,
      fullName: `A L${id}`,
      birthDate: null,
      photoUrl: null,
      active: true,
    });

    apiFetchMock.mockImplementation((path: string) => {
      expect(path).toContain("/athletes?");
      expect(path).toContain("size=100");
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      if (page === 0) {
        return Promise.resolve({ content: [athleteOf(1), athleteOf(2)], last: false });
      }
      return Promise.resolve({ content: [athleteOf(3)], last: true });
    });

    const athletes = await fetchAllAthletes();

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(athletes.map((athlete) => athlete.id)).toEqual([1, 2, 3]);
  });

  it("trata un array plano como última página (defensivo ante cambio de back)", async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    const athletes = await fetchAllAthletes();
    expect(athletes).toEqual([]);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("mutaciones de planes", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useCreateTrainingPlan hace POST con el body exacto e invalida la lista", async () => {
    apiFetchMock.mockResolvedValueOnce(plan);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateTrainingPlan(), { wrapper });
    result.current.mutate({ name: "Plan 2026", startDate: "2026-01-01", endDate: "2026-12-31" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-plans", {
      method: "POST",
      body: { name: "Plan 2026", startDate: "2026-01-01", endDate: "2026-12-31" },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: trainingPlansListKey });
  });

  it("useUpdateTrainingPlan hace PUT parcial e invalida lista + detalle", async () => {
    apiFetchMock.mockResolvedValueOnce({ ...plan, name: "Plan 2026 B" });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateTrainingPlan(1), { wrapper });
    result.current.mutate({ name: "Plan 2026 B" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-plans/1", {
      method: "PUT",
      body: { name: "Plan 2026 B" },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: trainingPlansListKey });
    expect(spy).toHaveBeenCalledWith({ queryKey: trainingPlanDetailKey(1) });
  });

  it("useDeleteTrainingPlan hace DELETE e invalida lista + detalle (soft delete)", async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteTrainingPlan(1), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-plans/1", { method: "DELETE" });
    expect(spy).toHaveBeenCalledWith({ queryKey: trainingPlanDetailKey(1) });
  });

  it("useCreateCycle hace POST anidado en el plan e invalida el árbol", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 10 });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateCycle(1), { wrapper });
    result.current.mutate({
      type: "MICROCICLO",
      name: "Semana 1",
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      orderIndex: 1,
      parentCycleId: 10,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-plans/1/cycles", {
      method: "POST",
      body: {
        type: "MICROCICLO",
        name: "Semana 1",
        startDate: "2026-01-05",
        endDate: "2026-01-11",
        orderIndex: 1,
        parentCycleId: 10,
      },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: trainingPlanDetailKey(1) });
  });
});

describe("mutaciones de sesiones y asistencia", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useCreateSession usa el endpoint anidado del ciclo (T4: sin sesiones sueltas)", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 100 });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateSession(11), { wrapper });
    result.current.mutate({
      cycleId: 11,
      sessionDate: "2026-01-06",
      startTime: "07:30:00",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-cycles/11/sessions", {
      method: "POST",
      body: { cycleId: 11, sessionDate: "2026-01-06", startTime: "07:30:00" },
    });
  });

  it("useUpdateSessionStatus hace PUT .../status con solo { status }", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 100, status: "CANCELADA" });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateSessionStatus(100), { wrapper });
    result.current.mutate("CANCELADA");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100/status", {
      method: "PUT",
      body: { status: "CANCELADA" },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: sessionDetailKey(100) });
  });

  it("useDeleteSession hace DELETE (solo ADMIN en la UI)", async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteSession(100), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100", { method: "DELETE" });
  });

  it("C2: borrar sesión invalida la lista de sesiones del ciclo (sin caché obsoleta)", async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteSession(100), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // DELETE responde 204 sin body → invalidación por prefijo de todas las listas.
    expect(spy).toHaveBeenCalledWith({ queryKey: ["training", "cycle-sessions"] });
  });

  it("C2: actualizar estado invalida la lista del ciclo al que pertenece la sesión", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 100, cycleId: 11, status: "CANCELADA" });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateSessionStatus(100), { wrapper });
    result.current.mutate("CANCELADA");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: sessionDetailKey(100) });
    expect(spy).toHaveBeenCalledWith({ queryKey: cycleSessionsKey(11) });
  });

  it("C2: editar sesión invalida detalle + lista del ciclo al que pertenece", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 100, cycleId: 11, status: "PROGRAMADA" });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateSession(100), { wrapper });
    result.current.mutate({ volume: 5000 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100", {
      method: "PUT",
      body: { volume: 5000 },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: sessionDetailKey(100) });
    expect(spy).toHaveBeenCalledWith({ queryKey: cycleSessionsKey(11) });
  });

  it("useUpsertAttendance hace POST (upsert) e invalida el detalle de la sesión", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 55 });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpsertAttendance(100), { wrapper });
    result.current.mutate({ athleteId: 7, status: "PRESENTE" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/training-sessions/100/attendance", {
      method: "POST",
      body: { athleteId: 7, status: "PRESENTE" },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: sessionDetailKey(100) });
  });

  it("el acknowledge de alertas NO existe como hook (T7: dismiss 100 % local)", async () => {
    // Guarda de contrato: la capa de datos no debe exponer ninguna llamada a
    // POST /alerts/attendance/{id}/acknowledge — no persiste nada (doc 05 §5).
    const trainingApi = await import("./training-api");
    const exportedNames = Object.keys(trainingApi).join("\n");
    expect(exportedNames).not.toMatch(/acknowledge/i);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("la query de alertas solo hace GET (sin mutaciones asociadas)", async () => {
    apiFetchMock.mockResolvedValueOnce([
      {
        athleteId: 7,
        athleteFullName: "Michael Phelps",
        consecutiveAbsenceCount: 4,
        lastAbsenceDate: "2026-01-20",
      },
    ]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAttendanceAlerts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith("/alerts/attendance");
    expect(attendanceAlertsKey).toEqual(["training", "attendance-alerts"]);
  });
});
