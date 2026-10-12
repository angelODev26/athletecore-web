export type Role = "USER" | "ADMIN" | "COACH";

export interface JwtClaims {
  sub?: string;
  userId?: string;
  roles?: string[];
  exp?: number;
}

export interface TimeFormattedValue {
  timeFormatted: string;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  active: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  type: "Bearer";
  /** Duración en milisegundos (no es timestamp). */
  expiresIn: number;
  user: UserResponse;
}

export interface RegisterRequest {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
}
