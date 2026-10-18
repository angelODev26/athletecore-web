import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";

import { apiFetch, apiFetchBlob, isApiError, moduleQueryKey } from "@/lib/api";
import type { BlobResponse } from "@/lib/api";
import type {
  CreateReportScheduleRequest,
  GenerateReportRequest,
  IndividualReportResponse,
  ReportDetailResponse,
  ReportResponse,
  ReportScheduleResponse,
  ReportStatus,
  ReportType,
  TeamReportResponse,
  UpdateReportScheduleRequest,
} from "@/lib/api/types";

/*
 * Capa de datos del módulo reportes (contrato docs/backend-contract/07).
 *
 * Dos caras del módulo: datos estructurados JSON para dashboards
 * (`GET /athletes/{id}/report`, `GET /reports/team` — lectura PESADA: se cachea
 * con `staleTime` de 5 min y nunca se adjunta a polling agresivo) y artefactos PDF
 * persistidos (`/reports`, `/report-schedules`) con generación SÍNCRONA (T3: la
 * `201` ya trae el `status` final, la UI lee ese valor y no hace polling).
 *
 * `GET /reports` y `GET /report-schedules` no pagan en el back (D2/T9): la UI
 * pagina en cliente con el adapter de `training-api`.
 */

const ATHLETE_REPORT_RESOURCE = (athleteId: number) => `/athletes/${athleteId}/report`;
const TEAM_REPORT_RESOURCE = "/reports/team";
const REPORTS_RESOURCE = "/reports";
const REPORT_SCHEDULES_RESOURCE = "/report-schedules";
const reportDetailResource = (id: number) => `${REPORTS_RESOURCE}/${id}`;
const reportExportResource = (id: number) => `${REPORTS_RESOURCE}/${id}/export`;
const reportScheduleResource = (id: number) => `${REPORT_SCHEDULES_RESOURCE}/${id}`;

/** Lectura pesada (aviso del contrato 07 §2): cachear, sin refetch agresivo. */
const HEAVY_REPORT_STALE_TIME_MS = 5 * 60_000;

export type ReportsFilters = {
  type?: ReportType;
  athleteId?: number;
  status?: ReportStatus;
};

const REPORTS_ROOT_KEY = moduleQueryKey("reports");

export function athleteReportKey(athleteId: number): QueryKey {
  return [...REPORTS_ROOT_KEY, "athlete-report", athleteId];
}

/** `category` ausente → "all" (el dashboard y la vista de equipo comparten query). */
export function teamReportKey(category?: string): QueryKey {
  return [...REPORTS_ROOT_KEY, "team", category ?? "all"];
}

export function reportsListKey(filters: ReportsFilters): QueryKey {
  return [...REPORTS_ROOT_KEY, "list", filters];
}

/** Prefijo de TODAS las variantes de filtro de la biblioteca (invalidación por prefijo). */
const REPORTS_LIST_KEY_PREFIX = [...REPORTS_ROOT_KEY, "list"] as const;

export function reportDetailKey(id: number): QueryKey {
  return [...REPORTS_ROOT_KEY, "detail", id];
}

export const REPORT_SCHEDULES_KEY = [...REPORTS_ROOT_KEY, "schedules"] as const;

/**
 * 400 del back por cron inválido (mensaje dinámico: "Expresión cron inválida: …" /
 * "…no produce una próxima ejecución"), no una clave de diccionario de mensajes (C7).
 */
export function isInvalidCronError(error: unknown): boolean {
  return (
    isApiError(error) && error.status === 400 && (error.payload.message ?? "").includes("cron")
  );
}

/** GET /athletes/{athleteId}/report — dashboard del deportista en UNA llamada. */
export async function fetchAthleteReport(athleteId: number): Promise<IndividualReportResponse> {
  return apiFetch<IndividualReportResponse>(ATHLETE_REPORT_RESOURCE(athleteId));
}

/** GET /reports/team?category= — `category` SOLO si está presente (todas si no). */
export async function fetchTeamReport(category?: string): Promise<TeamReportResponse> {
  const params = new URLSearchParams();
  if (category !== undefined && category !== "") {
    params.set("category", category);
  }
  const queryString = params.toString();
  return apiFetch<TeamReportResponse>(
    queryString ? `${TEAM_REPORT_RESOURCE}?${queryString}` : TEAM_REPORT_RESOURCE,
  );
}

/** GET /reports?type=&athleteId=&status= — query string CONDICIONAL (C5). */
export async function fetchReports(filters: ReportsFilters = {}): Promise<ReportResponse[]> {
  const params = new URLSearchParams();
  if (filters.type !== undefined) {
    params.set("type", filters.type);
  }
  if (filters.athleteId !== undefined) {
    params.set("athleteId", String(filters.athleteId));
  }
  if (filters.status !== undefined) {
    params.set("status", filters.status);
  }
  const queryString = params.toString();
  return apiFetch<ReportResponse[]>(
    queryString ? `${REPORTS_RESOURCE}?${queryString}` : REPORTS_RESOURCE,
  );
}

/** `enabled=false` evita disparar `/athletes/NaN/report` si el id de la URL no es numérico. */
export function useAthleteReport(athleteId: number, enabled = true) {
  return useQuery({
    queryKey: athleteReportKey(athleteId),
    queryFn: () => fetchAthleteReport(athleteId),
    enabled,
  });
}

export function useTeamReport(category?: string) {
  return useQuery({
    queryKey: teamReportKey(category),
    queryFn: () => fetchTeamReport(category),
    staleTime: HEAVY_REPORT_STALE_TIME_MS,
  });
}

export function useReports(filters: ReportsFilters = {}) {
  return useQuery({
    queryKey: reportsListKey(filters),
    queryFn: () => fetchReports(filters),
  });
}

/** El detalle YA trae `exports` embebidos: no se consume `GET /reports/{id}/exports`. */
export function useReport(id: number, enabled = true) {
  return useQuery({
    queryKey: reportDetailKey(id),
    queryFn: () => apiFetch<ReportDetailResponse>(reportDetailResource(id)),
    enabled,
  });
}

export function useReportSchedules() {
  return useQuery({
    queryKey: REPORT_SCHEDULES_KEY,
    queryFn: () => apiFetch<ReportScheduleResponse[]>(REPORT_SCHEDULES_RESOURCE),
  });
}

/**
 * POST /reports — generación SÍNCRONA (T3). El back responde `201` con
 * `ReportDetailResponse` (código del back > design): la `status` de la respuesta ya
 * es final y los `exports` vienen incluidos. Invalida la biblioteca en TODAS sus
 * variantes de filtro.
 */
export function useGenerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...REPORTS_ROOT_KEY, "generate-report"],
    mutationFn: (body: GenerateReportRequest) =>
      apiFetch<ReportDetailResponse>(REPORTS_RESOURCE, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORTS_LIST_KEY_PREFIX });
    },
  });
}

/** DELETE /reports/{id} (soft delete, 204) → invalida la lista y el detalle. */
export function useDeleteReport(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...REPORTS_ROOT_KEY, "delete-report", id],
    mutationFn: () => apiFetch<void>(reportDetailResource(id), { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORTS_LIST_KEY_PREFIX });
      void queryClient.invalidateQueries({ queryKey: reportDetailKey(id) });
    },
  });
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...REPORTS_ROOT_KEY, "create-schedule"],
    mutationFn: (body: CreateReportScheduleRequest) =>
      apiFetch<ReportScheduleResponse>(REPORT_SCHEDULES_RESOURCE, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY });
    },
  });
}

/** PUT /report-schedules/{id} — body COMPLETO (todos los campos, como C7 de chequeos). */
export function useUpdateReportSchedule(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...REPORTS_ROOT_KEY, "update-schedule", id],
    mutationFn: (body: UpdateReportScheduleRequest) =>
      apiFetch<ReportScheduleResponse>(reportScheduleResource(id), { method: "PUT", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY });
    },
  });
}

/** DELETE /report-schedules/{id} (soft delete, 204; solo ADMIN). */
export function useDeleteReportSchedule(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...REPORTS_ROOT_KEY, "delete-schedule", id],
    mutationFn: () => apiFetch<void>(reportScheduleResource(id), { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY });
    },
  });
}

/**
 * GET /reports/{id}/export — descarga imperativa (no es una query): un `<a href>`
 * no lleva el JWT, así que el binario se pide por `apiFetchBlob` (mismo pipeline
 * 401/403; un 401 responde JSON, nunca se abre como blob). El consumidor crea la
 * Blob URL y usa `fileName`.
 */
export async function downloadReportExport(id: number): Promise<BlobResponse> {
  return apiFetchBlob(reportExportResource(id));
}
