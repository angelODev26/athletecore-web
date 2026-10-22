/*
 * Política única de password del alta de usuarios (contrato 03 §3). El DTO del
 * back valida en inglés y el formulario replica la regla en español: ambos
 * mensajes se derivan de una sola constante para que no vuelvan a divergir
 * (ya pasó con el salto 6 → 8 al activar P2).
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_MIN_BACKEND_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;

export const PASSWORD_MIN_MESSAGE = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
