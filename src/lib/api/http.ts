import { useSessionStore } from "@/lib/auth/session-store";

import { API_BASE_URL, API_PREFIX } from "./env";
import { ApiError, toErrorResponse } from "./errors";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

type ForbiddenHandler = (error: ApiError) => void;

let forbiddenHandler: ForbiddenHandler | null = null;

export function setForbiddenHandler(handler: ForbiddenHandler | null): void {
  forbiddenHandler = handler;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { auth = true, timeoutMs = DEFAULT_TIMEOUT_MS, headers, body, ...init } = options;

  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");

  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const accessToken = useSessionStore.getState().tokens?.access;
    if (accessToken) {
      requestHeaders.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  const payload = toErrorResponse(response.status, response.statusText, await parseBody(response));
  const error = new ApiError(response.status, payload);

  if (response.status === 401) {
    useSessionStore.getState().clearSession();
    redirectToLogin();
  } else if (response.status === 403) {
    forbiddenHandler?.(error);
  }

  throw error;
}

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${API_PREFIX}${normalizedPath}`;
}

async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function redirectToLogin(): void {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}
