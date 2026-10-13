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

/*
 * Entrenamientos (contrato docs/backend-contract/05). DTOs exactos del design.md
 * de `integrar-training`; si el back difiere, gana el código del back.
 */

export type CycleType = "MESOCICLO" | "MICROCICLO";
export type SessionStatus = "PROGRAMADA" | "EJECUTADA" | "CANCELADA";
export type AttendanceStatus = "PRESENTE" | "AUSENTE" | "JUSTIFICADO";

export interface TrainingPlanResponse {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  description: string | null;
  active: boolean;
}

export interface CreateTrainingPlanRequest {
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
}

/** Nodo del árbol que monta el back (ya ordenado por `orderIndex`, luego fecha). */
export interface TrainingCycleNode {
  id: number;
  type: CycleType;
  name: string;
  startDate: string;
  endDate: string;
  orderIndex: number;
  parentCycleId: number | null;
  children: TrainingCycleNode[];
}

export interface TrainingPlanDetailResponse extends TrainingPlanResponse {
  cycles: TrainingCycleNode[];
}

export interface CreateCycleRequest {
  type: CycleType;
  name: string;
  startDate: string;
  endDate: string;
  orderIndex: number;
  parentCycleId?: number;
}

export interface SessionResponse {
  id: number;
  cycleId: number | null;
  disciplineId: number | null;
  sessionDate: string;
  startTime: string | null;
  status: SessionStatus;
  volume: number | null;
  intensity: number | null;
  distance: number | null;
  observations: string | null;
  active: boolean;
}

export interface CreateSessionRequest {
  cycleId?: number;
  disciplineId?: number;
  sessionDate: string;
  startTime?: string;
  status?: SessionStatus;
  volume?: number;
  intensity?: number;
  distance?: number;
  observations?: string;
}

export type UpdateSessionRequest = Partial<CreateSessionRequest>;

export interface AttendanceRecord {
  id: number;
  sessionId: number;
  sessionDate: string;
  athleteId: number;
  athleteFullName: string;
  status: AttendanceStatus;
}

export interface SessionDetailResponse extends SessionResponse {
  attendance: AttendanceRecord[];
}

export interface RegisterAttendanceRequest {
  athleteId: number;
  status: AttendanceStatus;
}

export interface AttendanceAlertResponse {
  athleteId: number;
  athleteFullName: string;
  consecutiveAbsenceCount: number;
  lastAbsenceDate: string;
}
