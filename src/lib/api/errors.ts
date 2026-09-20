export interface ErrorResponse {
  status: number;
  error: string;
  message: string;
  details?: string;
  timestamp?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ErrorResponse;

  constructor(status: number, payload: ErrorResponse) {
    super(payload.message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isForbiddenError(error: unknown): error is ApiError {
  return isApiError(error) && error.status === 403;
}

export function toErrorResponse(status: number, statusText: string, body: unknown): ErrorResponse {
  if (typeof body === "object" && body !== null && "message" in body) {
    const partial = body as Record<string, unknown>;
    return {
      status: typeof partial.status === "number" ? partial.status : status,
      error: typeof partial.error === "string" ? partial.error : statusText,
      message: typeof partial.message === "string" ? partial.message : statusText,
      details: typeof partial.details === "string" ? partial.details : undefined,
      timestamp: typeof partial.timestamp === "string" ? partial.timestamp : undefined,
    };
  }

  return {
    status,
    error: statusText,
    message: statusText || "Error inesperado",
  };
}
