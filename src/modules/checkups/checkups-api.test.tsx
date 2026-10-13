// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";

import {
  athleteCheckupsKey,
  athleteCheckupsKeyPrefix,
  athleteProjectionsKey,
  checkupComparisonKey,
  checkupDetailKey,
  isIncompleteReferenceError,
  NATIONAL_REFERENCE_LIST_KEY,
  useAddCheckupTime,
  useAthleteCheckups,
  useAthleteProjections,
  useCheckup,
  useCheckupComparison,
  useCreateCheckup,
  useCreateReferenceTime,
  useDeleteCheckup,
  useDeleteReferenceTime,
  useNationalReferenceTimes,
  useUpdateReferenceTime,
} from "./checkups-api";

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

function apiErrorWith(status: number, message: string): ApiError {
  return new ApiError(status, { status, error: "", message });
}

const checkup = {
  id: 20,
  athleteId: 7,
  year: 2026,
  month: 3,
  category: "JUVENIL",
  notes: "Chequeo de marzo",
  createdAt: "2026-03-05T10:15:00Z",
  updatedAt: "2026-03-05T10:15:00Z",
  active: true,
};

const checkupDetail = {
  ...checkup,
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

describe("queries de chequeos", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useAthleteCheckups sin filtros llama SIN query params", async () => {
    apiFetchMock.mockResolvedValueOnce([checkup]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAthleteCheckups(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/athletes/7/checkups");
    expect(result.current.data).toEqual([checkup]);
  });

  it("useAthleteCheckups con año y mes los envía como ?year=&month=", async () => {
    apiFetchMock.mockResolvedValueOnce([]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAthleteCheckups(7, { year: 2026, month: 3 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/athletes/7/checkups?year=2026&month=3");
  });

  it("useAthleteCheckups con solo año envía un único query param", async () => {
    apiFetchMock.mockResolvedValueOnce([]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAthleteCheckups(7, { year: 2025 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/athletes/7/checkups?year=2025");
  });

  it("useCheckup pide GET /checkups/{id} con tiempos embebidos", async () => {
    apiFetchMock.mockResolvedValueOnce(checkupDetail);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCheckup(20), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/checkups/20");
    expect(result.current.data?.times[0]?.timeFormatted).toBe("01:05.250");
  });

  it("useCheckup respete `enabled=false` (no consulta si el id no es numérico)", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useCheckup(0, false), { wrapper });

    await waitFor(() => expect(apiFetchMock).not.toHaveBeenCalled());
  });

  it("useAthleteProjections pide GET /athletes/{id}/projections", async () => {
    apiFetchMock.mockResolvedValueOnce([
      {
        style: "LIBRE",
        distance: 100,
        category: "JUVENIL",
        classification: "CERCANO_A_MEDALLERIA",
        timeSeconds: 63.8,
        timeFormatted: "01:03.800",
        diffVsBronzeSeconds: 0.5,
        diffVsBronzeFormatted: "+00:00.500",
      },
    ]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAthleteProjections(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/athletes/7/projections");
  });

  it("useNationalReferenceTimes pide GET /national-reference-times sin paginar", async () => {
    apiFetchMock.mockResolvedValueOnce([
      {
        id: 7,
        style: "LIBRE",
        distance: 100,
        category: "JUVENIL",
        position: 3,
        timeSeconds: 63.3,
        timeFormatted: "01:03.300",
      },
    ]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNationalReferenceTimes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/national-reference-times");
    expect(NATIONAL_REFERENCE_LIST_KEY).toEqual(["checkups", "national-reference"]);
  });
});

describe("useCheckupComparison (comparación lazy, C8)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("con enabled=false NO dispara la llamada (bajo demanda)", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useCheckupComparison(20, false), { wrapper });

    await waitFor(() => expect(apiFetchMock).not.toHaveBeenCalled());
  });

  it("con enabled=true pide GET /checkups/{id}/comparison", async () => {
    apiFetchMock.mockResolvedValueOnce([
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
        ],
      },
    ]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCheckupComparison(20, true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/checkups/20/comparison");
  });
});

describe("mutaciones de chequeos", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useCreateCheckup hace POST al recurso anidado con el body exacto e invalida la lista (todas las variantes)", async () => {
    apiFetchMock.mockResolvedValueOnce(checkup);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateCheckup(7), { wrapper });
    result.current.mutate({
      athleteId: 7,
      year: 2026,
      month: 3,
      category: "JUVENIL",
      notes: "Chequeo de marzo",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/athletes/7/checkups", {
      method: "POST",
      body: { athleteId: 7, year: 2026, month: 3, category: "JUVENIL", notes: "Chequeo de marzo" },
    });
    // Invalidación por prefijo: cubre cualquier combinación de filtros activa.
    expect(spy).toHaveBeenCalledWith({ queryKey: athleteCheckupsKeyPrefix(7) });
  });

  it("useDeleteCheckup hace DELETE /checkups/{id} e invalida lista del atleta + detalle", async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteCheckup(20, 7), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/checkups/20", { method: "DELETE" });
    expect(spy).toHaveBeenCalledWith({ queryKey: athleteCheckupsKeyPrefix(7) });
    expect(spy).toHaveBeenCalledWith({ queryKey: checkupDetailKey(20) });
  });

  it("useAddCheckupTime hace POST /checkups/{id}/times con timeSeconds numérico e invalida el detalle", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 30 });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddCheckupTime(20), { wrapper });
    result.current.mutate({ style: "LIBRE", distance: 100, timeSeconds: 65.25 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/checkups/20/times", {
      method: "POST",
      body: { style: "LIBRE", distance: 100, timeSeconds: 65.25 },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: checkupDetailKey(20) });
  });
});

describe("mutaciones de tabla nacional (C7: PUT completo)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useCreateReferenceTime hace POST con los 5 campos e invalida la matriz", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 7 });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateReferenceTime(), { wrapper });
    result.current.mutate({
      style: "LIBRE",
      distance: 100,
      category: "JUVENIL",
      position: 3,
      timeSeconds: 63.3,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/national-reference-times", {
      method: "POST",
      body: { style: "LIBRE", distance: 100, category: "JUVENIL", position: 3, timeSeconds: 63.3 },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: NATIONAL_REFERENCE_LIST_KEY });
  });

  it("useUpdateReferenceTime hace PUT con el body COMPLETO (5 campos) e invalida la matriz", async () => {
    apiFetchMock.mockResolvedValueOnce({ id: 7 });

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateReferenceTime(7), { wrapper });
    result.current.mutate({
      style: "LIBRE",
      distance: 100,
      category: "JUVENIL",
      position: 2,
      timeSeconds: 62.5,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/national-reference-times/7", {
      method: "PUT",
      body: { style: "LIBRE", distance: 100, category: "JUVENIL", position: 2, timeSeconds: 62.5 },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: NATIONAL_REFERENCE_LIST_KEY });
  });

  it("useDeleteReferenceTime hace DELETE e invalida la matriz", async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteReferenceTime(7), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/national-reference-times/7", { method: "DELETE" });
    expect(spy).toHaveBeenCalledWith({ queryKey: NATIONAL_REFERENCE_LIST_KEY });
  });
});

describe("claves de query", () => {
  it("athleteCheckupsKey distingue variantes de filtro", () => {
    expect(athleteCheckupsKey(7)).toEqual(["checkups", "athlete", 7]);
    expect(athleteCheckupsKey(7, 2026)).toEqual(["checkups", "athlete", 7, 2026]);
    expect(athleteCheckupsKey(7, 2026, 3)).toEqual(["checkups", "athlete", 7, 2026, 3]);
    expect(athleteProjectionsKey(7)).toEqual(["checkups", "projections", 7]);
    expect(checkupComparisonKey(20)).toEqual(["checkups", "comparison", 20]);
  });
});

describe("isIncompleteReferenceError (C5)", () => {
  it("detecta 409 con mensaje de triple completo", () => {
    const error = apiErrorWith(409, "No existe el triple completo LIBRE 100m en categoría JUVENIL");
    expect(isIncompleteReferenceError(error)).toBe(true);
  });

  it("no marca un 409 con otro mensaje", () => {
    expect(isIncompleteReferenceError(apiErrorWith(409, "Otro conflicto"))).toBe(false);
  });

  it("no marca un 404 aunque mencionara el texto (negativo)", () => {
    expect(isIncompleteReferenceError(apiErrorWith(404, "triple completo"))).toBe(false);
  });

  it("no marca errores que no son ApiError", () => {
    expect(isIncompleteReferenceError(new Error("triple completo"))).toBe(false);
    expect(isIncompleteReferenceError(null)).toBe(false);
  });
});
