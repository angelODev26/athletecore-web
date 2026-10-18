// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";

import {
  athleteReportKey,
  downloadReportExport,
  isInvalidCronError,
  REPORT_SCHEDULES_KEY,
  reportDetailKey,
  reportsListKey,
  teamReportKey,
  useAthleteReport,
  useCreateReportSchedule,
  useDeleteReport,
  useDeleteReportSchedule,
  useGenerateReport,
  useReport,
  useReportSchedules,
  useReports,
  useTeamReport,
  useUpdateReportSchedule,
} from "./reports-api";

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

/*
 * Respuesta falsa con la superficie que consume `http.ts`
 * (ok/status/statusText/headers/json/blob): independiente del soporte de
 * `Response` en jsdom. El body binario se entrega ya como `Blob`.
 */
function fakeResponse(init: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  blobBody?: Blob;
}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "OK",
    headers: new Headers(init.headers),
    json: async () => init.jsonBody,
    blob: async () => init.blobBody,
  } as unknown as Response;
}

function errorBody(status: number, message: string): unknown {
  return { status, error: "Error", message };
}

const report = {
  id: 9,
  reportType: "INDIVIDUAL",
  athleteId: 1,
  category: null,
  year: 2026,
  month: 3,
  title: "Informe marzo",
  status: "GENERATED",
  errorMessage: null,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:01Z",
  active: true,
};

const reportDetail = {
  ...report,
  exports: [
    {
      id: 3,
      reportId: 9,
      format: "PDF",
      fileName: "reporte-9.pdf",
      fileSizeBytes: 48_213,
      contentType: "application/pdf",
      createdAt: "2026-09-01T10:00:01Z",
    },
  ],
};

const schedule = {
  id: 2,
  reportType: "GENERAL",
  athleteId: null,
  category: "JUVENIL",
  cronExpression: "0 0 6 1 * *",
  timezone: "America/Bogota",
  active: true,
  lastRunAt: "2026-09-01T06:00:00Z",
  nextRunAt: "2026-10-01T06:00:00Z",
  createdAt: "2026-09-01T05:00:00Z",
  updatedAt: "2026-09-01T05:00:00Z",
};

describe("claves de query de reportes (C8)", () => {
  it("compone las claves exactas del diseño", () => {
    expect(athleteReportKey(7)).toEqual(["reports", "athlete-report", 7]);
    expect(teamReportKey()).toEqual(["reports", "team", "all"]);
    expect(teamReportKey("JUVENIL")).toEqual(["reports", "team", "JUVENIL"]);
    expect(reportsListKey({ type: "INDIVIDUAL" })).toEqual([
      "reports",
      "list",
      { type: "INDIVIDUAL" },
    ]);
    expect(reportDetailKey(9)).toEqual(["reports", "detail", 9]);
    expect(REPORT_SCHEDULES_KEY).toEqual(["reports", "schedules"]);
  });
});

describe("queries de reportes", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useAthleteReport pide GET /athletes/{id}/report (dashboard en una llamada)", async () => {
    apiFetchMock.mockResolvedValueOnce({
      athleteId: 1,
      athleteFullName: "Michael Phelps",
      timeEvolution: [
        {
          year: 2026,
          month: 1,
          style: "LIBRE",
          distance: 100,
          timeSeconds: 66.1,
          timeFormatted: "01:06.100",
        },
      ],
      attendance: {
        totalSessions: 40,
        presentCount: 34,
        absentCount: 4,
        justifiedCount: 2,
        currentAbsenceStreak: 0,
      },
      projections: [],
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAthleteReport(1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/athletes/1/report");
    // Los tiempos se muestran tal cual del servidor (el front nunca formatea).
    expect(result.current.data?.timeEvolution[0]?.timeFormatted).toBe("01:06.100");
  });

  it("useAthleteReport con enabled=false no dispara la llamada (id no numérico)", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useAthleteReport(0, false), { wrapper });

    await waitFor(() => expect(apiFetchMock).not.toHaveBeenCalled());
  });

  it("useTeamReport sin categoría pide GET /reports/team SIN query string", async () => {
    apiFetchMock.mockResolvedValueOnce({ category: null, entries: [] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTeamReport(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/reports/team");
  });

  it("useTeamReport con categoría la envía como ?category=", async () => {
    apiFetchMock.mockResolvedValueOnce({ category: "JUVENIL", entries: [] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTeamReport("JUVENIL"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/reports/team?category=JUVENIL");
  });

  it("useReports sin filtros pide GET /reports SIN query string", async () => {
    apiFetchMock.mockResolvedValueOnce([report]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReports(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/reports");
    expect(result.current.data).toEqual([report]);
  });

  it("useReports con filtros combinados compone la query string en el orden del contrato", async () => {
    apiFetchMock.mockResolvedValueOnce([]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useReports({ type: "INDIVIDUAL", athleteId: 1, status: "GENERATED" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/reports?type=INDIVIDUAL&athleteId=1&status=GENERATED",
    );
  });

  it("useReports con un único filtro envía solo ese parámetro", async () => {
    apiFetchMock.mockResolvedValueOnce([]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReports({ status: "FAILED" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/reports?status=FAILED");
  });

  it("useReport pide GET /reports/{id} con los exports embebidos", async () => {
    apiFetchMock.mockResolvedValueOnce(reportDetail);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReport(9), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/reports/9");
    expect(result.current.data?.exports[0]?.fileName).toBe("reporte-9.pdf");
  });

  it("useReportSchedules pide GET /report-schedules", async () => {
    apiFetchMock.mockResolvedValueOnce([schedule]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReportSchedules(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/report-schedules");
  });
});

describe("mutaciones de reportes", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useGenerateReport hace POST /reports con el body exacto e invalida TODAS las variantes de la lista", async () => {
    apiFetchMock.mockResolvedValueOnce(reportDetail);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useGenerateReport(), { wrapper });
    result.current.mutate({
      reportType: "INDIVIDUAL",
      athleteId: 1,
      year: 2026,
      month: 3,
      title: "Informe marzo",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/reports", {
      method: "POST",
      body: {
        reportType: "INDIVIDUAL",
        athleteId: 1,
        year: 2026,
        month: 3,
        title: "Informe marzo",
      },
    });
    // Prefijo ["reports", "list"]: cubre cualquier combinación de filtros activa.
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reports", "list"] });
  });

  it("useDeleteReport hace DELETE /reports/{id} e invalida lista + detalle", async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteReport(9), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/reports/9", { method: "DELETE" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reports", "list"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: reportDetailKey(9) });
  });
});

describe("mutaciones de programaciones (C7: PUT completo)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useCreateReportSchedule hace POST /report-schedules e invalida la lista", async () => {
    apiFetchMock.mockResolvedValueOnce(schedule);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateReportSchedule(), { wrapper });
    result.current.mutate({
      reportType: "GENERAL",
      athleteId: null,
      category: "JUVENIL",
      cronExpression: "0 0 6 1 * *",
      timezone: "America/Bogota",
      active: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/report-schedules", {
      method: "POST",
      body: {
        reportType: "GENERAL",
        athleteId: null,
        category: "JUVENIL",
        cronExpression: "0 0 6 1 * *",
        timezone: "America/Bogota",
        active: true,
      },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: REPORT_SCHEDULES_KEY });
  });

  it("useUpdateReportSchedule hace PUT con el body COMPLETO (ningún campo omitido)", async () => {
    apiFetchMock.mockResolvedValueOnce(schedule);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateReportSchedule(2), { wrapper });
    result.current.mutate({
      reportType: "GENERAL",
      athleteId: null,
      category: "JUVENIL",
      cronExpression: "0 0 6 1 * *",
      timezone: "America/Bogota",
      active: false,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/report-schedules/2", {
      method: "PUT",
      body: {
        reportType: "GENERAL",
        athleteId: null,
        category: "JUVENIL",
        cronExpression: "0 0 6 1 * *",
        timezone: "America/Bogota",
        active: false,
      },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: REPORT_SCHEDULES_KEY });
  });

  it("useDeleteReportSchedule hace DELETE /report-schedules/{id} e invalida la lista", async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);

    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteReportSchedule(2), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith("/report-schedules/2", { method: "DELETE" });
    expect(spy).toHaveBeenCalledWith({ queryKey: REPORT_SCHEDULES_KEY });
  });
});

describe("isInvalidCronError (C7)", () => {
  it("detecta el 400 del back con mensaje de cron", () => {
    expect(isInvalidCronError(apiErrorWith(400, "Expresión cron inválida: 0 0 6 1 *"))).toBe(true);
    expect(
      isInvalidCronError(apiErrorWith(400, "La expresión cron no produce una próxima ejecución")),
    ).toBe(true);
  });

  it("no marca un 400 sin mención de cron", () => {
    expect(isInvalidCronError(apiErrorWith(400, "El título es obligatorio"))).toBe(false);
  });

  it("no marca otros estados aunque mencionen cron (409)", () => {
    expect(isInvalidCronError(apiErrorWith(409, "cron duplicado"))).toBe(false);
    expect(isInvalidCronError(apiErrorWith(500, "Error con cron"))).toBe(false);
  });

  it("no marca errores que no son ApiError ni valores vacíos", () => {
    expect(isInvalidCronError(new Error("cron"))).toBe(false);
    expect(isInvalidCronError(undefined)).toBe(false);
    expect(isInvalidCronError(null)).toBe(false);
  });
});

/*
 * apiFetchBlob: se prueba el camino REAL (http.ts) con `fetch` global stubbeado —
 * la misma pipeline de auth/timeout que apiFetch. El caso 401 comparte pipeline con
 * `apiFetch` (limpiar sesión + redirect) y se cubre en las pruebas del shell.
 */
describe("downloadReportExport + apiFetchBlob (C6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  function stubFetch(response: Response) {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("pide GET /reports/{id}/export con Bearer + Accept: */* y devuelve blob + fileName del Content-Disposition", async () => {
    const pdf = new Blob(["%PDF-1.4 contenido"], { type: "application/pdf" });
    const fetchMock = stubFetch(
      fakeResponse({
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="reporte-9.pdf"',
        },
        blobBody: pdf,
      }),
    );

    useSessionStore.setState({
      tokens: { access: "test-token" },
      expiresAt: Date.now() + 3_600_000,
    });

    const result = await downloadReportExport(9);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/api/v1/reports/9/export");
    expect(init.method).toBeUndefined(); // GET: sin override de método
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer test-token");
    // Descarga binaria: nunca se pide `application/json` (evita un 406 si el
    // back declara `produces = "application/pdf"`).
    expect((init.headers as Headers).get("Accept")).toBe("*/*");
    expect(result.blob).toBe(pdf);
    expect(result.blob.type).toBe("application/pdf");
    expect(result.fileName).toBe("reporte-9.pdf");
  });

  it("sin Content-Disposition devuelve fileName null (la UI usa su propio fallback)", async () => {
    stubFetch(
      fakeResponse({
        headers: { "Content-Type": "application/pdf" },
        blobBody: new Blob(["%PDF"], { type: "application/pdf" }),
      }),
    );

    const result = await downloadReportExport(9);

    expect(result.fileName).toBeNull();
    expect(result.blob.size).toBe(4);
  });

  it("ante un error JSON lanza ApiError con el status y el message del ErrorResponse", async () => {
    stubFetch(
      fakeResponse({
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "application/json" },
        jsonBody: errorBody(500, "No se pudo generar el PDF"),
      }),
    );

    await expect(downloadReportExport(9)).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      payload: { status: 500, message: "No se pudo generar el PDF" },
    });
  });

  it("un 404 (reporte sin exports o FAILED) lanza ApiError 404 sin abrir blob", async () => {
    stubFetch(
      fakeResponse({
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
        jsonBody: errorBody(404, "Reporte no encontrado"),
      }),
    );

    const error = await downloadReportExport(9).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).payload.message).toBe("Reporte no encontrado");
  });

  it("un 200 con Content-Type JSON es un error genérico: nunca se devuelve un blob no binario", async () => {
    stubFetch(
      fakeResponse({
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        jsonBody: { status: 200, error: "OK", message: "Sesión válida pero sin archivo" },
      }),
    );

    const error = await downloadReportExport(9).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(200);
    expect((error as ApiError).payload.message).toBe("Sesión válida pero sin archivo");
  });

  it("un 200 con body JSON que no es ErrorResponse usa el mensaje seguro genérico", async () => {
    stubFetch(
      fakeResponse({
        headers: { "Content-Type": "application/json" },
        jsonBody: { unexpected: true },
      }),
    );

    const error = await downloadReportExport(9).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).payload.message).toBe("El servidor no devolvió el archivo esperado");
  });
});
