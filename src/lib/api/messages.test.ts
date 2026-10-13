import { describe, expect, it } from "vitest";

import { ApiError } from "./errors";
import { getDuplicateField, toUserFacingMessage } from "./messages";

function apiError(status: number, message: string, details?: string): ApiError {
  return new ApiError(status, { status, error: "", message, details });
}

describe("toUserFacingMessage", () => {
  it("traduce mensajes del DTO de registro que el back emite en inglés", () => {
    const error = apiError(400, "Error de validación", "Password must be at least 6 characters");
    expect(toUserFacingMessage(error)).toBe("La contraseña debe tener al menos 6 caracteres");
  });

  it("traduce cada parte de details concatenados con coma", () => {
    const error = apiError(
      400,
      "Error de validación",
      "Username must be between 3 and 50 characters, Email should be valid",
    );
    expect(toUserFacingMessage(error)).toBe(
      "El nombre de usuario debe tener entre 3 y 50 caracteres, Introduce un email válido",
    );
  });

  it("deja pasar mensajes del contrato que ya llegan en español", () => {
    expect(toUserFacingMessage(apiError(400, "Las contraseñas no coinciden"))).toBe("Las contraseñas no coinciden");
    expect(toUserFacingMessage(apiError(400, "El nombre de usuario es obligatorio"))).toBe(
      "El nombre de usuario es obligatorio",
    );
  });

  it("nunca muestra texto crudo desconocido del servidor", () => {
    const error = apiError(400, "Error de validación", "UnexpectedServerLeak xyz");
    expect(toUserFacingMessage(error)).toBe("Los datos no son válidos. Revisa los campos e inténtalo de nuevo.");
    expect(toUserFacingMessage(error)).not.toContain("UnexpectedServerLeak");
  });

  it("responde fallback si no hay texto", () => {
    const error = new ApiError(500, { status: 500, error: "", message: "" });
    expect(toUserFacingMessage(error)).toBe("Los datos no son válidos. Revisa los campos e inténtalo de nuevo.");
  });

  it("traduce los 3 duplicados del módulo chequeos (doc 06)", () => {
    expect(
      toUserFacingMessage(apiError(409, "Checkup with athleteId/year/month/category already exists")),
    ).toBe("Ya existe un chequeo de ese año y mes para esta categoría");
    expect(
      toUserFacingMessage(apiError(409, "CheckupTime with checkupId/style/distance already exists")),
    ).toBe("Ya existe un tiempo registrado para ese estilo y distancia en este chequeo");
    expect(
      toUserFacingMessage(
        apiError(409, "NationalReferenceTime with style/distance/category/position already exists"),
      ),
    ).toBe("Ya existe una referencia para ese estilo, distancia, categoría y posición");
  });
});

describe("getDuplicateField (409 del registro, doc 03 §3)", () => {
  it("distingue username duplicado", () => {
    expect(getDuplicateField(apiError(409, "User with username already exists"))).toBe("username");
  });

  it("distingue email duplicado (no lo atribuye al username)", () => {
    expect(getDuplicateField(apiError(409, "User with email already exists"))).toBe("email");
  });

  it("devuelve null si no es 409 o mensaje irreconocible", () => {
    expect(getDuplicateField(apiError(400, "User with email already exists"))).toBeNull();
    expect(getDuplicateField(apiError(409, "Otro conflicto"))).toBeNull();
  });
});
