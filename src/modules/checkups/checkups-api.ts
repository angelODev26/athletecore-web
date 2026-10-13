import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";

import { apiFetch, isApiError, moduleQueryKey } from "@/lib/api";
import type {
  AddCheckupTimeRequest,
  CheckupDetailResponse,
  CheckupResponse,
  CreateCheckupRequest,
  MedalProjectionResponse,
  NationalReferenceTimeListItemResponse,
  NationalReferenceTimeRequest,
  TimeComparisonResponse,
} from "@/lib/api/types";

/*
 * Capa de datos del módulo chequeos (contrato docs/backend-contract/06).
 * Regla transversal: el front nunca formatea tiempos ni calcula clasificaciones —
 * todo valor visible usa los campos `*Formatted` del servidor tal cual.
 * Comparación y proyección pueden responder 409 por triple de referencia
 * incompleto: es un estado de datos (C5), no un fallo transitorio.
 */

const ATHLETE_CHECKUPS_RESOURCE = (athleteId: number) => `/athletes/${athleteId}/checkups`;
const CHECKUPS_RESOURCE = "/checkups";
const CHECKUP_TIMES_RESOURCE = (checkupId: number) => `/checkups/${checkupId}/times`;
const PROJECTIONS_RESOURCE = (athleteId: number) => `/athletes/${athleteId}/projections`;
const NATIONAL_REFERENCE_RESOURCE = "/national-reference-times";

const CHECKUPS_ROOT_KEY = moduleQueryKey("checkups");

/** Lista del atleta: la clave incluye los filtros (el filtro es server-side). */
export function athleteCheckupsKey(athleteId: number, year?: number, month?: number): QueryKey {
  const key: unknown[] = [...CHECKUPS_ROOT_KEY, "athlete", athleteId];
  if (year !== undefined) {
    key.push(year);
  }
  if (month !== undefined) {
    key.push(month);
  }
  return key;
}

/** Prefijo de todas las variantes de filtro de la lista de un atleta (C8). */
export function athleteCheckupsKeyPrefix(athleteId: number): QueryKey {
  return [...CHECKUPS_ROOT_KEY, "athlete", athleteId];
}

export function checkupDetailKey(id: number): QueryKey {
  return [...CHECKUPS_ROOT_KEY, "detail", id];
}

export function athleteProjectionsKey(athleteId: number): QueryKey {
  return [...CHECKUPS_ROOT_KEY, "projections", athleteId];
}

export const NATIONAL_REFERENCE_LIST_KEY = [...CHECKUPS_ROOT_KEY, "national-reference"] as const;

/** GET /checkups/{id}/comparison (bajo demanda: `enabled` lo controla la vista). */
export function checkupComparisonKey(checkupId: number): QueryKey {
  return [...CHECKUPS_ROOT_KEY, "comparison", checkupId];
}

/**
 * 409 del contrato por triple de referencia incompleto (comparación/proyección).
 * El mensaje es dinámico ("No existe el triple completo ..."), por eso se detecta
 * por estado + texto y no por clave de diccionario (C5).
 */
export function isIncompleteReferenceError(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.status === 409 &&
    error.payload.message.includes("triple completo")
  );
}

/** GET /athletes/{athleteId}/checkups — incluye `year`/`month` SOLO si están presentes. */
export async function fetchAthleteCheckups(
  athleteId: number,
  filters: { year?: number; month?: number } = {},
): Promise<CheckupResponse[]> {
  const params = new URLSearchParams();
  if (filters.year !== undefined) {
    params.set("year", String(filters.year));
  }
  if (filters.month !== undefined) {
    params.set("month", String(filters.month));
  }
  const queryString = params.toString();
  return apiFetch<CheckupResponse[]>(
    queryString ? `${ATHLETE_CHECKUPS_RESOURCE(athleteId)}?${queryString}` : ATHLETE_CHECKUPS_RESOURCE(athleteId),
  );
}

export function useAthleteCheckups(
  athleteId: number,
  filters: { year?: number; month?: number } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: athleteCheckupsKey(athleteId, filters.year, filters.month),
    queryFn: () => fetchAthleteCheckups(athleteId, filters),
    enabled,
  });
}

export function useCheckup(id: number, enabled = true) {
  return useQuery({
    queryKey: checkupDetailKey(id),
    queryFn: () => apiFetch<CheckupDetailResponse>(`${CHECKUPS_RESOURCE}/${id}`),
    enabled,
  });
}

export function useAthleteProjections(athleteId: number) {
  return useQuery({
    queryKey: athleteProjectionsKey(athleteId),
    queryFn: () => apiFetch<MedalProjectionResponse[]>(PROJECTIONS_RESOURCE(athleteId)),
  });
}

/** Comparación lazy: `enabled=false` hasta que el usuario pulsa "Comparar" (C8). */
export function useCheckupComparison(checkupId: number, enabled: boolean) {
  return useQuery({
    queryKey: checkupComparisonKey(checkupId),
    queryFn: () => apiFetch<TimeComparisonResponse[]>(`${CHECKUPS_RESOURCE}/${checkupId}/comparison`),
    enabled,
    retry: false, // el 409 "triple incompleto" es un estado de datos, no transitorio
  });
}

export function useNationalReferenceTimes() {
  return useQuery({
    queryKey: NATIONAL_REFERENCE_LIST_KEY,
    queryFn: () => apiFetch<NationalReferenceTimeListItemResponse[]>(NATIONAL_REFERENCE_RESOURCE),
  });
}

/** POST /athletes/{athleteId}/checkups → invalida la lista en todas sus variantes de filtro. */
export function useCreateCheckup(athleteId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...CHECKUPS_ROOT_KEY, "create-checkup", athleteId],
    mutationFn: (body: CreateCheckupRequest) =>
      apiFetch<CheckupResponse>(ATHLETE_CHECKUPS_RESOURCE(athleteId), { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: athleteCheckupsKeyPrefix(athleteId) });
    },
  });
}

/** DELETE /checkups/{id} → invalida la lista del atleta (variantes de filtro) + el detalle. */
export function useDeleteCheckup(id: number, athleteId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...CHECKUPS_ROOT_KEY, "delete-checkup", id],
    mutationFn: () => apiFetch<void>(`${CHECKUPS_RESOURCE}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: athleteCheckupsKeyPrefix(athleteId) });
      void queryClient.invalidateQueries({ queryKey: checkupDetailKey(id) });
    },
  });
}

/** POST /checkups/{checkupId}/times → invalida el detalle (los tiempos van embebidos). */
export function useAddCheckupTime(checkupId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...CHECKUPS_ROOT_KEY, "add-time", checkupId],
    mutationFn: (body: AddCheckupTimeRequest) =>
      apiFetch<unknown>(CHECKUP_TIMES_RESOURCE(checkupId), { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: checkupDetailKey(checkupId) });
      // Enmienda a C8: si el usuario ya lanzó la comparación (query activa y lazy),
      // tras agregar un tiempo el panel debe refetchearse — sin este invalidate la
      // comparación queda stale para el resto de la sesión de la página.
      void queryClient.invalidateQueries({ queryKey: checkupComparisonKey(checkupId) });
    },
  });
}

/** POST /national-reference-times → invalida la lista de la matriz. */
export function useCreateReferenceTime() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...CHECKUPS_ROOT_KEY, "create-reference"],
    mutationFn: (body: NationalReferenceTimeRequest) =>
      apiFetch<NationalReferenceTimeListItemResponse>(NATIONAL_REFERENCE_RESOURCE, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NATIONAL_REFERENCE_LIST_KEY });
    },
  });
}

/** PUT /national-reference-times/{id} — body COMPLETO (los 5 campos, C7). */
export function useUpdateReferenceTime(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...CHECKUPS_ROOT_KEY, "update-reference", id],
    mutationFn: (body: NationalReferenceTimeRequest) =>
      apiFetch<NationalReferenceTimeListItemResponse>(`${NATIONAL_REFERENCE_RESOURCE}/${id}`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NATIONAL_REFERENCE_LIST_KEY });
    },
  });
}

export function useDeleteReferenceTime(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...CHECKUPS_ROOT_KEY, "delete-reference", id],
    mutationFn: () => apiFetch<void>(`${NATIONAL_REFERENCE_RESOURCE}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NATIONAL_REFERENCE_LIST_KEY });
    },
  });
}
