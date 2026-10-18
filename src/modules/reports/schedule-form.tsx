import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { isApiError, toUserFacingMessage } from "@/lib/api";
import type {
  CreateReportScheduleRequest,
  ReportScheduleResponse,
  ReportType,
  UpdateReportScheduleRequest,
} from "@/lib/api/types";
import { CHECKUP_CATEGORY_LABELS } from "@/modules/checkups/format";
import {
  buildCronFromPreset,
  cronToHumanText,
  isScheduleActive,
  parseCronToPreset,
  REPORT_TYPE_LABELS,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_FREQUENCY_LABELS,
  SCHEDULE_MONTH_DAY_MAX,
  SCHEDULE_MONTH_DAY_MIN,
  SCHEDULE_WEEKDAYS,
  SCHEDULE_WEEKDAY_LABELS,
} from "@/modules/reports/format";
import type { SchedulePreset } from "@/modules/reports/format";
import {
  isInvalidCronError,
  useCreateReportSchedule,
  useUpdateReportSchedule,
} from "@/modules/reports/reports-api";
import { allAthletesKey, fetchAllAthletes } from "@/modules/training/training-api";
import { formatInstantDateTime } from "@/shared/format/dates";

/*
 * C7: formulario de programaciones (dialog, solo ADMIN). El usuario JAMÁS escribe cron:
 * elige un preset (frecuencia + hora/minuto + día) y esta capa construye la expresión
 * Spring de 6 campos con `buildCronFromPreset`. La expresión generada se muestra
 * READ-ONLY (transparencia, no editable).
 *
 * Estado del formulario con `useState` en vez de react-hook-form: aquí no hay texto
 * libre que validar (todo son selects + un switch) y las únicas reglas locales son
 * "elige frecuencia", "elige tipo" e "INDIVIDUAL exige deportista" — una función pura
 * (`validateScheduleLocally`) es más clara que un esquema zod y se testea aparte.
 *
 * Estrategia de EDICIÓN cuando el cron no encaja en ningún preset: modo "personalizado".
 * La fila puede traer un cron que el back acepta pero los presets no representan
 * (p. ej. `0 0 6 * 1 MON`). En ese caso el form se pre-carga con TODO lo demás
 * (tipo/objetivo/zona/estado), muestra el cron de la fila y bloquea el guardado hasta
 * que el usuario elija una frecuencia, que reemplaza la expresión. Así nunca se envía un
 * PUT con un cron que la UI no puede volver a mostrar, ni se pierde el resto de la fila.
 *
 * Tras guardar: la respuesta (POST 201 / PUT 200) ya trae el `nextRunAt` recalculado por
 * el servidor → se muestra como confirmación antes de volver a la tabla.
 */

/** Minuto del preset: select en pasos de 5 (0–55). */
export const SCHEDULE_MINUTE_STEP = 5;

const MINUTE_OPTIONS: readonly number[] = Array.from(
  { length: 60 / SCHEDULE_MINUTE_STEP },
  (_, index) => index * SCHEDULE_MINUTE_STEP,
);

const HOUR_OPTIONS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);

const MONTH_DAY_OPTIONS: readonly number[] = Array.from(
  { length: SCHEDULE_MONTH_DAY_MAX - SCHEDULE_MONTH_DAY_MIN + 1 },
  (_, index) => SCHEDULE_MONTH_DAY_MIN + index,
);

/**
 * Lista corta de zonas IANA (C7): se guarda con la programación, así que se ofrece un
 * conjunto acotado y no un campo libre (el back todavía NO la usa para calcular la
 * recurrencia: `computeNextRun` parte de `clock.getZone()` — ver D6).
 */
export const SCHEDULE_TIMEZONES = [
  "America/Bogota",
  "America/Mexico_City",
  "America/Santiago",
  "Europe/Madrid",
  "UTC",
] as const;

export const DEFAULT_SCHEDULE_TIMEZONE = "America/Bogota";

/*
 * M3: `timezone` es OPCIONAL en el contrato (`timezone?: string | null`), así que el
 * select ofrece «Sin zona horaria» para representar el `null` del wire. Radix no admite
 * `SelectItem` con value vacío, así que el null viaja por el form con este centinela
 * (no es una zona IANA) y `buildScheduleRequest` lo traduce de vuelta a `null`.
 */
export const NO_SCHEDULE_TIMEZONE = "NONE";

/** Etiqueta neutra de la ausencia de zona (D6: no promete comportamiento del servidor). */
export const NO_SCHEDULE_TIMEZONE_LABEL = "Sin zona horaria";

/** 400 de cron del back traducido a mensaje seguro (nunca el texto crudo, C7). */
export const SCHEDULE_INVALID_CRON_MESSAGE =
  "La programación no es válida; revisa la frecuencia y la hora";

export const SCHEDULE_SAVE_FALLBACK_ERROR =
  "No se pudieron guardar los cambios. Inténtalo de nuevo.";

const CATEGORY_VALUES = ["INFANTIL", "JUVENIL", "MAYOR"] as const;

/** Valor del select de frecuencia en modo personalizado: "" = sin preset elegido. */
export const NO_SCHEDULE_FREQUENCY = "";

export interface ScheduleFormValues {
  /** `ScheduleFrequency` o `""` (cron de la fila que no encaja en ningún preset). */
  frequency: string;
  weekday: string;
  dayOfMonth: string;
  hour: string;
  minute: string;
  /** Zona IANA de la lista corta o `NO_SCHEDULE_TIMEZONE` (= `null` en el envío). */
  timezone: string;
  /** `""` = sin elegir (el envío se bloquea). */
  reportType: string;
  athleteId: string;
  category: string;
  active: boolean;
}

export interface ScheduleFormErrors {
  frequency?: string;
  reportType?: string;
  athleteId?: string;
}

function defaultScheduleFormValues(): ScheduleFormValues {
  return {
    frequency: "DAILY",
    weekday: "MON",
    dayOfMonth: String(SCHEDULE_MONTH_DAY_MIN),
    hour: "6",
    minute: "0",
    timezone: DEFAULT_SCHEDULE_TIMEZONE,
    reportType: "",
    athleteId: "",
    category: "",
    active: true,
  };
}

/**
 * Estado inicial del form: valores por defecto al crear y la fila COMPLETA al editar
 * (incluida la zona horaria y el `active` actuales, que el PUT completo reenvía). Una
 * fila con `timezone: null` se pre-carga como «Sin zona horaria»: el default
 * `America/Bogota` NO la sustituye, el PUT reenvía exactamente lo persistido.
 * `customCron` no nulo indica que el cron de la fila no es un preset.
 */
export function initialScheduleFormValues(schedule: ReportScheduleResponse | null): {
  values: ScheduleFormValues;
  customCron: string | null;
} {
  if (!schedule) {
    return { values: defaultScheduleFormValues(), customCron: null };
  }

  const shared: ScheduleFormValues = {
    ...defaultScheduleFormValues(),
    timezone: schedule.timezone ?? NO_SCHEDULE_TIMEZONE,
    reportType: schedule.reportType,
    athleteId: schedule.athleteId === null ? "" : String(schedule.athleteId),
    category: schedule.category ?? "",
    // `active` nullable en el wire: el switch solo se enciende con `active === true`.
    active: isScheduleActive(schedule),
  };

  const preset = parseCronToPreset(schedule.cronExpression);
  if (!preset) {
    return { values: { ...shared, frequency: NO_SCHEDULE_FREQUENCY }, customCron: schedule.cronExpression };
  }

  return {
    values: {
      ...shared,
      frequency: preset.frequency,
      hour: String(preset.hour),
      minute: String(preset.minute),
      ...(preset.frequency === "WEEKLY" ? { weekday: preset.weekday } : {}),
      ...(preset.frequency === "MONTHLY" ? { dayOfMonth: String(preset.dayOfMonth) } : {}),
    },
    customCron: null,
  };
}

/** Preset elegido en el form; `null` si no hay frecuencia (modo personalizado). */
export function presetFromValues(values: ScheduleFormValues): SchedulePreset | null {
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  switch (values.frequency) {
    case "DAILY":
      return { frequency: "DAILY", hour, minute };
    case "WEEKLY": {
      const weekday = SCHEDULE_WEEKDAYS.find((candidate) => candidate === values.weekday);
      return weekday ? { frequency: "WEEKLY", hour, minute, weekday } : null;
    }
    case "MONTHLY": {
      const dayOfMonth = Number(values.dayOfMonth);
      return Number.isInteger(dayOfMonth) ? { frequency: "MONTHLY", hour, minute, dayOfMonth } : null;
    }
    default:
      return null;
  }
}

/** Cron de 6 campos del preset elegido; `null` mientras no haya frecuencia. */
export function buildCronFromValues(values: ScheduleFormValues): string | null {
  const preset = presetFromValues(values);
  return preset ? buildCronFromPreset(preset) : null;
}

/**
 * Reglas locales del envío (C7 + DTO del back): `{}` = envío permitido. No se valida el
 * cron — lo genera el propio formulario — y su longitud (≤ 100) es imposible de exceder.
 */
export function validateScheduleLocally(values: ScheduleFormValues): ScheduleFormErrors {
  const errors: ScheduleFormErrors = {};

  if (values.frequency === NO_SCHEDULE_FREQUENCY) {
    errors.frequency = "Elige una frecuencia para la programación";
  }
  if (values.reportType === "") {
    errors.reportType = "Selecciona el tipo de reporte";
  } else if (values.reportType === "INDIVIDUAL" && values.athleteId.trim() === "") {
    errors.athleteId = "Selecciona el deportista del reporte";
  }

  return errors;
}

/**
 * Cuerpo del POST/PUT: TODOS los campos del contrato, siempre presentes (el PUT es
 * completo). Los que no aplican al tipo elegido viajan como `null` explícito, nunca
 * omitidos.
 */
export function buildScheduleRequest(
  values: ScheduleFormValues,
  cronExpression: string,
): CreateReportScheduleRequest {
  const reportType = values.reportType as ReportType;
  return {
    reportType,
    athleteId: reportType === "INDIVIDUAL" ? Number(values.athleteId) : null,
    category: reportType === "GENERAL" && values.category !== "" ? values.category : null,
    cronExpression,
    // El centinela del select viaja como `null` (campo opcional del contrato); cualquier
    // otra zona se reenvía tal cual.
    timezone: values.timezone === NO_SCHEDULE_TIMEZONE ? null : values.timezone,
    active: values.active,
  };
}

/**
 * PUT COMPLETO de "pausar/reanudar" (sin abrir el form): se reconstruye desde la FILA
 * con el `active` invertido, sin omitir ningún campo del contrato.
 */
export function buildScheduleRequestFromSchedule(
  schedule: ReportScheduleResponse,
  active: boolean,
): UpdateReportScheduleRequest {
  return {
    reportType: schedule.reportType,
    athleteId: schedule.athleteId,
    category: schedule.category,
    cronExpression: schedule.cronExpression,
    timezone: schedule.timezone,
    active,
  };
}

/** Error seguro del guardado: cron inválido → mensaje propio; el resto, diccionario. */
export function toScheduleSubmitErrorMessage(error: unknown): string {
  if (isInvalidCronError(error)) {
    return SCHEDULE_INVALID_CRON_MESSAGE;
  }
  if (isApiError(error)) {
    return toUserFacingMessage(error);
  }
  return SCHEDULE_SAVE_FALLBACK_ERROR;
}

/** Texto de la opción de zona: el centinela se muestra con su etiqueta, no crudo. */
export function timezoneOptionLabel(timezone: string): string {
  return timezone === NO_SCHEDULE_TIMEZONE ? NO_SCHEDULE_TIMEZONE_LABEL : timezone;
}

export interface ScheduleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fila que se edita; `null` cuando se crea una programación nueva. */
  schedule: ReportScheduleResponse | null;
}

export function ScheduleFormDialog({ open, onOpenChange, schedule }: ScheduleFormDialogProps) {
  const isEdit = schedule !== null;

  const [values, setValues] = useState<ScheduleFormValues>(defaultScheduleFormValues);
  const [customCron, setCustomCron] = useState<string | null>(null);
  const [errors, setErrors] = useState<ScheduleFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReportScheduleResponse | null>(null);

  const createSchedule = useCreateReportSchedule();
  // En alta el hook existe con id 0 pero nunca se invoca (mismo patrón que reference-form).
  const updateSchedule = useUpdateReportSchedule(schedule?.id ?? 0);
  const athletesQuery = useQuery({ queryKey: allAthletesKey, queryFn: fetchAllAthletes });
  const athletes = athletesQuery.data ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }
    const initial = initialScheduleFormValues(schedule);
    setValues(initial.values);
    setCustomCron(initial.customCron);
    setErrors({});
    setServerError(null);
    setSaved(null);
  }, [open, schedule]);

  const pending = createSchedule.isPending || updateSchedule.isPending;
  const generatedCron = customCron ?? buildCronFromValues(values);

  function updateValue<K extends keyof ScheduleFormValues>(key: K, value: ScheduleFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors({});
  }

  /** Elegir frecuencia abandona el modo personalizado (el preset reemplaza el cron). */
  function handleFrequencyChange(frequency: string) {
    setCustomCron(null);
    updateValue("frequency", frequency);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const validation = validateScheduleLocally(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    const cronExpression = generatedCron;
    if (!cronExpression) {
      setServerError(SCHEDULE_INVALID_CRON_MESSAGE);
      return;
    }

    const body = buildScheduleRequest(values, cronExpression);
    const onSuccess = (result: ReportScheduleResponse) => setSaved(result);
    const onError = (error: unknown) => setServerError(toScheduleSubmitErrorMessage(error));

    if (isEdit) {
      updateSchedule.mutate(body, { onSuccess, onError });
    } else {
      createSchedule.mutate(body, { onSuccess, onError });
    }
  }

  /*
   * Zona horaria del back fuera de la lista corta: se añade para no cambiarla sin querer
   * (mismo criterio que con un minuto que no sea múltiplo de 5). «Sin zona horaria»
   * (el `null` del contrato) está SIEMPRE disponible, en alta y en edición.
   */
  const hasShortListTimezone = SCHEDULE_TIMEZONES.includes(
    values.timezone as (typeof SCHEDULE_TIMEZONES)[number],
  );
  const timezoneOptions: readonly string[] = [
    ...SCHEDULE_TIMEZONES,
    NO_SCHEDULE_TIMEZONE,
    ...(hasShortListTimezone || values.timezone === NO_SCHEDULE_TIMEZONE
      ? []
      : [values.timezone]),
  ].filter((timezone) => timezone !== "");

  const minuteOptions: readonly number[] = MINUTE_OPTIONS.includes(Number(values.minute))
    ? MINUTE_OPTIONS
    : [...MINUTE_OPTIONS, Number(values.minute)].sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="schedule-form" className="sm:max-w-lg">
        {saved ? (
          <>
            <DialogHeader>
              <DialogTitle>Programación guardada</DialogTitle>
              <DialogDescription>
                La fecha de la próxima ejecución la calcula el servidor; la zona horaria se
                guarda con la programación.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <p className="text-strong text-body" data-testid="schedule-next-run">
                Próxima ejecución:{" "}
                {saved.nextRunAt ? formatInstantDateTime(saved.nextRunAt) : "—"}
              </p>
              <p className="text-dim text-caption">
                {cronToHumanText(saved.cronExpression)} ·{" "}
                {saved.timezone ?? NO_SCHEDULE_TIMEZONE_LABEL}
              </p>
              {isScheduleActive(saved) ? null : (
                <p className="text-dim text-caption">
                  Está pausada: no se ejecutará hasta que la reanudes.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                data-testid="schedule-form-close"
              >
                Volver a la tabla
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {isEdit ? "Editar programación" : "Nueva programación"}
              </DialogTitle>
              <DialogDescription>
                Elige cuándo se genera el reporte; la expresión cron la construye la
                aplicación.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
              {serverError ? (
                <Alert variant="destructive" data-testid="schedule-form-error">
                  <AlertTitle>No se pudo guardar la programación</AlertTitle>
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              ) : null}

              {customCron ? (
                <Alert data-testid="schedule-custom-cron">
                  <AlertTitle>Frecuencia personalizada</AlertTitle>
                  <AlertDescription>
                    Esta programación usa una expresión que no corresponde a ningún preset
                    ({customCron}). Elige una frecuencia para reemplazarla; hasta entonces no
                    se puede guardar.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="schedule-frequency">Frecuencia</Label>
                  <Select onValueChange={handleFrequencyChange} value={values.frequency}>
                    <SelectTrigger
                      id="schedule-frequency"
                      className="w-full"
                      aria-invalid={errors.frequency ? true : undefined}
                      aria-describedby={errors.frequency ? "schedule-frequency-error" : undefined}
                      data-testid="schedule-frequency-select"
                    >
                      <SelectValue placeholder="Frecuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_FREQUENCIES.map((frequency) => (
                        <SelectItem key={frequency} value={frequency}>
                          {SCHEDULE_FREQUENCY_LABELS[frequency]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id="schedule-frequency-error" message={errors.frequency} />
                </div>

                {values.frequency === "WEEKLY" ? (
                  <div className="grid gap-1">
                    <Label htmlFor="schedule-weekday">Día de la semana</Label>
                    <Select
                      onValueChange={(weekday) => updateValue("weekday", weekday)}
                      value={values.weekday}
                    >
                      <SelectTrigger
                        id="schedule-weekday"
                        className="w-full"
                        data-testid="schedule-weekday-select"
                      >
                        <SelectValue placeholder="Día" />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEDULE_WEEKDAYS.map((weekday) => (
                          <SelectItem key={weekday} value={weekday}>
                            {SCHEDULE_WEEKDAY_LABELS[weekday]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {values.frequency === "MONTHLY" ? (
                  <div className="grid gap-1">
                    <Label htmlFor="schedule-month-day">Día del mes</Label>
                    <Select
                      onValueChange={(dayOfMonth) => updateValue("dayOfMonth", dayOfMonth)}
                      value={values.dayOfMonth}
                    >
                      <SelectTrigger
                        id="schedule-month-day"
                        className="w-full"
                        data-testid="schedule-month-day-select"
                      >
                        <SelectValue placeholder="Día" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_DAY_OPTIONS.map((day) => (
                          <SelectItem key={day} value={String(day)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label htmlFor="schedule-hour">Hora</Label>
                  <Select
                    onValueChange={(hour) => updateValue("hour", hour)}
                    value={values.hour}
                  >
                    <SelectTrigger
                      id="schedule-hour"
                      className="w-full"
                      data-testid="schedule-hour-select"
                    >
                      <SelectValue placeholder="Hora" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOUR_OPTIONS.map((hour) => (
                        <SelectItem key={hour} value={String(hour)}>
                          {String(hour).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="schedule-minute">Minuto</Label>
                  <Select
                    onValueChange={(minute) => updateValue("minute", minute)}
                    value={values.minute}
                  >
                    <SelectTrigger
                      id="schedule-minute"
                      className="w-full"
                      data-testid="schedule-minute-select"
                    >
                      <SelectValue placeholder="Minuto" />
                    </SelectTrigger>
                    <SelectContent>
                      {minuteOptions.map((minute) => (
                        <SelectItem key={minute} value={String(minute)}>
                          {String(minute).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1">
                  {/*
                   * El back persiste `timezone` y lo devuelve en el DTO, pero todavía NO
                   * lo usa para calcular la recurrencia: `ReportScheduleService#computeNextRun`
                   * parte de `clock.getZone()`. Prerrequisito registrado en la documentación
                   * del change `integrar-reportes`; el campo sigue en el formulario (C7) y
                   * ningún texto debe prometer que la próxima ejecución use esta zona. La
                   * opción «Sin zona horaria» (campo opcional del contrato) es igual de
                   * neutra: solo nombra la ausencia, no promete ningún comportamiento.
                   */}
                  <Label htmlFor="schedule-timezone">Zona horaria</Label>
                  <Select
                    onValueChange={(timezone) => updateValue("timezone", timezone)}
                    value={values.timezone}
                  >
                    <SelectTrigger
                      id="schedule-timezone"
                      className="w-full"
                      data-testid="schedule-timezone-select"
                    >
                      <SelectValue placeholder="Zona horaria" />
                    </SelectTrigger>
                    <SelectContent>
                      {timezoneOptions.map((timezone) => (
                        <SelectItem key={timezone} value={timezone}>
                          {timezoneOptionLabel(timezone)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="schedule-type">Tipo de reporte</Label>
                  <Select
                    onValueChange={(reportType) => updateValue("reportType", reportType)}
                    value={values.reportType}
                  >
                    <SelectTrigger
                      id="schedule-type"
                      className="w-full"
                      aria-invalid={errors.reportType ? true : undefined}
                      aria-describedby={errors.reportType ? "schedule-type-error" : undefined}
                      data-testid="schedule-type-select"
                    >
                      <SelectValue placeholder="Tipo de reporte" />
                    </SelectTrigger>
                    <SelectContent>
                      {(["INDIVIDUAL", "GENERAL"] as const).map((type) => (
                        <SelectItem key={type} value={type}>
                          {REPORT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id="schedule-type-error" message={errors.reportType} />
                </div>

                {values.reportType === "INDIVIDUAL" ? (
                  <div className="grid gap-1">
                    <Label htmlFor="schedule-athlete">Deportista</Label>
                    <Select
                      onValueChange={(athleteId) => updateValue("athleteId", athleteId)}
                      value={values.athleteId}
                    >
                      <SelectTrigger
                        id="schedule-athlete"
                        className="w-full"
                        aria-invalid={errors.athleteId ? true : undefined}
                        aria-describedby={errors.athleteId ? "schedule-athlete-error" : undefined}
                        data-testid="schedule-athlete-select"
                      >
                        <SelectValue
                          placeholder={
                            athletesQuery.isPending
                              ? "Cargando deportistas…"
                              : athletesQuery.isError
                                ? "No se pudo cargar la lista"
                                : "Selecciona un deportista"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {athletes.map((athlete) => (
                          <SelectItem key={athlete.id} value={String(athlete.id)}>
                            {athlete.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError id="schedule-athlete-error" message={errors.athleteId} />
                  </div>
                ) : null}

                {values.reportType === "GENERAL" ? (
                  <div className="grid gap-1">
                    <Label htmlFor="schedule-category">Categoría (opcional)</Label>
                    <Select
                      onValueChange={(category) => updateValue("category", category)}
                      value={values.category}
                    >
                      <SelectTrigger
                        id="schedule-category"
                        className="w-full"
                        data-testid="schedule-category-select"
                      >
                        <SelectValue placeholder="Todas las categorías" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_VALUES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {CHECKUP_CATEGORY_LABELS[category]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor="schedule-active">Programación activa</Label>
                  <p className="text-dim text-caption">
                    Una programación pausada conserva su frecuencia, pero no se ejecuta.
                  </p>
                </div>
                <Switch
                  id="schedule-active"
                  checked={values.active}
                  onCheckedChange={(active) => updateValue("active", active)}
                  data-testid="schedule-active-switch"
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="schedule-cron">Expresión cron generada</Label>
                <Input
                  id="schedule-cron"
                  readOnly
                  value={generatedCron ?? ""}
                  aria-describedby="schedule-cron-hint"
                  data-testid="schedule-cron-preview"
                />
                <p id="schedule-cron-hint" className="text-dim text-caption">
                  {generatedCron
                    ? `Se ejecutará: ${cronToHumanText(generatedCron)}`
                    : "Elige una frecuencia para generar la expresión."}
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending} data-testid="schedule-submit">
                  {pending
                    ? "Guardando…"
                    : isEdit
                      ? "Guardar cambios"
                      : "Crear programación"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="text-danger-text text-caption">
      {message}
    </p>
  );
}
