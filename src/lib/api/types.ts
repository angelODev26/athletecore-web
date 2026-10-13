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

/*
 * Chequeos (contrato docs/backend-contract/06). DTOs exactos del design.md de
 * `integrar-checkups`; si el back difiere, gana el código del back.
 * Regla transversal: el front nunca formatea tiempos (usa `*Formatted` tal cual)
 * ni calcula clasificaciones.
 */

export type SwimmingStyle = "LIBRE" | "ESPALDA" | "BRAZA" | "MARIPOSA" | "COMBINADO";
export type CheckupCategory = "INFANTIL" | "JUVENIL" | "MAYOR";
export type Classification =
  | "POR_ENCIMA_DEL_PODIO"
  | "CERCANO_A_MEDALLERIA"
  | "FUERA_DE_RANGO";

export interface CheckupResponse {
  id: number;
  athleteId: number;
  year: number;
  month: number;
  category: string; // valores del enum; string para tolerar extensión sin migración (doc 06 §1)
  notes: string | null;
  createdAt: string; // Instant ISO-8601 UTC ("2026-03-05T10:15:00Z")
  updatedAt: string;
  active: boolean;
}

export interface CheckupTimeResponse {
  id: number;
  checkupId: number;
  style: string;
  distance: number;
  timeSeconds: number; // BigDecimal llega como JSON number (doc 08 §4)
  timeFormatted: string; // "mm:ss.fff" o "hh:mm:ss.fff" — usar tal cual
}

export interface CheckupDetailResponse extends CheckupResponse {
  times: CheckupTimeResponse[];
}

export interface CreateCheckupRequest {
  athleteId: number;
  year: number; // 1900–2100
  month: number; // 1–12
  category: CheckupCategory;
  notes?: string;
}

export interface AddCheckupTimeRequest {
  style: SwimmingStyle;
  distance: number; // entero >= 1
  timeSeconds: number; // > 0
}

export interface PositionComparison {
  position: number; // 1=oro, 2=plata, 3=bronce
  referenceTimeSeconds: number;
  referenceTimeFormatted: string;
  absoluteDiffSeconds: number; // negativo = prueba más rápida
  absoluteDiffFormatted: string; // con signo explícito ("+00:05.250")
  relativeDiffPercent: number;
}

export interface TimeComparisonResponse {
  style: string;
  distance: number;
  category: string;
  trialTimeSeconds: number;
  trialTimeFormatted: string;
  positions: PositionComparison[];
}

export interface MedalProjectionResponse {
  style: string;
  distance: number;
  category: string;
  classification: Classification;
  timeSeconds: number;
  timeFormatted: string;
  diffVsBronzeSeconds: number; // negativo = mejor que el bronce
  diffVsBronzeFormatted: string;
}

export interface NationalReferenceTimeListItemResponse {
  id: number;
  style: string;
  distance: number;
  category: string;
  position: number; // 1..3
  timeSeconds: number;
  timeFormatted: string;
}

export interface NationalReferenceTimeRequest {
  style: SwimmingStyle;
  distance: number; // entero >= 1
  category: CheckupCategory;
  position: number; // 1–3
  timeSeconds: number; // > 0
}
