import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { apiFetch, moduleQueryKey, toPageModel } from "@/lib/api";
import type { PageModel } from "@/lib/api";
import type {
  AthleteResponse,
  AttendanceAlertResponse,
  CreateCycleRequest,
  CreateSessionRequest,
  RegisterAttendanceRequest,
  SessionDetailResponse,
  SessionResponse,
  TrainingPlanDetailResponse,
  TrainingPlanResponse,
  UpdateSessionRequest,
  CreateTrainingPlanRequest,
} from "@/lib/api/types";

/*
 * Capa de datos del módulo entrenamientos (contrato docs/backend-contract/05).
 * `GET /training-plans` y `GET /alerts/attendance` NO pagan en el back (doc 08 §3):
 * los hooks devuelven el array completo y la UI pagina en cliente (decisión D2/T2).
 * El acknowledge de alertas NO tiene hook: no persiste nada y la UI nunca lo llama (T7).
 */

const PLANS_RESOURCE = "/training-plans";
const SESSIONS_RESOURCE = "/training-sessions";
const ALERTS_RESOURCE = "/alerts/attendance";
const CYCLE_SESSIONS_RESOURCE = (cycleId: number) => `/training-cycles/${cycleId}/sessions`;

const TRAINING_ROOT_KEY = moduleQueryKey("training");
export const trainingPlansListKey = [...TRAINING_ROOT_KEY, "plans"] as const;
export const attendanceAlertsKey = [...TRAINING_ROOT_KEY, "attendance-alerts"] as const;

export function trainingPlanDetailKey(planId: number): QueryKey {
  return [...TRAINING_ROOT_KEY, "plan", planId];
}

export function sessionDetailKey(sessionId: number): QueryKey {
  return [...TRAINING_ROOT_KEY, "session", sessionId];
}

/** Prefijo común de las listas de sesiones por ciclo (para invalidación por prefijo, C2). */
export const cycleSessionsKeyPrefix = [...TRAINING_ROOT_KEY, "cycle-sessions"] as const;

/** Sesiones de un ciclo (endpoint plano del contrato 05 §3). */
export function cycleSessionsKey(cycleId: number): QueryKey {
  return [...cycleSessionsKeyPrefix, cycleId];
}

/**
 * C2: invalida las listas de sesiones por ciclo tras mutar una sesión. Con `cycleId`
 * conocido invalida solo su lista; sin él (DELETE responde 204 sin body) invalida por
 * prefijo todas las listas de ciclos — seguro y sin dejar caché obsoleta.
 */
function invalidateCycleSessions(queryClient: QueryClient, cycleId: number | null | undefined): void {
  void queryClient.invalidateQueries({
    queryKey: cycleId != null ? cycleSessionsKey(cycleId) : cycleSessionsKeyPrefix,
  });
}

/** Listado completo de deportistas para la planilla de pase de lista (C9: factory del módulo). */
export const allAthletesKey = [...TRAINING_ROOT_KEY, "athletes-all"] as const;

/** Shape mínimo de la Spring `Page` de `GET /athletes` (doc 04 §2). */
interface SpringAthletePage {
  content?: AthleteResponse[];
  last?: boolean;
  totalElements?: number;
}

/**
 * Agota `GET /athletes` (server-side, único listado paginado) para armar la planilla
 * de pase de lista (T6). La lista de athletes SIGUE siendo server-side; esto solo
 * consume todas sus páginas (size 100) hasta `last`.
 */
export async function fetchAllAthletes(): Promise<AthleteResponse[]> {
  const athletes: AthleteResponse[] = [];
  const pageSize = 100;

  for (let page = 0; ; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      size: String(pageSize),
      sort: "lastName,asc",
    });
    const response = await apiFetch<SpringAthletePage | AthleteResponse[]>(
      `/athletes?${params.toString()}`,
    );
    const pageModel = toPageModel<AthleteResponse>(response, page, pageSize);
    athletes.push(...pageModel.items);

    const isLast = Array.isArray(response) ? true : response.last ?? false;
    if (isLast || pageModel.items.length === 0) {
      return athletes;
    }
  }
}

export async function fetchTrainingPlans(): Promise<TrainingPlanResponse[]> {
  return apiFetch<TrainingPlanResponse[]>(PLANS_RESOURCE);
}

/**
 * T2 (D2): pagina en cliente un array completo del back. `toPageModel` envuelve el
 * array sin trocearlo (contrato del adapter, ver pagination.test.ts); el slice vive
 * aquí para que la migración futura a server-side sea un cambio local de este módulo.
 */
export function paginateClientSide<T>(items: T[], page: number, pageSize: number): PageModel<T> {
  const start = page * pageSize;
  return {
    ...toPageModel(items, page, pageSize),
    items: items.slice(start, start + pageSize),
  };
}

export async function fetchTrainingPlan(planId: number): Promise<TrainingPlanDetailResponse> {
  return apiFetch<TrainingPlanDetailResponse>(`${PLANS_RESOURCE}/${planId}`);
}

export function useTrainingPlans() {
  return useQuery({
    queryKey: trainingPlansListKey,
    queryFn: fetchTrainingPlans,
  });
}

/**
 * C5: `enabled=false` evita disparar `GET .../NaN` mientras el id de la URL no es
 * numérico (el guard de render muestra el estado "no encontrado").
 */
export function useTrainingPlan(planId: number, enabled = true) {
  return useQuery({
    queryKey: trainingPlanDetailKey(planId),
    queryFn: () => fetchTrainingPlan(planId),
    enabled,
  });
}

export function useSession(sessionId: number, enabled = true) {
  return useQuery({
    queryKey: sessionDetailKey(sessionId),
    queryFn: () => apiFetch<SessionDetailResponse>(`${SESSIONS_RESOURCE}/${sessionId}`),
    enabled,
  });
}

export function useAttendanceAlerts() {
  return useQuery({
    queryKey: attendanceAlertsKey,
    queryFn: () => apiFetch<AttendanceAlertResponse[]>(ALERTS_RESOURCE),
  });
}

/**
 * Sesiones de un ciclo: hook disponible pero SIN consumidores de UI hoy (T4 —
 * no existe listado global de sesiones en el back; las sueltas quedan inalcanzables).
 */
export function useCycleSessions(cycleId: number) {
  return useQuery({
    queryKey: cycleSessionsKey(cycleId),
    queryFn: () => apiFetch<SessionResponse[]>(CYCLE_SESSIONS_RESOURCE(cycleId)),
  });
}

export function useCreateTrainingPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "create-plan"],
    mutationFn: (body: CreateTrainingPlanRequest) =>
      apiFetch<TrainingPlanResponse>(PLANS_RESOURCE, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlansListKey });
    },
  });
}

/** PUT parcial (doc 05 §2): solo campos modificados. */
export function useUpdateTrainingPlan(planId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "update-plan", planId],
    mutationFn: (body: Partial<CreateTrainingPlanRequest>) =>
      apiFetch<TrainingPlanResponse>(`${PLANS_RESOURCE}/${planId}`, { method: "PUT", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlansListKey });
      void queryClient.invalidateQueries({ queryKey: trainingPlanDetailKey(planId) });
    },
  });
}

export function useDeleteTrainingPlan(planId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "delete-plan", planId],
    mutationFn: () => apiFetch<void>(`${PLANS_RESOURCE}/${planId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlansListKey });
      void queryClient.invalidateQueries({ queryKey: trainingPlanDetailKey(planId) });
    },
  });
}

/** Crear ciclo dentro del plan (solo ADMIN). Invalida el detalle (árbol) y la lista. */
export function useCreateCycle(planId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "create-cycle", planId],
    mutationFn: (body: CreateCycleRequest) =>
      apiFetch<unknown>(`${PLANS_RESOURCE}/${planId}/cycles`, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlansListKey });
      void queryClient.invalidateQueries({ queryKey: trainingPlanDetailKey(planId) });
    },
  });
}

/** Único camino de alta de sesiones en UI: anidado en un ciclo (T4). */
export function useCreateSession(cycleId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "create-session", cycleId],
    mutationFn: (body: CreateSessionRequest) =>
      apiFetch<SessionResponse>(CYCLE_SESSIONS_RESOURCE(cycleId), { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cycleSessionsKey(cycleId) });
    },
  });
}

export function useUpdateSession(sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "update-session", sessionId],
    mutationFn: (body: UpdateSessionRequest) =>
      apiFetch<SessionResponse>(`${SESSIONS_RESOURCE}/${sessionId}`, { method: "PUT", body }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: sessionDetailKey(sessionId) });
      // C2: la sesión vive en la lista de su ciclo (y cambiaron sus datos).
      invalidateCycleSessions(queryClient, updated?.cycleId);
    },
  });
}

/** `PUT .../status` recibe solo `{ status }` (doc 05 §3). */
export function useUpdateSessionStatus(sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "session-status", sessionId],
    mutationFn: (status: SessionResponse["status"]) =>
      apiFetch<SessionResponse>(`${SESSIONS_RESOURCE}/${sessionId}/status`, {
        method: "PUT",
        body: { status },
      }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: sessionDetailKey(sessionId) });
      invalidateCycleSessions(queryClient, updated?.cycleId);
    },
  });
}

export function useDeleteSession(sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "delete-session", sessionId],
    mutationFn: () => apiFetch<void>(`${SESSIONS_RESOURCE}/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionDetailKey(sessionId) });
      // C2: el DELETE responde 204 sin body (no hay cycleId) → invalidación por
      // prefijo: se refrescan las listas de todos los ciclos (sin ~30 s de caché).
      invalidateCycleSessions(queryClient, null);
    },
  });
}

/**
 * Upsert de asistencia (doc 05 §4): re-marcar corrige sin duplicar. El back responde
 * 201 también cuando actualiza. Invalida el detalle de la sesión (fuente de verdad).
 */
export function useUpsertAttendance(sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...TRAINING_ROOT_KEY, "upsert-attendance", sessionId],
    mutationFn: (body: RegisterAttendanceRequest) =>
      apiFetch<unknown>(`${SESSIONS_RESOURCE}/${sessionId}/attendance`, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionDetailKey(sessionId) });
    },
  });
}
