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
import type {
  CheckupCategory,
  NationalReferenceTimeListItemResponse,
  SwimmingStyle,
} from "@/lib/api/types";
import {
  CHECKUP_CATEGORY_LABELS,
  parseTimeToSeconds,
  SWIMMING_STYLE_LABELS,
  TIME_POSITION,
} from "@/modules/checkups/format";
import {
  useCreateReferenceTime,
  useUpdateReferenceTime,
} from "@/modules/checkups/checkups-api";
import { toCheckupsSubmitErrorMessage } from "@/modules/checkups/submit-error";

/*
 * C7/C9: alta y edición de una posición del podio de la tabla nacional. PUT es
 * COMPLETO (los 5 campos obligatorios del NationalReferenceTimeRequest) — el form
 * parte pre-cargado con los valores actuales. En edición y en celda vacía de un
 * grupo existente, style/distance/category/position están bloqueados y
 * pre-cargados; solo se edita el tiempo (input mm:ss.fff → parseTimeToSeconds).
 * En "nueva combinación" se pueden elegir los 5 campos.
 */

const STYLE_VALUES = ["LIBRE", "ESPALDA", "BRAZA", "MARIPOSA", "COMBINADO"] as const;
const CATEGORY_VALUES = ["INFANTIL", "JUVENIL", "MAYOR"] as const;
const POSITION_VALUES = [1, 2, 3] as const;

export const TIME_INPUT_PLACEHOLDER = "mm:ss.fff";

export const referenceFormSchema = z
  .object({
    style: z.enum(STYLE_VALUES, { message: "Selecciona el estilo" }),
    distance: z.string(),
    category: z.enum(CATEGORY_VALUES, { message: "Selecciona la categoría" }),
    /** Valor del Select: "" no válido; 1..3. */
    position: z.string(),
    time: z.string(),
  })
  // Reglas 400 del contrato replicadas en cliente (C5/C7): se validan en el
  // resolver para que el bloqueo ocurra incluso con otros campos sin completar.
  .superRefine((values, ctx) => {
    for (const [field, message] of Object.entries(validateReferenceLocally(values))) {
      ctx.addIssue({ code: "custom", path: [field as "distance" | "position" | "time"], message });
    }
  });

export type ReferenceFormValues = z.infer<typeof referenceFormSchema>;

export type ReferenceFormMode =
  | { kind: "new-combination" }
  | { kind: "new-cell"; style: string; distance: number; category: string; position: number }
  | { kind: "edit"; reference: NationalReferenceTimeListItemResponse };

/** Reglas 400 del contrato replicadas en cliente (C5/C7). Sin límites superiores. */
export function validateReferenceLocally(values: Pick<ReferenceFormValues, "distance" | "position" | "time">): {
  distance?: string;
  position?: string;
  time?: string;
} {
  const errors: { distance?: string; position?: string; time?: string } = {};

  const distance = values.distance.trim() === "" ? Number.NaN : Number(values.distance);
  if (!Number.isInteger(distance) || distance < 1) {
    errors.distance = "La distancia debe ser un número entero mayor o igual que 1";
  }

  const position = values.position.trim() === "" ? Number.NaN : Number(values.position);
  if (!Number.isInteger(position) || position < 1 || position > 3) {
    errors.position = "La posición debe estar entre 1 y 3";
  }

  if (parseTimeToSeconds(values.time) === null) {
    errors.time = `Formato esperado ${TIME_INPUT_PLACEHOLDER} (ej. 01:03.300)`;
  }

  return errors;
}

/** Unicidad (style, distance, category, position) prevalidable contra la lista (C5). */
export function isReferenceDuplicate(
  values: { style: string; distance: number; category: string; position: number },
  existing: NationalReferenceTimeListItemResponse[],
  excludeId?: number,
): boolean {
  return existing.some(
    (reference) =>
      reference.id !== excludeId &&
      reference.style === values.style &&
      reference.distance === values.distance &&
      reference.category === values.category &&
      reference.position === values.position,
  );
}

function defaultValuesFor(mode: ReferenceFormMode): ReferenceFormValues {
  if (mode.kind === "edit") {
    return {
      style: mode.reference.style as SwimmingStyle,
      distance: String(mode.reference.distance),
      category: mode.reference.category as CheckupCategory,
      position: String(mode.reference.position),
      time: mode.reference.timeFormatted,
    };
  }
  if (mode.kind === "new-cell") {
    return {
      style: mode.style as SwimmingStyle,
      distance: String(mode.distance),
      category: mode.category as CheckupCategory,
      position: String(mode.position),
      time: "",
    };
  }
  return {
    style: undefined as unknown as SwimmingStyle,
    distance: "",
    category: undefined as unknown as CheckupCategory,
    position: "",
    time: "",
  };
}

function isFieldLocked(mode: ReferenceFormMode): boolean {
  return mode.kind !== "new-combination";
}

interface ReferenceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ReferenceFormMode;
  /** Lista completa cargada para detectar duplicados en cliente. */
  existing: NationalReferenceTimeListItemResponse[];
}

export function ReferenceFormDialog({ open, onOpenChange, mode, existing }: ReferenceFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const createReference = useCreateReferenceTime();
  const updateReference = useUpdateReferenceTime(mode.kind === "edit" ? mode.reference.id : 0);

  const form = useForm<ReferenceFormValues>({
    resolver: zodResolver(referenceFormSchema),
    defaultValues: defaultValuesFor(mode),
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset(defaultValuesFor(mode));
    }
  }, [open, mode, form]);

  const isEdit = mode.kind === "edit";
  const lockStyleCategoryPosition = isFieldLocked(mode);

  const handleSubmit = form.handleSubmit((values) => {
    setServerError(null);

    // ── Envío (las reglas 400 del contrato ya las aplicó el resolver) ──
    const distance = Number(values.distance);
    const position = Number(values.position);

    if (
      !isEdit &&
      isReferenceDuplicate(
        { style: values.style, distance, category: values.category, position },
        existing,
      )
    ) {
      form.setError("root", {
        message: "Ya existe una referencia para ese estilo, distancia, categoría y posición",
      });
      return;
    }

    // ── Envío: POST nuevo / PUT COMPLETO con los 5 campos (C7) ──
    const body = {
      style: values.style,
      distance,
      category: values.category,
      position,
      timeSeconds: parseTimeToSeconds(values.time) as number,
    };

    const mutation = isEdit ? updateReference : createReference;
    mutation.mutate(body as never, {
      onSuccess: () => onOpenChange(false),
      onError: (error) => {
        setServerError(
          toCheckupsSubmitErrorMessage(
            error,
            isEdit
              ? "No se pudo actualizar la referencia. Inténtalo de nuevo."
              : "No se pudo crear la referencia. Inténtalo de nuevo.",
          ),
        );
      },
    });
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="reference-form" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar referencia" : "Nueva referencia"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "La actualización es completa: se envían los 5 campos del contrato."
              : "Registra una posición del podio (oro, plata o bronce) para una combinación."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            {serverError ? (
              <Alert variant="destructive" role="alert" data-testid="reference-form-error">
                <AlertTitle>No se pudo guardar la referencia</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
            {rootError ? (
              <Alert variant="destructive" role="alert" data-testid="reference-form-duplicate">
                <AlertTitle>Referencia duplicada</AlertTitle>
                <AlertDescription>{rootError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="style"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estilo</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={lockStyleCategoryPosition}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="reference-form-style" className="w-full">
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
                        data-testid="reference-form-distance"
                        disabled={lockStyleCategoryPosition}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={lockStyleCategoryPosition}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="reference-form-category" className="w-full">
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
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posición</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={lockStyleCategoryPosition}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="reference-form-position" className="w-full">
                          <SelectValue placeholder="Posición" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {POSITION_VALUES.map((position) => (
                          <SelectItem key={position} value={String(position)}>
                            {TIME_POSITION[position]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
                      data-testid="reference-form-time"
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
                disabled={mutationPending(createReference, updateReference)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={mutationPending(createReference, updateReference)}
                data-testid="reference-form-submit"
              >
                {mutationPending(createReference, updateReference)
                  ? "Guardando…"
                  : isEdit
                    ? "Guardar cambios"
                    : "Crear referencia"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function mutationPending(
  createReference: ReturnType<typeof useCreateReferenceTime>,
  updateReference: ReturnType<typeof useUpdateReferenceTime>,
): boolean {
  return createReference.isPending || updateReference.isPending;
}
