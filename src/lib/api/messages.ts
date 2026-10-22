import type { ApiError } from "./errors";
import { PASSWORD_MIN_BACKEND_MESSAGE, PASSWORD_MIN_MESSAGE } from "./password-policy";

/*
 * Mapeo de mensajes del backend (contrato docs 02/03/08) a texto de usuario.
 * El DTO de alta de usuario (`POST /users`, solo ADMIN) valida en INGLÉS (doc 03
 * §3) y `details` concatena mensajes sin nombres de campo (doc 08 §1) — nunca
 * mostrar esos textos crudos.
 */
const KNOWN_BACKEND_MESSAGES: Record<string, string> = {
  // DTO de alta de usuario (el back los emite en inglés)
  "Username must be between 3 and 50 characters":
    "El nombre de usuario debe tener entre 3 y 50 caracteres",
  "Email should be valid": "Introduce un email válido",
  [PASSWORD_MIN_BACKEND_MESSAGE]: PASSWORD_MIN_MESSAGE,
  // Duplicados del módulo chequeos (contrato doc 06, emitidos por
  // `DuplicateResourceException(String, String)` en inglés)
  "Checkup with athleteId/year/month/category already exists":
    "Ya existe un chequeo de ese año y mes para esta categoría",
  "CheckupTime with checkupId/style/distance already exists":
    "Ya existe un tiempo registrado para ese estilo y distancia en este chequeo",
  "NationalReferenceTime with style/distance/category/position already exists":
    "Ya existe una referencia para ese estilo, distancia, categoría y posición",
};

// Mensajes del contrato que ya llegan en español del back y son seguros de
// mostrar tal cual (validación de login, reglas de negocio del alta).
const SPANISH_CONTRACT_MESSAGES = new Set([
  "El nombre de usuario es obligatorio",
  "La contraseña es obligatoria",
  "Las contraseñas no coinciden",
  "Error de validación",
  // Regla de servicio del back en reportes (doc 07 §3): la pre-validación local la
  // evita, pero llega en español y es segura de mostrar tal cual.
  "El reporte individual requiere un athleteId",
]);

const SAFE_FALLBACK_VALIDATION = "Los datos no son válidos. Revisa los campos e inténtalo de nuevo.";

/** Traduce `details`/`message` de un ErrorResponse a texto seguro de mostrar (español). */
export function toUserFacingMessage(error: ApiError): string {
  const raw = (error.payload.details ?? "").trim() || (error.payload.message ?? "").trim();
  if (!raw) {
    return SAFE_FALLBACK_VALIDATION;
  }

  // `details` concatena varios mensajes con ", " (doc 08 §1).
  const parts = raw.split(", ").map((part) => part.trim());
  const allKnown = parts.every((part) => part in KNOWN_BACKEND_MESSAGES || SPANISH_CONTRACT_MESSAGES.has(part));
  if (!allKnown) {
    return SAFE_FALLBACK_VALIDATION;
  }
  return parts.map((part) => KNOWN_BACKEND_MESSAGES[part] ?? part).join(", ");
}

/**
 * Para el 409 de alta de usuario devuelve el campo en conflicto según el contrato
 * (doc 03 §3: "User with username already exists" / "User with email already exists").
 * El 409 genérico de integridad (soft delete/carrera) devuelve `null`: se muestra
 * como conflicto global seguro.
 */
export function getDuplicateField(error: ApiError): "username" | "email" | null {
  if (error.status !== 409) {
    return null;
  }
  const message = error.payload.message.toLowerCase();
  if (message.includes("email")) {
    return "email";
  }
  if (message.includes("username")) {
    return "username";
  }
  return null;
}
