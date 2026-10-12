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

export interface AthleteResponse {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate: string | null;
  photoUrl: string | null;
  active: boolean;
}

export interface AthleteCreateRequest {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
}

export interface AthleteUpdateRequest {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  photoUrl?: string;
}

export interface AthleteProfileResponse {
  id: number;
  weightKgs: number;
  heightCm: number;
  armSpanCm: number | null;
  /** Calculado por el servidor; nunca en el front (doc 09 §3.7). */
  bmi: number | null;
  /** Literal en español del servidor ("Bajo peso" | "Normal" | …); mostrar tal cual. */
  bmiCategory: string | null;
  notes: string | null;
  isComplete: boolean;
}

export interface AthleteProfileUpsertRequest {
  weightKgs: number;
  heightCm: number;
  armSpanCm?: number;
  notes?: string;
}

export interface SportResponse {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  disciplineIds: number[];
}

export interface AssignSportsRequest {
  sportIds: number[];
}
