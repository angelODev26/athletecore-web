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
import type { CheckupDetailResponse, SwimmingStyle } from "@/lib/api/types";
import { parseTimeToSeconds, SWIMMING_STYLE_LABELS } from "@/modules/checkups/format";
import { useAddCheckupTime } from "@/modules/checkups/checkups-api";
import { toCheckupsSubmitErrorMessage } from "@/modules/checkups/submit-error";

/*
 * C2: alta de tiempo de prueba (ADMIN/COACH). El input `mm:ss.fff` se parsea
 * LOCALMENTE a segundos antes de enviar (`timeSeconds` numérico) — el front
 * nunca formatea, solo parsea su propio input. Enums SIEMPRE en mayúsculas.
 * La unicidad (style, distance) se prevalida contra detail.times (C5); el 409
 * residual se mapea vía KNOWN_BACKEND_MESSAGES.
 */

const STYLE_VALUES = ["LIBRE", "ESPALDA", "BRAZA", "MARIPOSA", "COMBINADO"] as const;

export const TIME_INPUT_PLACEHOLDER = "mm:ss.fff";

export const timeFormSchema = z
  .object({
    style: z.enum(STYLE_VALUES, { message: "Selecciona el estilo" }),
    distance: z.string(),
    time: z.string(),
  })
  // Reglas 400 del contrato replicadas en cliente (C5): se validan en el resolver
  // para que el bloqueo ocurra incluso con otros campos sin completar.
  .superRefine((values, ctx) => {
    for (const [field, message] of Object.entries(validateTimeLocally(values))) {
      ctx.addIssue({ code: "custom", path: [field as "distance" | "time"], message });
    }
  });

export type TimeFormValues = z.infer<typeof timeFormSchema>;

/** Reglas 400 del contrato replicadas en cliente (C5): distancia entera ≥ 1 y tiempo > 0. */
export function validateTimeLocally(values: Pick<TimeFormValues, "distance" | "time">): {
  distance?: string;
  time?: string;
} {
  const errors: { distance?: string; time?: string } = {};

  const distance = values.distance.trim() === "" ? Number.NaN : Number(values.distance);
  if (!Number.isInteger(distance) || distance < 1) {
    errors.distance = "La distancia debe ser un número entero mayor o igual que 1";
  }

  if (parseTimeToSeconds(values.time) === null) {
    errors.time = `Formato esperado ${TIME_INPUT_PLACEHOLDER} (ej. 01:05.250)`;
  }

  return errors;
}

/** Unicidad (style, distance) dentro del chequeo — prevalidable con detail.times. */
export function isTimeDuplicate(style: string, distance: number, times: CheckupDetailResponse["times"]): boolean {
  return times.some((time) => time.style === style && time.distance === distance);
}

const emptyValues: TimeFormValues = {
  style: undefined as unknown as SwimmingStyle,
  distance: "",
  time: "",
};

interface TimeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkup: CheckupDetailResponse;
}

export function TimeFormDialog({ open, onOpenChange, checkup }: TimeFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const addTime = useAddCheckupTime(checkup.id);

  const form = useForm<TimeFormValues>({
    resolver: zodResolver(timeFormSchema),
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
    const distance = Number(values.distance);
    if (isTimeDuplicate(values.style, distance, checkup.times)) {
      form.setError("root", {
        message: "Ya existe un tiempo registrado para ese estilo y distancia en este chequeo",
      });
      return;
    }

    // ── Envío: timeSeconds numérico parseado del input (C2); enums en mayúsculas ──
    addTime.mutate(
      {
        style: values.style,
        distance,
        timeSeconds: parseTimeToSeconds(values.time) as number,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          setServerError(
            toCheckupsSubmitErrorMessage(
              error,
              "No se pudo agregar el tiempo. Inténtalo de nuevo.",
            ),
          );
        },
      },
    );
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="time-form-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar tiempo</DialogTitle>
          <DialogDescription>
            Registra un tiempo de prueba del chequeo ({TIME_INPUT_PLACEHOLDER}).
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            {serverError ? (
              <Alert variant="destructive" role="alert" data-testid="time-form-error">
                <AlertTitle>No se pudo agregar el tiempo</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
            {rootError ? (
              <Alert variant="destructive" role="alert" data-testid="time-form-duplicate">
                <AlertTitle>Tiempo duplicado</AlertTitle>
                <AlertDescription>{rootError}</AlertDescription>
              </Alert>
            ) : null}
            <FormField
              control={form.control}
              name="style"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estilo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="time-style-select" className="w-full">
                        <SelectValue placeholder="Estilo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STYLE_VALUES.map((style) => (
                        <SelectItem key={style} value={style}>
                          {SWIMMING_STYLE_LABELS[style]}
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
              name="distance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Distancia (metros)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="100"
                      data-testid="time-distance-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tiempo</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      inputMode="numeric"
                      placeholder={TIME_INPUT_PLACEHOLDER}
                      data-testid="time-input"
                      {...field}
                    />
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
                disabled={addTime.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={addTime.isPending} data-testid="time-submit-button">
                {addTime.isPending ? "Guardando…" : "Agregar tiempo"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
