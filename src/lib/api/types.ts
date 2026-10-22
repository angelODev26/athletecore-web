/** Catálogo canónico de roles del back (contrato 03 §5), en orden de presentación. */
export const ROLES = ["ADMIN", "COACH", "USER"] as const;
export type Role = (typeof ROLES)[number];

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
  /**
   * Nombres `ROLE_*` ordenados por el back (contrato 03 §5). El back actual
   * (login, listado y alta) siempre lo envía; se mantiene opcional para que el
   * render siga siendo tolerante ante respuestas de versiones previas a P2.
   */
  roles?: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  /** El back ya lo emite; el front todavía no lo persiste (decisión D1). */
  refreshToken?: string;
  type: "Bearer";
  /** Duración en milisegundos (no es timestamp). */
  expiresIn: number;
  user: UserResponse;
}

/**
 * Alta de usuario por un ADMIN (`POST /users`, contrato 03 §3). `roles` es
 * opcional: ausente/vacío el back aplica `ROLE_USER`; la UI siempre envía uno.
 */
export interface CreateUserRequest {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  roles?: string[];
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

/*
 * Reportes (contrato docs/backend-contract/07). DTOs exactos del design.md de
 * `integrar-reportes`, verificados contra `report/dto/*.java`; si el back difiere,
 * gana el código del back. Reutilizan `MedalProjectionResponse` y `Classification`
 * de chequeos. Regla transversal: el front nunca formatea tiempos ni calcula
 * clasificaciones/rachas — todo valor visible es un `*Formatted` del servidor.
 */

export type ReportType = "INDIVIDUAL" | "GENERAL";
export type ReportStatus = "PENDING" | "GENERATED" | "FAILED";

export interface TimeEvolutionEntry {
  year: number;
  month: number;
  style: string; // valores de SwimmingStyle; string para tolerar extensión (doc 06 §1)
  distance: number;
  timeSeconds: number; // BigDecimal → JSON number (doc 08 §4)
  timeFormatted: string; // SIEMPRE del servidor
}

export interface AttendanceSummary {
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  justifiedCount: number;
  currentAbsenceStreak: number; // racha calculada por el servidor — nunca local
}

export interface IndividualReportResponse {
  athleteId: number;
  athleteFullName: string;
  timeEvolution: TimeEvolutionEntry[];
  attendance: AttendanceSummary;
  projections: MedalProjectionResponse[]; // reusa el type de chequeos
}

export interface TeamAthleteEntry {
  athleteId: number;
  athleteFullName: string;
  bestTimeSeconds: number;
  bestTimeFormatted: string;
  classification: Classification;
  diffVsBronzeSeconds: number;
  diffVsBronzeFormatted: string;
}

export interface TeamReportEntry {
  style: string;
  distance: number;
  category: string;
  athleteCount: number;
  athletes: TeamAthleteEntry[];
}

export interface TeamReportResponse {
  category: string | null; // null = sin filtro (todas)
  entries: TeamReportEntry[];
}

export interface GenerateReportRequest {
  reportType: ReportType; // @NotNull
  athleteId?: number | null; // requerido si INDIVIDUAL (regla de servicio, 400)
  category?: string | null;
  year?: number | null;
  month?: number | null;
  title: string; // @NotBlank, @Size(max = 200)
}

export interface ReportResponse {
  id: number;
  reportType: ReportType;
  athleteId: number | null;
  category: string | null;
  year: number | null;
  month: number | null;
  title: string;
  status: ReportStatus;
  errorMessage: string | null; // visible cuando status === "FAILED"
  createdAt: string; // Instant ISO-8601 UTC
  updatedAt: string;
  // No nullable: `ReportResponse.java` lo declara `boolean` primitivo (asimétrico con el DTO de schedules).
  active: boolean;
}

export interface ReportExportResponse {
  id: number;
  reportId: number;
  format: string; // "PDF"
  fileName: string;
  fileSizeBytes: number;
  contentType: string; // "application/pdf"
  createdAt: string;
}

/*
 * El detalle NO expone `active`: `ReportDetailResponse.java` del back omite el campo
 * (un reporte borrado responde 404, así que `active` no tiene uso en el detalle).
 * Regla del proyecto: si el doc y el código difieren, gana el código.
 */
export interface ReportDetailResponse extends Omit<ReportResponse, "active"> {
  exports: ReportExportResponse[];
}

export interface CreateReportScheduleRequest {
  reportType: ReportType; // @NotNull
  athleteId?: number | null;
  category?: string | null;
  cronExpression: string; // @NotBlank @Size(100) — Spring 6 campos, construido por presets
  timezone?: string | null; // @Size(63), nombre IANA
  active?: boolean | null;
}

// El update EXIGE todos los campos (PUT completo); misma forma que create.
export type UpdateReportScheduleRequest = CreateReportScheduleRequest;

export interface ReportScheduleResponse {
  id: number;
  reportType: ReportType;
  athleteId: number | null;
  category: string | null;
  cronExpression: string;
  timezone: string | null;
  /*
   * Nullable en el wire: `ReportScheduleResponse.java` lo declara `Boolean` (no primitivo).
   * La entidad usa `Boolean.TRUE` por defecto y el scheduler solo ejecuta las filas con
   * `active = TRUE` (`ReportScheduleRepository.findDueActiveSchedules`), así que un `null`
   * nunca significa activa: la UI trata `active !== true` como no activa.
   */
  active: boolean | null;
  lastRunAt: string | null; // precalculados por el servidor — solo mostrar
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
