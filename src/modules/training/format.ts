import type { AttendanceStatus, CycleType, SessionStatus } from "@/lib/api/types";

/*
 * Formatos de presentación del módulo (decisión T10): SIN cálculos ni `Date`.
 * `new Date("2026-01-06")` desfasa un día en zonas horarias negativas — prohibido.
 */

/** `YYYY-MM-DD` → `DD/MM/YYYY` por manipulación de string. */
export function formatDateEs(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${day}/${month}/${year}`;
}

/** `HH:mm:ss` → `HH:mm` (string slice). */
export function formatTimeHm(time: string | null): string | null {
  if (!time) {
    return null;
  }
  return time.slice(0, 5);
}

/** Rango compacto `DD/MM/YYYY – DD/MM/YYYY` a partir de dos ISO dates. */
export function formatDateRangeEs(startDate: string, endDate: string): string {
  return `${formatDateEs(startDate)} – ${formatDateEs(endDate)}`;
}

/** Etiquetas ES solo en presentación; los valores enviados al back son los exactos. */
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  PROGRAMADA: "Programada",
  EJECUTADA: "Ejecutada",
  CANCELADA: "Cancelada",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENTE: "Presente",
  AUSENTE: "Ausente",
  JUSTIFICADO: "Justificado",
};

export const CYCLE_TYPE_LABELS: Record<CycleType, string> = {
  MESOCICLO: "Mesociclo",
  MICROCICLO: "Microciclo",
};
