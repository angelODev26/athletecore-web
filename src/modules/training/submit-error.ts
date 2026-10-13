import { isApiError, toUserFacingMessage } from "@/lib/api";

/*
 * T9: mensajes de error seguros para formularios del módulo. Nunca texto crudo del
 * back. Los 400 de validación llegan con `details` SIN nombres de campo (doc 08 §1),
 * así que el mapeo "campo a campo" real lo hace la validación local de cada
 * formulario (mismas reglas que el contrato); el 400 que se cuela se muestra como
 * mensaje global seguro bajo el formulario.
 */
export function toSubmitErrorMessage(error: unknown, fallback = "No se pudo completar la operación. Inténtalo de nuevo."): string {
  if (isApiError(error)) {
    return toUserFacingMessage(error);
  }
  return fallback;
}
