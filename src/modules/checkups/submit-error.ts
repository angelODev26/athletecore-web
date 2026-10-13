import { isApiError, toUserFacingMessage } from "@/lib/api";

/*
 * C5: mensajes de error seguros para formularios del módulo chequeos. Nunca texto
 * crudo del back. Los 400 de validación llegan con `details` SIN nombres de campo
 * (doc 08 §1): el mapeo campo a campo real lo hace la validación local de cada
 * formulario (reglas EXACTAS del contrato) y el 400 que se cuela se muestra como
 * mensaje global seguro bajo el formulario. El 409 de duplicado se traduce vía
 * KNOWN_BACKEND_MESSAGES.
 */
export function toCheckupsSubmitErrorMessage(
  error: unknown,
  fallback = "No se pudo completar la operación. Inténtalo de nuevo.",
): string {
  if (isApiError(error)) {
    return toUserFacingMessage(error);
  }
  return fallback;
}
