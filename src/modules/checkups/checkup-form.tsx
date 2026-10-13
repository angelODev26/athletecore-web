import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Textarea } from "@/components/ui/textarea";
import type { CheckupCategory, CheckupResponse } from "@/lib/api/types";
import { CHECKUP_CATEGORY_LABELS, MONTH_NAMES_ES } from "@/modules/checkups/format";
import { useCreateCheckup } from "@/modules/checkups/checkups-api";
import { toCheckupsSubmitErrorMessage } from "@/modules/checkups/submit-error";

/*
 * Alta de chequeo (ADMIN/COACH) con validación local completa (C5): replica las
 * reglas EXACTAS del contrato (doc 06 §2 — year 1900–2100, month 1–12, categoría
 * del enum) porque los 400 del back no son mapeables por campo. También detecta
 * en cliente el duplicado (athleteId, year, month, category) contra la lista ya
 * cargada; el 409 residual se mapea vía KNOWN_BACKEND_MESSAGES.
 */

export const CHECKUP_YEAR_MIN = 1900;
export const CHECKUP_YEAR_MAX = 2100;

const CATEGORY_VALUES = ["INFANTIL", "JUVENIL", "MAYOR"] as const;

/** Reglas 400 del contrato, replicadas en cliente (C5). */

export const checkupFormSchema = z
  .object({
    year: z.string(),
    month: z.string(),
    category: z.enum(CATEGORY_VALUES, { message: "Selecciona la categoría" }),
    notes: z.string(),
  })
  // Reglas 400 del contrato replicadas en cliente (C5): se validan en el resolver
  // para que el bloqueo ocurra incluso con otros campos sin completar.
  .superRefine((values, ctx) => {
    for (const [field, message] of Object.entries(validateCheckupLocally(values))) {
      ctx.addIssue({ code: "custom", path: [field as "year" | "month"], message });
    }
  });

export type CheckupFormValues = z.infer<typeof checkupFormSchema>;

/** Reglas 400 del contrato, replicadas en cliente (C5). */
export function validateCheckupLocally(
  values: Pick<CheckupFormValues, "year" | "month">,
): Partial<Record<"year" | "month", string>> {
  const errors: Partial<Record<"year" | "month", string>> = {};

  const year = values.year.trim() === "" ? Number.NaN : Number(values.year);
  if (!Number.isInteger(year) || year < CHECKUP_YEAR_MIN || year > CHECKUP_YEAR_MAX) {
    errors.year = `El año debe estar entre ${CHECKUP_YEAR_MIN} y ${CHECKUP_YEAR_MAX}`;
  }

  const month = values.month.trim() === "" ? Number.NaN : Number(values.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    errors.month = "El mes debe estar entre 1 y 12";
  }

  return errors;
}

/** Unicidad (athleteId, year, month, category) prevalidable con la lista cargada. */
export function isCheckupDuplicate(
  values: { year: string; month: string; category: CheckupCategory },
  existing: CheckupResponse[],
): boolean {
  const year = Number(values.year);
  const month = Number(values.month);
  return existing.some(
    (checkup) => checkup.year === year && checkup.month === month && checkup.category === values.category,
  );
}

const emptyValues: CheckupFormValues = {
  year: "",
  month: "",
  category: undefined as unknown as CheckupCategory,
  notes: "",
};

interface CheckupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteId: number;
  /** Lista ya cargada (sin filtro aplicado en ese momento) para detectar duplicados. */
  existingCheckups: CheckupResponse[];
}

export function CheckupFormDialog({ open, onOpenChange, athleteId, existingCheckups }: CheckupFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const createCheckup = useCreateCheckup(athleteId);

  const form = useForm<CheckupFormValues>({
    resolver: zodResolver(checkupFormSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset(emptyValues);
    }
  }, [open, form]);

  const handleSubmit = form.handleSubmit((values) => {
    setServerError(null);

    // ── Envío (las reglas 400 del contrato ya las aplicó el resolver) ──
    if (isCheckupDuplicate(values, existingCheckups)) {
      form.setError("root", { message: "Ya existe un chequeo de ese año y mes para esta categoría" });
      return;
    }

    // ── Envío: enums SIEMPRE en mayúsculas (C2); athleteId de la ruta en el body ──
    createCheckup.mutate(
      {
        athleteId,
        year: Number(values.year),
        month: Number(values.month),
        category: values.category,
        notes: values.notes.trim() === "" ? undefined : values.notes.trim(),
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          setServerError(
            toCheckupSubmitError(error, "No se pudo crear el chequeo. Inténtalo de nuevo."),
          );
        },
      },
    );
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="checkup-form-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo chequeo</DialogTitle>
          <DialogDescription>
            Registra el chequeo mensual con su período y categoría.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            {serverError ? (
              <Alert variant="destructive" role="alert" data-testid="checkup-form-error">
                <AlertTitle>No se pudo crear el chequeo</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
            {rootError ? (
              <Alert variant="destructive" role="alert" data-testid="checkup-form-duplicate">
                <AlertTitle>Chequeo duplicado</AlertTitle>
                <AlertDescription>{rootError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="month"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mes</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="checkup-form-month" className="w-full">
                          <SelectValue placeholder="Mes" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MONTH_NAMES_ES.map((name, index) => (
                          <SelectItem key={name} value={String(index + 1)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Año</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={CHECKUP_YEAR_MIN}
                        max={CHECKUP_YEAR_MAX}
                        placeholder={`${CHECKUP_YEAR_MIN}–${CHECKUP_YEAR_MAX}`}
                        data-testid="checkup-form-year"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="checkup-form-category" className="w-full">
                        <SelectValue placeholder="Categoría" />
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
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea data-testid="checkup-form-notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createCheckup.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createCheckup.isPending} data-testid="checkup-form-submit">
                {createCheckup.isPending ? "Creando…" : "Crear chequeo"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** C5: el 409 duplicado llega mapeado; el resto, mensaje global seguro o fallback. */
function toCheckupSubmitError(error: unknown, fallback: string): string {
  return toCheckupsSubmitErrorMessage(error, fallback);
}
