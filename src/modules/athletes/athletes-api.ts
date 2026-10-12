import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";

import { apiFetch, isApiError, moduleQueryKey, toPageModel } from "@/lib/api";
import type { PageModel } from "@/lib/api";
import type {
  AssignSportsRequest,
  AthleteCreateRequest,
  AthleteProfileResponse,
  AthleteProfileUpsertRequest,
  AthleteResponse,
  AthleteUpdateRequest,
  SportResponse,
} from "@/lib/api/types";

/*
 * Capa de datos del módulo deportistas (contrato docs/backend-contract/04).
 * `GET /athletes` es el ÚNICO listado paginado de la API: se pagina SIEMPRE
 * server-side (decisión A1 del design.md), nunca en memoria.
 */

/** Orden fijo del contrato: no hay búsqueda ni filtros (doc 04 §1). */
const ATHLETES_SORT = "lastName,asc";
const ATHLETES_RESOURCE = "/athletes";

const ATHLETES_ROOT_KEY = moduleQueryKey("athletes");
export const ATHLETES_LIST_KEY = [...ATHLETES_ROOT_KEY, "list"] as const;
export const SPORTS_CATALOG_KEY = [...ATHLETES_ROOT_KEY, "sports-catalog"] as const;

export function athletesPageKey(page: number, size: number): QueryKey {
  return [...ATHLETES_LIST_KEY, page, size];
}

export function athleteDetailKey(id: number): QueryKey {
  return [...ATHLETES_ROOT_KEY, "detail", id];
}

export function athleteProfileKey(id: number): QueryKey {
  return [...ATHLETES_ROOT_KEY, "profile", id];
}

export function athleteSportsKey(id: number): QueryKey {
  return [...ATHLETES_ROOT_KEY, "sports", id];
}

/** Shape mínimo de la Spring `Page` que envía el back (doc 04 §2). */
interface SpringPage<T> {
  content?: T[];
  number?: number;
  size?: number;
  totalElements?: number;
}

export async function fetchAthletesPage(page: number, size: number): Promise<PageModel<AthleteResponse>> {
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
    sort: ATHLETES_SORT,
  });
  const response = await apiFetch<SpringPage<AthleteResponse> | AthleteResponse[]>(
    `${ATHLETES_RESOURCE}?${params.toString()}`,
  );
  return toPageModel<AthleteResponse>(response, page, size);
}

export async function fetchAthlete(id: number): Promise<AthleteResponse> {
  return apiFetch<AthleteResponse>(`${ATHLETES_RESOURCE}/${id}`);
}

/**
 * 404 = "sin perfil" (doc 04 §3): no es un error de UI, se traduce a `null`.
 * Cualquier otro error se propaga tal cual.
 */
export async function fetchAthleteProfile(id: number): Promise<AthleteProfileResponse | null> {
  try {
    return await apiFetch<AthleteProfileResponse>(`${ATHLETES_RESOURCE}/${id}/profile`);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchAthleteSportIds(id: number): Promise<number[]> {
  return apiFetch<number[]>(`${ATHLETES_RESOURCE}/${id}/sports`);
}

export async function fetchSportsCatalog(): Promise<SportResponse[]> {
  return apiFetch<SportResponse[]>(`${ATHLETES_RESOURCE}/sports`);
}

export function useAthletesPage(page: number, size: number) {
  return useQuery({
    queryKey: athletesPageKey(page, size),
    queryFn: () => fetchAthletesPage(page, size),
    // A1: conservar la página anterior visible mientras llega la siguiente.
    placeholderData: keepPreviousData,
  });
}

export function useAthlete(id: number) {
  return useQuery({
    queryKey: athleteDetailKey(id),
    queryFn: () => fetchAthlete(id),
  });
}

export function useAthleteProfile(id: number) {
  return useQuery({
    queryKey: athleteProfileKey(id),
    queryFn: () => fetchAthleteProfile(id),
    retry: false,
  });
}

export function useAthleteSportIds(id: number) {
  return useQuery({
    queryKey: athleteSportsKey(id),
    queryFn: () => fetchAthleteSportIds(id),
  });
}

/** Catálogo casi estático (doc 04 §5 invita a cachearlo). */
export function useSportsCatalog() {
  return useQuery({
    queryKey: SPORTS_CATALOG_KEY,
    queryFn: fetchSportsCatalog,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreateAthlete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...ATHLETES_ROOT_KEY, "create"],
    mutationFn: (body: AthleteCreateRequest) =>
      apiFetch<AthleteResponse>(ATHLETES_RESOURCE, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ATHLETES_LIST_KEY });
    },
  });
}

export function useUpdateAthlete(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...ATHLETES_ROOT_KEY, "update", id],
    mutationFn: (body: AthleteUpdateRequest) =>
      apiFetch<AthleteResponse>(`${ATHLETES_RESOURCE}/${id}`, { method: "PUT", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ATHLETES_LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: athleteDetailKey(id) });
    },
  });
}

export function useDeleteAthlete(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...ATHLETES_ROOT_KEY, "delete", id],
    mutationFn: () => apiFetch<void>(`${ATHLETES_RESOURCE}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ATHLETES_LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: athleteDetailKey(id) });
    },
  });
}

/** Upsert (POST, siempre 200 — doc 04 §3). La lista no muestra datos de perfil. */
export function useUpsertAthleteProfile(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...ATHLETES_ROOT_KEY, "profile-upsert", id],
    mutationFn: (body: AthleteProfileUpsertRequest) =>
      apiFetch<AthleteProfileResponse>(`${ATHLETES_RESOURCE}/${id}/profile`, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: athleteProfileKey(id) });
    },
  });
}

/** Reemplazo total (doc 04 §4): se envía siempre el set final completo. */
export function useAssignAthleteSports(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...ATHLETES_ROOT_KEY, "assign-sports", id],
    mutationFn: (body: AssignSportsRequest) =>
      apiFetch<number[]>(`${ATHLETES_RESOURCE}/${id}/sports`, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: athleteSportsKey(id) });
    },
  });
}
