import { describe, expect, it } from "vitest";

import { ApiError, isApiError, isForbiddenError, toErrorResponse } from "./errors";

describe("toErrorResponse", () => {
  it("conserva details tal cual (errores 400 concatenados del contrato)", () => {
    const body = {
      timestamp: "2026-09-06 14:32:10",
      status: 400,
      error: "Bad Request",
      message: "Error de validación",
      details: "El peso debe ser al menos 1.0 kg, La talla es obligatoria",
    };

    expect(toErrorResponse(400, "Bad Request", body)).toEqual(body);
  });

  it("construye un fallback cuando el body no es ErrorResponse", () => {
    const error = toErrorResponse(503, "Service Unavailable", null);
    expect(error.status).toBe(503);
    expect(error.message).toBe("Service Unavailable");
    expect(error.details).toBeUndefined();
  });
});

describe("ApiError", () => {
  it("expone status y payload, y se reconoce con los type guards", () => {
    const error = new ApiError(403, { status: 403, error: "Forbidden", message: "Acceso denegado" });
    expect(isApiError(error)).toBe(true);
    expect(isForbiddenError(error)).toBe(true);
    expect(isForbiddenError(new ApiError(401, { status: 401, error: "Unauthorized", message: "Autenticación requerida" }))).toBe(false);
  });
});
