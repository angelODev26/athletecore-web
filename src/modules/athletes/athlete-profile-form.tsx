import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/*
 * Formulario del perfil antropométrico, reutilizado por el paso 3 del alta y por
 * la ficha (design.md). Los rangos replican el contrato (doc 04 §3) porque el
 * 400 del back no dice el campo (T1). BMI y categoría NUNCA se calculan aquí.
 */

export const athleteProfileSchema = z.object({
  weightKgs: z
    .string()
    .min(1, "El peso es obligatorio")
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), "El peso debe ser un número con máximo 2 decimales")
    .refine((value) => Number(value) >= 1 && Number(value) <= 500, "El peso debe estar entre 1.0 y 500.0 kg"),
  heightCm: z
    .string()
    .min(1, "La talla es obligatoria")
    .refine((value) => /^\d+(\.\d{1})?$/.test(value), "La talla debe ser un número con máximo 1 decimal")
    .refine((value) => Number(value) >= 10 && Number(value) <= 300, "La talla debe estar entre 10.0 y 300.0 cm"),
  armSpanCm: z
    .string()
    .refine((value) => value === "" || /^\d+(\.\d{1})?$/.test(value), "La envergadura debe ser un número con máximo 1 decimal")
    .refine(
      (value) => value === "" || (Number(value) >= 10 && Number(value) <= 300),
      "La envergadura debe estar entre 10.0 y 300.0 cm",
    ),
  notes: z.string(),
});

export type AthleteProfileFormValues = z.infer<typeof athleteProfileSchema>;

export const emptyAthleteProfileValues: AthleteProfileFormValues = {
  weightKgs: "",
  heightCm: "",
  armSpanCm: "",
  notes: "",
};

interface AthleteProfileFormProps {
  form: UseFormReturn<AthleteProfileFormValues>;
  pending?: boolean;
  serverError?: string | null;
  submitLabel?: string;
  submitTestId?: string;
  onSubmit: (values: AthleteProfileFormValues) => void;
  /** Paso 3 del wizard: "Omitir y terminar" navega a la ficha. */
  onSkip?: () => void;
  /** Ficha: descartar cambios y volver a la vista de lectura. */
  onCancel?: () => void;
}

export function AthleteProfileForm({
  form,
  pending = false,
  serverError,
  submitLabel = "Guardar perfil",
  submitTestId = "athlete-profile-submit",
  onSubmit,
  onSkip,
  onCancel,
}: AthleteProfileFormProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {serverError ? (
          <Alert variant="destructive" role="alert" data-testid="athlete-profile-error">
            <AlertTitle>No se pudo guardar el perfil</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="weightKgs"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Peso (kg)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="1"
                    max="500"
                    data-testid="athlete-profile-weight"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="heightCm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Talla (cm)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="10"
                    max="300"
                    data-testid="athlete-profile-height"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="armSpanCm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Envergadura (cm)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="10"
                    max="300"
                    data-testid="athlete-profile-armspan"
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
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas</FormLabel>
              <FormControl>
                <Textarea rows={3} data-testid="athlete-profile-notes" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending} data-testid={submitTestId}>
            {pending ? "Guardando…" : submitLabel}
          </Button>
          {onSkip ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onSkip}
              data-testid="athlete-skip-step"
            >
              Omitir y terminar
            </Button>
          ) : null}
          {onCancel ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={onCancel} data-testid="athlete-profile-cancel">
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>
    </Form>
  );
}
