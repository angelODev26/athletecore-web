import type { Page } from "@playwright/test";

/*
 * Fixture de sesión sin UI (design.md C3 de e2e-flujos-criticos). `buildSessionStoragePayload`
 * es PURO (sin imports de Playwright) para que el guard Vitest
 * (src/lib/auth/session-store.shape.test.ts) pueda importarlo y comparar el envelope
 * contra el que persiste el store real. Fuente de verdad del shape:
 * src/lib/auth/session-store.ts (clave `athletecore.session`, partialize {tokens, expiresAt},
 * versión de zustand persist = 0).
 *
 * `loginAs` autentica por API (POST /auth/login, fuera del navegador) y siembra el
 * localStorage con el envelope exacto ANTES de que cargue la app — sin pasar por el
 * formulario de login.
 */

export const SESSION_STORAGE_KEY = "athletecore.session";

/** Origen del backend real (igual que src/lib/api/env.ts: API_BASE_URL + prefix). */
export const API_ORIGIN = "http://localhost:8080";
export const API_PREFIX = "/api/v1";

export type E2eRole = "ADMIN" | "USER";

/**
 * Credenciales del seed local. Procedencia real: precondición 3 de
 * `openspec/changes/archive/2026-10-12-integrar-athletes/tasks.md` (el doc 02 §6
 * habla de CSRF/BCrypt, no del seed).
 */
export const ROLE_CREDENTIALS: Record<E2eRole, { username: string; password: string }> = {
  ADMIN: { username: "admin.demo", password: "secret123" },
  USER: { username: "demo.user", password: "secret123" },
};

/**
 * Envelope EXACTO de `zustand persist` para "athletecore.session". Puro: sin
 * imports de Playwright — importable desde Vitest. El `expiresAt` se deriva del
 * claim `exp` del JWT igual que `setSession` (getExpiresAtMsFromToken: exp*1000,
 * null si falta).
 */
export function buildSessionStoragePayload(
  token: string,
  expiresAtMs: number | null,
): { state: { tokens: { access: string }; expiresAt: number | null }; version: 0 } {
  return {
    state: { tokens: { access: token }, expiresAt: expiresAtMs },
    version: 0,
  };
}

/** `exp` (segundos) del payload del JWT → ms epoch; null si el claim falta. */
export function expiresAtMsFromToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    // `atob` (no Buffer): el guard Vitest type-checkea este archivo bajo lib DOM.
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(globalThis.atob(padded)) as { exp?: unknown };
    const exp = payload.exp;
    if (typeof exp === "number" && Number.isFinite(exp)) {
      return exp * 1000;
    }
    if (typeof exp === "string" && exp.trim() !== "" && Number.isFinite(Number(exp))) {
      return Number(exp) * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

interface LoginApiResponse {
  token?: string;
}

/**
 * Login por API + siembra directa del localStorage + navegación al dashboard.
 * El assert del shell (`dashboard-page`) confirma que la sesión sembrada es válida
 * para el guard RequireAuth.
 */
export async function loginAs(page: Page, role: E2eRole): Promise<string> {
  const response = await page.request.post(`${API_ORIGIN}${API_PREFIX}/auth/login`, {
    data: ROLE_CREDENTIALS[role],
  });
  if (!response.ok()) {
    throw new Error(`loginAs(${role}): POST /auth/login respondió ${response.status()}`);
  }
  const body = (await response.json()) as LoginApiResponse;
  if (!body.token) {
    throw new Error(`loginAs(${role}): la respuesta no contiene token`);
  }

  // Seembra previa a CUALQUIER script de la app (addInitScript corre en cada navegación).
  const payload = buildSessionStoragePayload(body.token, expiresAtMsFromToken(body.token));
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value as string);
    },
    [SESSION_STORAGE_KEY, JSON.stringify(payload)],
  );

  await page.goto("/");
  await page.getByTestId("dashboard-page").waitFor({ state: "visible" });
  return body.token;
}

/** Abre la app autenticada (C6: DRY entre specs). */
export async function openApp(page: Page, role: E2eRole): Promise<string> {
  return loginAs(page, role);
}
