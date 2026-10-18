import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isApiError, toUserFacingMessage } from "@/lib/api";
import type { GenerateReportRequest, ReportType } from "@/lib/api/types";
import { CHECKUP_CATEGORY_LABELS, monthNameEs } from "@/modules/checkups/format";
import { REPORT_TYPE_LABELS } from "@/modules/reports/format";
import { useGenerateReport } from "@/modules/reports/reports-api";
import { allAthletesKey, fetchAllAthletes } from "@/modules/training/training-api";

/*
 * C5: generación de reportes (`POST /reports`), dialog visible solo para ADMIN/COACH
 * (C9). La generación es SÍNCRONA (deuda T3): la request puede tardar segundos, así que
 * el botón queda en loading durante TODA la llamada y NO hay polling — la `201` ya trae
 * el `status` final y la UI lo LEE:
 *   - `GENERATED` (o un futuro `PENDING`): se cierra el dialog, el hook invalida la
 *     biblioteca y se navega al detalle, donde vive el badge de estado.
 *   - `FAILED`: el dialog PERMANECE con un banner `role="alert"` mostrando el
 *     `errorMessage` del servidor (lo redacta el back para el usuario).
 *
 * Validación LOCAL EXACTA del contrato (`GenerateReportRequest`):
 * `reportType` obligatorio (enum), `title` no vacío y ≤ 200, INDIVIDUAL requiere
 * `athleteId` (regla de servicio) — todo bloqueado ANTES de llamar al back. `year`/`month`
 * no tienen reglas en el DTO: el `select` de mes 1–12 es UX, y del `year` solo se valida
 * que sea un entero (formato del propio input, no una regla de negocio).
 */

export const REPORT_TITLE_MAX_LENGTH = 200;

const REPORT_TYPE_VALUES = ["INDIVIDUAL", "GENERAL"] as const;
const CATEGORY_VALUES = ["INFANTIL", "JUVENIL", "MAYOR"] as const;
const MONTH_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Valor del Select de mes: "" = sin período. */
const MONTH_OPTIONS: ReadonlyArray<{ value: string; label: string }> = MONTH_VALUES.map(
  (month) => ({ value: String(month), label: monthNameEs(month) }),
);

export interface ReportFormValues {
  /** `""` (sin selección) se castea: el Select lo muestra como placeholder. */
  reportType: ReportType;
  /** "" = sin deportista seleccionado (valor del Select). */
  athleteId: string;
  /** "" = todas las categorías. */
  category: string;
  title: string;
  /** "" = sin año. */
  year: string;
  /** "" = sin mes. */
  month: string;
}

const EMPTY_VALUES: ReportFormValues = {
  reportType: "" as unknown as ReportType,
  athleteId: "",
  category: "",
  title: "",
  year: "",
  month: "",
};

export const reportFormSchema = z
  .object({
    reportType: z.enum(REPORT_TYPE_VALUES, { message: "Selecciona el tipo de reporte" }),
    athleteId: z.string(),
    category: z.string(),
    title: z.string(),
    year: z.string(),
    month: z.string(),
  })
  // Reglas del contrato replicadas en cliente (C5): se validan en el resolver para que
  // el bloqueo ocurra incluso con otros campos sin completar.
  .superRefine((values, ctx) => {
    for (const [field, message] of Object.entries(validateReportLocally(values))) {
      ctx.addIssue({ code: "custom", path: [field as "athleteId" | "title" | "year"], message });
    }
  });

/**
 * Reglas locales del envío (contrato 07 §3 + regla de servicio del back). Devuelve el
 * mensaje por campo; `{}` = envío permitido.
 */
export function validateReportLocally(values: {
  reportType?: string;
  athleteId: string;
  title: string;
  year?: string;
}): { athleteId?: string; title?: string; year?: string } {
  const errors: { athleteId?: string; title?: string; year?: string } = {};

  const title = values.title.trim();
  if (title === "") {
    errors.title = "El título es obligatorio";
  } else if (title.length > REPORT_TITLE_MAX_LENGTH) {
    errors.title = `El título no puede superar ${REPORT_TITLE_MAX_LENGTH} caracteres`;
  }

  if (values.reportType === "INDIVIDUAL" && values.athleteId.trim() === "") {
    errors.athleteId = "Selecciona el deportista del reporte";
  }

  const year = (values.year ?? "").trim();
  if (year !== "" && !/^\d+$/.test(year)) {
    errors.year = "El año debe ser un número entero (por ejemplo 2026)";
  }

  return errors;
}

/** 400/404 residuales del envío: mensaje seguro, nunca el texto crudo del back. */
export function toReportSubmitErrorMessage(
  error: unknown,
  fallback = "No se pudo generar el reporte. Inténtalo de nuevo.",
): string {
  if (isApiError(error)) {
    return toUserFacingMessage(error);
  }
  return fallback;
}

/** Cuerpo EXACTO: solo los campos que aplican al tipo elegido (enums en mayúsculas). */
export function buildGenerateReportRequest(values: ReportFormValues): GenerateReportRequest {
  const reportType = values.reportType as ReportType;
  const body: GenerateReportRequest = {
    reportType,
    // El contrato exige `title` no vacío: se recorta el espacio accidental del input.
    title: values.title.trim(),
  };

  if (reportType === "INDIVIDUAL") {
    body.athleteId = Number(values.athleteId);
  } else if (values.category !== "") {
    body.category = values.category;
  }

  if (values.year.trim() !== "") {
    body.year = Number(values.year);
  }
  if (values.month !== "") {
    body.month = Number(values.month);
  }

  return body;
}

export interface ReportFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportFormDialog({ open, onOpenChange }: ReportFormDialogProps) {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const generateReport = useGenerateReport();
  // Misma query key que la biblioteca y la planilla de pase de lista: una sola llamada.
  const athletesQuery = useQuery({ queryKey: allAthletesKey, queryFn: fetchAllAthletes });
  const athletes = athletesQuery.data ?? [];

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      setGenerationError(null);
      form.reset(EMPTY_VALUES);
    }
  }, [open, form]);

  const reportType = form.watch("reportType");

  const handleSubmit = form.handleSubmit((values) => {
    setServerError(null);
    setGenerationError(null);

    // ── Envío (las reglas del contrato ya las aplicó el resolver) ──
    generateReport.mutate(buildGenerateReportRequest(values), {
      onSuccess: (created) => {
        if (created.status === "FAILED") {
          // 201 con status final FAILED: el dialog NO se cierra y el back redacta el motivo.
          setGenerationError(created.errorMessage ?? "El servidor no pudo generar el reporte.");
          return;
        }
        onOpenChange(false);
        void navigate(`/reports/${created.id}`);
      },
      onError: (error) => {
        setServerError(toReportSubmitErrorMessage(error));
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="report-form" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generar reporte</DialogTitle>
          <DialogDescription>
            El PDF se genera al instante. Un reporte individual necesita un deportista; uno
            general puede cubrir una categoría.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            {generationError ? (
              <Alert variant="destructive" role="alert" data-testid="report-generation-error">
                <AlertTitle>El reporte no se pudo generar</AlertTitle>
                <AlertDescription>{generationError}</AlertDescription>
              </Alert>
            ) : null}
            {serverError ? (
              <Alert variant="destructive" role="alert" data-testid="report-form-error">
                <AlertTitle>No se pudo generar el reporte</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <FormField
              control={form.control}
              name="reportType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de reporte</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="report-type-select" className="w-full">
                        <SelectValue placeholder="Tipo de reporte" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {REPORT_TYPE_VALUES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {REPORT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {reportType === "INDIVIDUAL" ? (
              <FormField
                control={form.control}
                name="athleteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deportista</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={athletesQuery.isPending || athletesQuery.isError}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="report-athlete-select" className="w-full">
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
                      </FormControl>
                      <SelectContent>
                        {athletes.map((athlete) => (
                          <SelectItem key={athlete.id} value={String(athlete.id)}>
                            {athlete.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {reportType === "GENERAL" ? (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría (opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="report-category-select" className="w-full">
                          <SelectValue placeholder="Todas las categorías" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORY_VALUES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {CHECKUP_CATEGORY_LABELS[category]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      // Un carácter más que el máximo del contrato: así la validación
                      // local AVISA en vez de truncar el texto del usuario en silencio.
                      maxLength={REPORT_TITLE_MAX_LENGTH + 1}
                      placeholder="Informe de marzo"
                      data-testid="report-title-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Año (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step={1}
                        placeholder="2026"
                        data-testid="report-year-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="month"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mes (opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="report-month-select" className="w-full">
                          <SelectValue placeholder="Sin mes" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MONTH_OPTIONS.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={generateReport.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={generateReport.isPending}
                data-testid="report-submit"
              >
                {generateReport.isPending ? "Generando…" : "Generar reporte"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
