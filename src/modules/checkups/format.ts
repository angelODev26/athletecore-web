import type { CheckupCategory, Classification, SwimmingStyle } from "@/lib/api/types";

/*
 * Formatos del módulo chequeos (decisión C2): el front NUNCA formatea un tiempo
 * para mostrarlo — siempre `timeFormatted` (u otros `*Formatted`) del servidor.
 * El único procesamiento local permitido es el parseo del INPUT `mm:ss.fff`
 * a segundos antes de enviar, y usar `timeSeconds` (número) para ordenar.
 */

/**
 * Parser estricto de tiempo de prueba → segundos (C2).
 * - Acepta `m:ss.fff` / `mm:ss.fff` (`01:05.250` → 65.25, `1:05.250` → 65.25)
 * - Acepta horas `h:mm:ss.fff` (`1:02:03.750` → 3723.75)
 * - Exige EXACTAMENTE 3 dígitos de milisegundos: `1:5.25` o `1:05.25` → null
 * - Segundos siempre 00–59; en formato con horas los minutos 00–59 también.
 */
export function parseTimeToSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  // Con horas: h+):(min):(seg).mmm
  const withHours = /^(\d+):([0-5]?\d):([0-5]\d)\.(\d{3})$/.exec(trimmed);
  if (withHours) {
    const hours = Number(withHours[1]);
    const minutes = Number(withHours[2]);
    const seconds = Number(withHours[3]);
    const millis = Number(withHours[4]);
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }

  // Sin horas: min):(seg).mmm — minutos de 1 dígito (`m:ss.fff`) o más.
  const noHours = /^([0-5]?\d|[1-9]\d+):([0-5]\d)\.(\d{3})$/.exec(trimmed);
  if (noHours) {
    const minutes = Number(noHours[1]);
    const seconds = Number(noHours[2]);
    const millis = Number(noHours[3]);
    return minutes * 60 + seconds + millis / 1000;
  }

  return null;
}

/** Etiquetas ES solo en presentación; al back se envía el valor exacto del enum. */
export const SWIMMING_STYLE_LABELS: Record<SwimmingStyle, string> = {
  LIBRE: "Libre",
  ESPALDA: "Espalda",
  BRAZA: "Braza",
  MARIPOSA: "Mariposa",
  COMBINADO: "Combinado",
};

export const CHECKUP_CATEGORY_LABELS: Record<CheckupCategory, string> = {
  INFANTIL: "Infantil",
  JUVENIL: "Juvenil",
  MAYOR: "Mayor",
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  POR_ENCIMA_DEL_PODIO: "Por encima del podio",
  CERCANO_A_MEDALLERIA: "Cercano a medallería",
  FUERA_DE_RANGO: "Fuera de rango",
};

/**
 * Tolerancia a la extensión del catálogo (doc 06 §1): los enums llegan como
 * `string` — desconocido → mostrar el valor crudo en vez de romper.
 */
export function styleLabel(style: string): string {
  return style in SWIMMING_STYLE_LABELS ? SWIMMING_STYLE_LABELS[style as SwimmingStyle] : style;
}

export function categoryLabel(category: string): string {
  return category in CHECKUP_CATEGORY_LABELS
    ? CHECKUP_CATEGORY_LABELS[category as CheckupCategory]
    : category;
}

export function classificationLabel(classification: string): string {
  return classification in CLASSIFICATION_LABELS
    ? CLASSIFICATION_LABELS[classification as Classification]
    : classification;
}

/** Mes 1–12 → nombre ES en nominativo (presentación, sin `Date`). */
export const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function monthNameEs(month: number): string {
  return MONTH_NAMES_ES[month - 1] ?? String(month);
}

/** Posición del podio (1=oro, 2=plata, 3=bronce) — presentación de la matriz nacional. */
export const TIME_POSITION: Record<number, string> = {
  1: "Oro (1º)",
  2: "Plata (2º)",
  3: "Bronce (3º)",
};

export function positionLabel(position: number): string {
  return TIME_POSITION[position] ?? `Posición ${position}`;
}
