import type { APIRequestContext } from "@playwright/test";

import { API_ORIGIN, API_PREFIX } from "./session";

/*
 * Fábrica de datos por API (design.md C4 de e2e-flujos-criticos). Cada spec crea
 * SUS datos al empezar con sufijos únicos (`e2e-<spec>-<ts>`) y limpia al terminar
 * el test (teardown del fixture `cleanup` de fixtures/harness.ts, siempre — éxito
 * o fallo; best-effort: el soft delete universal hace los restos invisibles).
 * Endpoints y DTOs: idénticos a los de src/modules/*-api.ts (contrato docs 03–07).
 */

/** Triple de referencia RESERVADO para E2E: ningún usuario real usa 999 m. */
export const RESERVED_REFERENCE = {
  style: "MARIPOSA",
  distance: 999,
  category: "INFANTIL",
  times: { 1: 55.0, 2: 57.0, 3: 59.0 } as Record<number, number>,
} as const;

export interface E2eApi {
  request: APIRequestContext;
  token: string;
}

export interface E2eAthlete {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
}

export interface E2ePlan {
  id: number;
  name: string;
}

export interface E2eCycle {
  id: number;
  type: string;
  name: string;
}

export interface E2eSession {
  id: number;
  cycleId: number | null;
  sessionDate: string;
  status: string;
}

export interface E2eCheckup {
  id: number;
  athleteId: number;
  year: number;
  month: number;
  category: string;
}

export interface E2eReferenceTime {
  id: number;
  position: number;
  timeFormatted: string;
}

// ─────────────────────────── transporte ───────────────────────────

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** POST con JSON; falla el test si el status no es el esperado. */
async function postJson<T>(
  api: E2eApi,
  path: string,
  body: unknown,
  expectedStatus = 201,
): Promise<T> {
  const response = await api.request.post(`${API_ORIGIN}${API_PREFIX}${path}`, {
    headers: authHeaders(api.token),
    data: body,
  });
  if (response.status() !== expectedStatus) {
    throw new Error(`POST ${path} → ${response.status()} (esperaba ${expectedStatus}): ${await response.text()}`);
  }
  // El contrato no define ningún POST que devuelva 204 (creates → 201): si el
  // status esperado cambia algún día, que el helper falle sin rama fantasma.
  return (await response.json()) as T;
}

/** DELETE best-effort: 204/404 son aceptables (soft delete universal). */
async function deleteOk(api: E2eApi, path: string): Promise<void> {
  const response = await api.request.delete(`${API_ORIGIN}${API_PREFIX}${path}`, {
    headers: authHeaders(api.token),
  });
  if (response.status() !== 204 && response.status() !== 404) {
    throw new Error(`DELETE ${path} → ${response.status()}: ${await response.text()}`);
  }
}

/** GET con JSON; falla el test si el status no es 200. */
async function getJson<T>(api: E2eApi, path: string): Promise<T> {
  const response = await api.request.get(`${API_ORIGIN}${API_PREFIX}${path}`, {
    headers: authHeaders(api.token),
  });
  if (response.status() !== 200) {
    throw new Error(`GET ${path} → ${response.status()}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

// ─────────────────────────── identidad de datos ───────────────────────────

/** Sufijo único por spec+timestamp: jamás depender de conteos globales (C4). */
export function uniqueSuffix(spec: string): string {
  return `e2e-${spec}-${Date.now()}`;
}

// ─────────────────────────── deportistas (doc 04) ───────────────────────────

/** POST /athletes → 201. `photoUrl` opcional (D5). */
export async function createAthlete(api: E2eApi, spec: string): Promise<E2eAthlete> {
  const suffix = uniqueSuffix(spec);
  const body = {
    username: `usr_${suffix}`,
    email: `${suffix}@e2e.athletecore.local`,
    firstName: `Nombre_${suffix}`,
    lastName: `Apellido_${suffix}`,
  };
  const created = await postJson<E2eAthlete>(api, "/athletes", body);
  return { ...created, fullName: created.fullName ?? `${created.firstName} ${created.lastName}` };
}

/** DELETE /athletes/{id} → 204 (soft delete). */
export async function softDeleteAthlete(api: E2eApi, athleteId: number): Promise<void> {
  await deleteOk(api, `/athletes/${athleteId}`);
}

// ─────────────────────────── entrenamientos (doc 05) ───────────────────────────

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  // Fecha LOCAL en ISO (yyyy-mm-dd): `toISOString()` convertiría a UTC y en husos
  // negativos devolvería el día siguiente.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** POST /training-plans → 201. */
export async function createPlan(api: E2eApi, spec: string): Promise<E2ePlan> {
  const suffix = uniqueSuffix(spec);
  const created = await postJson<E2ePlan & { startDate: string; endDate: string }>(
    api,
    "/training-plans",
    {
      name: `Plan ${suffix}`,
      startDate: isoDate(-30),
      endDate: isoDate(90),
      description: `Plan E2E ${suffix}`,
    },
  );
  return { id: created.id, name: created.name };
}

/** POST /training-plans/{planId}/cycles → 201 (MESOCICLO raíz o MICROCICLO anidado). */
export async function createCycle(
  api: E2eApi,
  planId: number,
  type: "MESOCICLO" | "MICROCICLO",
  name: string,
  orderIndex: number,
  parentCycleId?: number,
): Promise<E2eCycle> {
  const created = await postJson<E2eCycle>(api, `/training-plans/${planId}/cycles`, {
    type,
    name,
    startDate: isoDate(-7),
    endDate: isoDate(30),
    orderIndex,
    ...(parentCycleId !== undefined ? { parentCycleId } : {}),
  });
  return { id: created.id, type: created.type, name: created.name };
}

/** POST /training-cycles/{cycleId}/sessions → 201. */
export async function createSession(
  api: E2eApi,
  cycleId: number,
  sessionDate = isoDate(0),
): Promise<E2eSession> {
  return postJson<E2eSession>(api, `/training-cycles/${cycleId}/sessions`, {
    sessionDate,
    startTime: "10:00:00",
    status: "PROGRAMADA",
  });
}

/**
 * Plan + mesociclo + microciclo + sesión en una llamada (rápido: ya está testeado
 * en unit; el E2E solo necesita la sesión viva para el pase de lista).
 */
export async function createPlanWithCycleAndSession(
  api: E2eApi,
  spec: string,
): Promise<{ plan: E2ePlan; meso: E2eCycle; micro: E2eCycle; session: E2eSession }> {
  const plan = await createPlan(api, spec);
  const meso = await createCycle(api, plan.id, "MESOCICLO", `Meso ${uniqueSuffix(spec)}`, 1);
  const micro = await createCycle(
    api,
    plan.id,
    "MICROCICLO",
    `Micro ${uniqueSuffix(spec)}`,
    1,
    meso.id,
  );
  const session = await createSession(api, micro.id);
  return { plan, meso, micro, session };
}

export async function softDeleteSession(api: E2eApi, sessionId: number): Promise<void> {
  await deleteOk(api, `/training-sessions/${sessionId}`);
}

export async function softDeletePlan(api: E2eApi, planId: number): Promise<void> {
  await deleteOk(api, `/training-plans/${planId}`);
}

// ─────────────────────────── chequeos (doc 06) ───────────────────────────

/** POST /athletes/{athleteId}/checkups → 201. */
export async function createCheckup(
  api: E2eApi,
  athleteId: number,
  year: number,
  month: number,
  category: string,
): Promise<E2eCheckup> {
  return postJson<E2eCheckup>(api, `/athletes/${athleteId}/checkups`, {
    athleteId,
    year,
    month,
    category,
  });
}

/** POST /checkups/{checkupId}/times → 201. `timeSeconds` > 0. */
export async function addCheckupTime(
  api: E2eApi,
  checkupId: number,
  style: string,
  distance: number,
  timeSeconds: number,
): Promise<void> {
  await postJson(api, `/checkups/${checkupId}/times`, { style, distance, timeSeconds });
}

export interface E2eCheckupDetail extends E2eCheckup {
  times: Array<{ id: number; style: string; distance: number; timeSeconds: number; timeFormatted: string }>;
}

/** GET /checkups/{id} → detalle con `times[].timeFormatted` del servidor. */
export async function fetchCheckupDetail(api: E2eApi, checkupId: number): Promise<E2eCheckupDetail> {
  return getJson<E2eCheckupDetail>(api, `/checkups/${checkupId}`);
}

export interface E2eComparisonPosition {
  position: number;
  referenceTimeFormatted: string;
  absoluteDiffFormatted: string;
  relativeDiffPercent: number;
}

export interface E2eComparison {
  style: string;
  distance: number;
  category: string;
  trialTimeFormatted: string;
  positions: E2eComparisonPosition[];
}

/** GET /checkups/{id}/comparison → `*Formatted` del servidor (regla dura F4). */
export async function fetchCheckupComparison(api: E2eApi, checkupId: number): Promise<E2eComparison[]> {
  return getJson<E2eComparison[]>(api, `/checkups/${checkupId}/comparison`);
}

export async function softDeleteCheckup(api: E2eApi, checkupId: number): Promise<void> {
  await deleteOk(api, `/checkups/${checkupId}`);
}

// ─────────────────────── tabla nacional (doc 06 §referencia) ───────────────────────

/**
 * Triple de referencia reservado (MARIPOSA / 999 / INFANTIL): crea las 3 posiciones
 * tolerando 409 de duplicado y devuelve las filas creadas (para el cleanup). Se
 * re-asegura antes de cada comparación por si otra sesión lo mutó a mitad de suite.
 */
export async function ensureReferenceTriple(api: E2eApi): Promise<E2eReferenceTime[]> {
  const created: E2eReferenceTime[] = [];
  for (const position of [1, 2, 3] as const) {
    const response = await api.request.post(`${API_ORIGIN}${API_PREFIX}/national-reference-times`, {
      headers: authHeaders(api.token),
      data: {
        style: RESERVED_REFERENCE.style,
        distance: RESERVED_REFERENCE.distance,
        category: RESERVED_REFERENCE.category,
        position,
        timeSeconds: RESERVED_REFERENCE.times[position],
      },
    });
    if (response.status() === 201) {
      created.push((await response.json()) as E2eReferenceTime);
    } else if (response.status() === 409) {
      // Ya existe (sembrado antes o por otra sesión): el triple sigue completo.
      continue;
    } else {
      throw new Error(
        `POST /national-reference-times (posición ${position}) → ${response.status()}: ${await response.text()}`,
      );
    }
  }
  return created;
}

/**
 * GET /national-reference-times (SIN query params: el back no los soporta —
 * `getAllReferences` devuelve TODAS las filas activas, igual que
 * `useNationalReferenceTimes` de src/modules/checkups/checkups-api.ts) y filtra
 * CLIENT-SIDE el triple reservado (review B1). Filtrar aquí y no en la URL es
 * lo que evita soft-deletar la tabla nacional completa: nunca mapear ids de
 * filas ajenas a la combinación (MARIPOSA / 999 / INFANTIL).
 */
async function fetchReservedReferenceIds(api: E2eApi): Promise<number[]> {
  const rows = await getJson<
    Array<{ id: number; style: string; distance: number; category: string }>
  >(api, "/national-reference-times");
  return rows
    .filter(
      (row) =>
        row.style === RESERVED_REFERENCE.style &&
        row.distance === RESERVED_REFERENCE.distance &&
        row.category === RESERVED_REFERENCE.category,
    )
    .map((row) => row.id);
}

/**
 * Cleanup del triple: borra TODAS las filas 999 m visibles (creadas por este spec
 * u otras sesiones) — la matriz de tabla nacional no conserva filas 999 m.
 */
export async function deleteReservedReferenceTriple(api: E2eApi): Promise<void> {
  for (const id of await fetchReservedReferenceIds(api)) {
    await deleteOk(api, `/national-reference-times/${id}`);
  }
}

// ─────────────────────────── reportes (doc 07) ───────────────────────────

/**
 * Sweep de reportes de UN atleta (idempotente; 404 tolerado): se registra ANTES de
 * generar desde la UI, así cubre un fallo entre la 201 y el detalle sin depender de
 * haber extraído el id del reporte. `GET /reports?athleteId=` es el filtro del contrato.
 */
export async function deleteReportsForAthlete(api: E2eApi, athleteId: number): Promise<void> {
  const reports = await getJson<Array<{ id: number; athleteId: number | null }>>(
    api,
    `/reports?athleteId=${athleteId}`,
  );
  for (const report of reports) {
    if (report.athleteId === athleteId) {
      await deleteOk(api, `/reports/${report.id}`);
    }
  }
}

// ─────────────────────────── helpers de spec ───────────────────────────

/**
 * Registro de limpieza: los specs añaden ids de lo que crean y `run()` los
 * borra en orden inverso de dependencia (best-effort: loguea sin tumbar el test).
 */
export class CleanupRegistry {
  private readonly steps: Array<() => Promise<void>> = [];

  add(step: () => Promise<void>): void {
    this.steps.push(step);
  }

  async run(): Promise<void> {
    for (const step of [...this.steps].reverse()) {
      try {
        await step();
      } catch (error) {
        console.warn("[e2e] cleanup best-effort falló:", error instanceof Error ? error.message : error);
      }
    }
    this.steps.length = 0;
  }
}
