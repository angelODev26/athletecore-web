import { useSessionStore } from "@/lib/auth/session-store";

import { API_BASE_URL, API_PREFIX } from "./env";
import { ApiError, toErrorResponse } from "./errors";
import type { ErrorResponse } from "./errors";

const DEFAULT_TIMEOUT_MS = 15_000;
const CONTENT_DISPOSITION_FILENAME = /filename="([^"]+)"/;
const UNEXPECTED_BINARY_MESSAGE = "El servidor no devolvió el archivo esperado";

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

/** Cuerpo binario devuelto por `apiFetchBlob` junto al nombre sugerido del archivo. */
export interface BlobResponse {
  blob: Blob;
  /** `filename="..."` del `Content-Disposition`; `null` si la cabecera no lo trae. */
  fileName: string | null;
}

type ForbiddenHandler = (error: ApiError) => void;

let forbiddenHandler: ForbiddenHandler | null = null;

export function setForbiddenHandler(handler: ForbiddenHandler | null): void {
  forbiddenHandler = handler;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await sendRequest(path, options);

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  const error = await buildResponseError(response);
  notifyAuthHandlers(error);
  throw error;
}

/**
 * GET binario (descarga de PDF: un `<a href>` no lleva el JWT) con la MISMA
 * pipeline de auth/timeout/401/403 que `apiFetch` — los handlers son los
 * compartidos. Un `401` responde JSON de error, no PDF: nunca se abre un blob
 * que no sea binario.
 */
export async function apiFetchBlob(
  path: string,
  options: ApiRequestOptions = {},
): Promise<BlobResponse> {
  // `Accept: */*`: es una descarga binaria, no se negocia JSON contra el PDF
  // (un `produces = "application/pdf"` en el back devolvería 406).
  const response = await sendRequest(path, options, "*/*");

  if (!response.ok) {
    const error = await buildResponseError(response);
    notifyAuthHandlers(error);
    throw error;
  }

  if (isJsonResponse(response)) {
    // 200 con cuerpo JSON = el servidor no envió el binario esperado (p. ej. un
    // error con 200 de un proxy). Se trata como error inesperado, sin blob.
    const payload = await buildUnexpectedJsonPayload(response);
    throw new ApiError(response.status, payload);
  }

  return {
    blob: await response.blob(),
    fileName: parseFileName(response.headers.get("Content-Disposition")),
  };
}

/**
 * Pipeline compartida: URL, headers (Accept/Bearer), body JSON, timeout y fetch.
 * `accept` es el default del transporte: JSON para `apiFetch`, comodín para las
 * descargas binarias. Nunca pisa un `Accept` que venga en `options.headers`.
 */
async function sendRequest(
  path: string,
  options: ApiRequestOptions,
  accept = "application/json",
): Promise<Response> {
  const { auth = true, timeoutMs = DEFAULT_TIMEOUT_MS, headers, body, ...init } = options;

  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", accept);
  }

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

  try {
    return await fetch(buildUrl(path), {
      ...init,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Convierte una respuesta `!ok` en `ApiError` parseando el body como ErrorResponse. */
async function buildResponseError(response: Response): Promise<ApiError> {
  const payload = toErrorResponse(response.status, response.statusText, await parseBody(response));
  return new ApiError(response.status, payload);
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

function isJsonResponse(response: Response): boolean {
  return (response.headers.get("Content-Type") ?? "").toLowerCase().includes("json");
}

/** Un body JSON inesperado se lee como ErrorResponse; si no lo es, mensaje propio. */
async function buildUnexpectedJsonPayload(response: Response): Promise<ErrorResponse> {
  const body = await parseBody(response);
  const looksLikeError = typeof body === "object" && body !== null && "message" in body;
  if (!looksLikeError) {
    return { status: response.status, error: response.statusText, message: UNEXPECTED_BINARY_MESSAGE };
  }
  const payload = toErrorResponse(response.status, response.statusText, body);
  return payload.message ? payload : { ...payload, message: UNEXPECTED_BINARY_MESSAGE };
}

function parseFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }
  return CONTENT_DISPOSITION_FILENAME.exec(contentDisposition)?.[1] ?? null;
}

/** Políticas fijas del cliente: `401` → limpiar sesión + login; `403` → sin permisos. */
function notifyAuthHandlers(error: ApiError): void {
  if (error.status === 401) {
    useSessionStore.getState().clearSession();
    redirectToLogin();
  } else if (error.status === 403) {
    forbiddenHandler?.(error);
  }
}

function redirectToLogin(): void {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}
