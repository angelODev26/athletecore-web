import type { ReportScheduleResponse, ReportType } from "@/lib/api/types";
import { categoryLabel, monthNameEs } from "@/modules/checkups/format";

/*
 * Formatos y etiquetas de presentación del módulo reportes.
 *
 * Aquí viven las etiquetas que comparten la biblioteca, el formulario de generación y el
 * detalle: el TIPO de reporte (`INDIVIDUAL`/`GENERAL`) y la composición de texto del
 * OBJETIVO y del PERÍODO de un reporte. Nada de esto se calcula en el servidor como
 * string, pero tampoco es una regla de negocio: solo presentación (C5/C10).
 *
 * Los helpers aceptan la forma MÍNIMA que necesitan (no `ReportResponse` completo) para
 * poder usarse tanto con el listado (`ReportResponse`) como con el detalle
 * (`ReportDetailResponse`, que no expone `active`).
 *
 * NOTA: este archivo es también el hogar de los presets→cron de C7
 * (`buildCronFromPreset`, `parseCronToPreset`, `cronToHumanText`, Fase 6), añadidos
 * AMPLIANDO este archivo en vez de reescribirlo, para no perder estas etiquetas.
 */

/** Etiquetas ES de presentación; al back se envía el valor exacto del enum. */
export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  INDIVIDUAL: "Individual",
  GENERAL: "General",
};

/**
 * Tolerancia a la extensión del enum (doc 06 §1): un valor desconocido se muestra crudo
 * en vez de romper la vista.
 */
export function reportTypeLabel(reportType: string): string {
  return reportType in REPORT_TYPE_LABELS
    ? REPORT_TYPE_LABELS[reportType as ReportType]
    : reportType;
}

/** Forma mínima para resolver el objetivo de un reporte (listado o detalle). */
export interface ReportTargetSource {
  reportType: string;
  athleteId: number | null;
  category: string | null;
}

/**
 * Objetivo legible de un reporte:
 * - Individual → nombre del deportista si se conoce (`athleteNames`), si no `Atleta #id`
 *   (precedente D4: `ReportResponse` solo trae `athleteId`).
 * - General → categoría con `categoryLabel`, o "todas las categorías" si no filtra.
 */
export function reportTargetLabel(
  report: ReportTargetSource,
  athleteNames?: ReadonlyMap<number, string>,
): string {
  if (report.reportType === "INDIVIDUAL") {
    if (report.athleteId === null) {
      return "Reporte individual";
    }
    return athleteNames?.get(report.athleteId) ?? `Atleta #${report.athleteId}`;
  }
  return report.category
    ? `General · ${categoryLabel(report.category)}`
    : "General · todas las categorías";
}

/** Forma mínima para resolver el período de un reporte. */
export interface ReportPeriodSource {
  year: number | null;
  month: number | null;
}

/**
 * Período del reporte (`year`/`month` son opcionales en el contrato): `null` cuando no
 * trae ninguno de los dos — la biblioteca omite la columna entera en ese caso.
 */
export function reportPeriodLabel(report: ReportPeriodSource): string | null {
  const { year, month } = report;
  if (year === null && month === null) {
    return null;
  }
  if (year !== null && month !== null) {
    return `${monthNameEs(month)} ${year}`;
  }
  return year !== null ? String(year) : monthNameEs(month as number);
}

/* ──────────────────────── Estado de una programación (C7) ────────────────────────
 *
 * `active` NO es un `boolean` primitivo en el wire: `ReportScheduleResponse.java:19` declara
 * `Boolean active` y la entidad usa `Boolean.TRUE` por defecto, así que el DTO puede llegar
 * con `null`. El scheduler del back solo ejecuta las filas con `active = TRUE`
 * (`ReportScheduleRepository.findDueActiveSchedules`), de modo que `active !== true` NUNCA
 * debe presentarse como activa: un `null` es "no se va a ejecutar", jamás una promesa de
 * ejecución. Este predicado escribe esa intención (y la deja tipada) en vez de depender de
 * la truthiness implícita.
 */

/** `true` SOLO cuando el servidor manda `active === true` (el `null` del DTO no es activa). */
export function isScheduleActive(schedule: Pick<ReportScheduleResponse, "active">): boolean {
  return schedule.active === true;
}

/* ───────────────────────── C7: presets → cron de 6 campos ─────────────────────────
 *
 * El usuario de la UI JAMÁS escribe cron: elige un preset (frecuencia + hora) y esta
 * capa lo traduce a la expresión que entiende el back. La forma es la de Spring
 * (`org.springframework.scheduling.support.CronExpression`), que son SEIS campos y NO
 * cinco como el cron de Unix:
 *
 *   segundo  minuto  hora  día-del-mes  mes  día-de-la-semana
 *      0       M      H        *         *         *          ← diario   `0 M H * * *`
 *      0       M      H        *         *        DOW         ← semanal  `0 M H * * DOW`
 *      0       M      H       DOM        *         *          ← mensual  `0 M H DOM * *`
 *
 * Solo se generan esos tres patrones (verificado contra
 * `ReportScheduleService.validateCron`, que valida con `CronExpression.parse` y responde
 * 400 "Expresión cron inválida: …" si no encaja). `parseCronToPreset` es la vuelta atrás:
 * EXACTAMENTE esos tres patrones (segundo 0, hora 0–23, minuto 0–59, MON..SUN, día del
 * mes 1–28). Un cron que no encaje —porque el back lo acepta pero la UI no puede
 * representarlo (p. ej. `0 0 6 31 * *`, `0 0 6 * 1 MON`, `0 0/5 * * * *`, 5 campos)—
 * devuelve `null` y la UI cae a modo "personalizado" (ver `schedule-form.tsx`).
 */

/** Frecuencias del preset (C7): el usuario elige una de estas, nunca un cron. */
export const SCHEDULE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export const SCHEDULE_FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  DAILY: "Diario",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
};

/** Días del cron Spring en el orden del registro cristiano (el back acepta MON..SUN). */
export const SCHEDULE_WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type ScheduleWeekday = (typeof SCHEDULE_WEEKDAYS)[number];

export const SCHEDULE_WEEKDAY_LABELS: Record<ScheduleWeekday, string> = {
  MON: "Lunes",
  TUE: "Martes",
  WED: "Miércoles",
  THU: "Jueves",
  FRI: "Viernes",
  SAT: "Sábado",
  SUN: "Domingo",
};

/** Día del mes del preset mensual: 1–28 (así "el día 28" existe en febrero). */
export const SCHEDULE_MONTH_DAY_MIN = 1;
export const SCHEDULE_MONTH_DAY_MAX = 28;

export interface SchedulePresetTime {
  /** 0–23. */
  hour: number;
  /** 0–59 (la UI ofrece pasos de 5). */
  minute: number;
}

/**
 * Preset explícito por frecuencia: el día de la semana (semanal) y el día del mes
 * (mensual) son obligatorios en su variante, y no existen en las otras — así
 * `buildCronFromPreset` no puede recibir combinaciones imposibles.
 */
export type SchedulePreset =
  | (SchedulePresetTime & { frequency: "DAILY" })
  | (SchedulePresetTime & { frequency: "WEEKLY"; weekday: ScheduleWeekday })
  | (SchedulePresetTime & { frequency: "MONTHLY"; dayOfMonth: number });

/** `0 M H * * *` / `0 M H * * DOW` / `0 M H DOM * *` (6 campos Spring). */
export function buildCronFromPreset(preset: SchedulePreset): string {
  const { minute, hour } = preset;
  switch (preset.frequency) {
    case "DAILY":
      return `0 ${minute} ${hour} * * *`;
    case "WEEKLY":
      return `0 ${minute} ${hour} * * ${preset.weekday}`;
    case "MONTHLY":
      return `0 ${minute} ${hour} ${preset.dayOfMonth} * *`;
  }
}

const CRON_FIELD_COUNT = 6;

/** Spring exige el segundo: los presets siempre disparan en el segundo 0. */
const CRON_SECOND = "0";

/** Todos los campos del preset son comodines salvo el que fija la frecuencia. */
const CRON_ANY = "*";

function splitCronFields(cron: string): string[] | null {
  const fields = cron.trim().split(/\s+/);
  return fields.length === CRON_FIELD_COUNT ? fields : null;
}

function parseBoundedInt(raw: string, min: number, max: number): number | null {
  if (!/^\d{1,2}$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

function toWeekday(raw: string): ScheduleWeekday | null {
  const upper = raw.toUpperCase();
  return SCHEDULE_WEEKDAYS.find((weekday) => weekday === upper) ?? null;
}

/**
 * Vuelta atrás de `buildCronFromPreset`: `null` si el cron no es EXACTAMENTE uno de los
 * tres patrones del preset (el consumidor decide qué hacer; aquí nunca se inventa).
 */
export function parseCronToPreset(cron: string): SchedulePreset | null {
  const fields = splitCronFields(cron);
  if (!fields) {
    return null;
  }

  const [second, minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (second !== CRON_SECOND || month !== CRON_ANY) {
    return null;
  }

  const parsedMinute = parseBoundedInt(minute, 0, 59);
  const parsedHour = parseBoundedInt(hour, 0, 23);
  if (parsedMinute === null || parsedHour === null) {
    return null;
  }

  const time: SchedulePresetTime = { hour: parsedHour, minute: parsedMinute };

  if (dayOfMonth === CRON_ANY) {
    if (dayOfWeek === CRON_ANY) {
      return { frequency: "DAILY", ...time };
    }
    const weekday = toWeekday(dayOfWeek);
    return weekday ? { frequency: "WEEKLY", weekday, ...time } : null;
  }

  const parsedDay = parseBoundedInt(dayOfMonth, SCHEDULE_MONTH_DAY_MIN, SCHEDULE_MONTH_DAY_MAX);
  if (parsedDay === null || dayOfWeek !== CRON_ANY) {
    return null;
  }
  return { frequency: "MONTHLY", dayOfMonth: parsedDay, ...time };
}

function clockText({ hour, minute }: SchedulePresetTime): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Frecuencia legible de un cron (columna de la tabla y confirmación del form). Parseo
 * ESTRICTO de los tres presets; cualquier otro cron se muestra CRUDO (nunca se describe
 * una recurrencia que la UI no puede garantizar).
 */
export function cronToHumanText(cron: string): string {
  const preset = parseCronToPreset(cron);
  if (!preset) {
    return cron;
  }

  const time = clockText(preset);
  switch (preset.frequency) {
    case "DAILY":
      return `Diario a las ${time}`;
    case "WEEKLY":
      return `Cada ${SCHEDULE_WEEKDAY_LABELS[preset.weekday].toLowerCase()} a las ${time}`;
    case "MONTHLY":
      return `Mensual el día ${preset.dayOfMonth} a las ${time}`;
  }
}
