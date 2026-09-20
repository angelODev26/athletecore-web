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
