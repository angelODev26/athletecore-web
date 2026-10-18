/*
 * Formateo de presentación de fechas y tamaños de archivo (C10 de
 * `integrar-reportes`). Alcance ESTRICTO: timestamps (`Instant` ISO-8601 UTC del
 * servidor) y metadatos de archivos.
 *
 * NO se formatean aquí tiempos de nado: eso es siempre `timeFormatted` del
 * servidor (regla transversal del proyecto).
 *
 * Zona horaria: por defecto se renderiza en la zona del navegador (el usuario ve
 * "su" hora, p. ej. la `nextRunAt` de una programación en su timezone IANA). El
 * segundo parámetro fija la zona de forma explícita y es lo que usan los tests
 * para tener asserts deterministas independientes del entorno.
 */

const LOCALE = "es-ES";

const INVALID_VALUE = "—";

const numberFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function cacheKey(timeZone: string | undefined): string {
  return timeZone ?? "local";
}

function formatterFor(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string | undefined,
  withTime: boolean,
): Intl.DateTimeFormat {
  const key = cacheKey(timeZone);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
    ...(timeZone ? { timeZone } : {}),
  });
  cache.set(key, formatter);
  return formatter;
}

function toDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-09-01T10:00:00Z` → `01/09/2026`. */
export function formatInstantDate(iso: string, timeZone?: string): string {
  const date = toDate(iso);
  return date ? formatterFor(dateFormatters, timeZone, false).format(date) : INVALID_VALUE;
}

/** `2026-09-01T10:00:00Z` → `01/09/2026, 10:00`. */
export function formatInstantDateTime(iso: string, timeZone?: string): string {
  const date = toDate(iso);
  return date ? formatterFor(dateTimeFormatters, timeZone, true).format(date) : INVALID_VALUE;
}

/** `48213` → `47,1 KB`; `1572864` → `1,5 MB` (KB/MB con separador decimal es-ES). */
export function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return INVALID_VALUE;
  }
  const kb = 1024;
  const mb = kb * 1024;
  return bytes >= mb
    ? `${numberFormatter.format(bytes / mb)} MB`
    : `${numberFormatter.format(bytes / kb)} KB`;
}
