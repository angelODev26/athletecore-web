import { useEffect, useMemo, useState } from "react";
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
import type { TrainingCycleNode, TrainingPlanDetailResponse } from "@/lib/api/types";
import { CYCLE_TYPE_LABELS } from "@/modules/training/format";
import { useCreateCycle } from "@/modules/training/training-api";
import { toSubmitErrorMessage } from "@/modules/training/submit-error";

/*
 * Alta de ciclos (solo ADMIN, T8) con pre-validación T5: el formulario tiene el árbol
 * del plan en memoria, así que replica las reglas 400 del contrato (doc 05 §2) ANTES
 * de enviar: tipo ↔ padre, rango de fechas dentro del contenedor, nombre no duplicado.
 * Un 400 que se cuele se muestra como mensaje global seguro (doc 08 §1: `details` no
 * trae nombres de campo — el campo a campo real es esta validación local).
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const cycleFormSchema = z.object({
  type: z.enum(["MESOCICLO", "MICROCICLO"]),
  /** Valor del Select: "" = sin padre (solo válido para MESOCICLO). */
  parentCycleId: z.string(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150, "El nombre no puede superar 150 caracteres"),
  startDate: z.string().regex(ISO_DATE_PATTERN, "Introduce una fecha válida (AAAA-MM-DD)"),
  endDate: z.string().regex(ISO_DATE_PATTERN, "Introduce una fecha válida (AAAA-MM-DD)"),
  /** El input `type="number"` entrega string; se valida en superRefine. */
  orderIndex: z.string(),
}).superRefine((values, ctx) => {
  const order = values.orderIndex.trim() === "" ? Number.NaN : Number(values.orderIndex);
  if (!Number.isInteger(order) || order < 0) {
    ctx.addIssue({
      code: "custom",
      path: ["orderIndex"],
      message: "El orden debe ser un número entero igual o mayor que 0",
    });
  }
});

export type CycleFormValues = z.infer<typeof cycleFormSchema>;

/** Errores locales por campo (T5); vacío = el envío puede proseguir. */
export type CycleFieldErrors = Partial<Record<"parentCycleId" | "name" | "startDate" | "endDate", string>>;

/**
 * T5: pre-validación local de las reglas 400 del contrato (doc 05 §2). El formulario
 * tiene el árbol del plan en memoria, así que las replica ANTES de enviar:
 * micro exige padre MESOCICLO del mismo plan, meso sin padre, fechas dentro del
 * rango del contenedor y nombre no duplicado en el plan.
 */
export function validateCycleLocally(
  values: CycleFormValues,
  plan: Pick<TrainingPlanDetailResponse, "startDate" | "endDate" | "cycles">,
): CycleFieldErrors {
  const errors: CycleFieldErrors = {};
  const parent =
    values.type === "MICROCICLO"
      ? plan.cycles.find((cycle) => String(cycle.id) === values.parentCycleId) ?? null
      : null;

  if (values.type === "MICROCICLO" && parent === null) {
    errors.parentCycleId = "Un microciclo requiere un mesociclo padre del mismo plan";
  }

  if (values.endDate < values.startDate) {
    errors.endDate = "La fecha de fin debe ser posterior o igual a la de inicio";
  }

  const rangeStart = values.type === "MICROCICLO" ? (parent?.startDate ?? plan.startDate) : plan.startDate;
  const rangeEnd = values.type === "MICROCICLO" ? (parent?.endDate ?? plan.endDate) : plan.endDate;
  if (values.startDate < rangeStart || values.startDate > rangeEnd) {
    errors.startDate = `La fecha debe estar entre ${rangeStart} y ${rangeEnd}`;
  }
  if (values.endDate >= values.startDate && (values.endDate < rangeStart || values.endDate > rangeEnd)) {
    errors.endDate = `La fecha debe estar entre ${rangeStart} y ${rangeEnd}`;
  }

  const duplicate = collectCycleNames(plan.cycles).some((name) => name.trim() === values.name.trim());
  if (duplicate) {
    errors.name = "Ya existe un ciclo con ese nombre en el plan";
  }

  return errors;
}

/** Todos los nombres de ciclo del plan (meso + micro anidados), en orden del árbol. */
export function collectCycleNames(cycles: TrainingCycleNode[]): string[] {
  return cycles.flatMap((cycle) => [cycle.name, ...collectCycleNames(cycle.children)]);
}

interface CycleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: TrainingPlanDetailResponse;
  /** `null` → alta de MESOCICLO desde la raíz; nodo → microciclo bajo ese mesociclo. */
  parentCycle: TrainingCycleNode | null;
  onSaved: () => void;
}

export function CycleFormDialog({ open, onOpenChange, plan, parentCycle, onSaved }: CycleFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const createMutation = useCreateCycle(plan.id);

  const mesocycles = useMemo(() => plan.cycles, [plan.cycles]);
  const siblingCount = parentCycle ? parentCycle.children.length : plan.cycles.length;

  const form = useForm<CycleFormValues>({
    resolver: zodResolver(cycleFormSchema),
    defaultValues: {
      type: parentCycle ? "MICROCICLO" : "MESOCICLO",
      parentCycleId: parentCycle ? String(parentCycle.id) : "",
      name: "",
      startDate: "",
      endDate: "",
      orderIndex: String(siblingCount + 1),
    },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset({
        type: parentCycle ? "MICROCICLO" : "MESOCICLO",
        parentCycleId: parentCycle ? String(parentCycle.id) : "",
        name: "",
        startDate: "",
        endDate: "",
        orderIndex: String(siblingCount + 1),
      });
    }
  }, [open, parentCycle, siblingCount, form]);

  const cycleType = form.watch("type");
  const isMicro = cycleType === "MICROCICLO";

  const handleSubmit = form.handleSubmit((values) => {
    setServerError(null);

    // ── Pre-validación T5 (el back repite estas reglas como 400, doc 05 §2) ──
    const fieldErrors = validateCycleLocally(values, plan);
    const entries = Object.entries(fieldErrors) as Array<[keyof CycleFieldErrors, string]>;
    if (entries.length > 0) {
      for (const [field, message] of entries) {
        form.setError(field, { message });
      }
      return;
    }

    const parent = mesocycles.find((cycle) => String(cycle.id) === values.parentCycleId) ?? null;

    // ── Envío (reglas locales ok; un 400 restante es mensaje global seguro) ──
    createMutation.mutate(
      {
        type: values.type,
        name: values.name,
        startDate: values.startDate,
        endDate: values.endDate,
        orderIndex: Number(values.orderIndex),
        ...(values.type === "MICROCICLO" && parent ? { parentCycleId: parent.id } : {}),
      },
      {
        onSuccess: onSaved,
        onError: (error) => {
          setServerError(
            toSubmitErrorMessage(error, "No se pudo crear el ciclo. Inténtalo de nuevo."),
          );
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="cycle-form-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo ciclo</DialogTitle>
          <DialogDescription>
            {parentCycle
              ? `Se creará un microciclo dentro de “${parentCycle.name}”.`
              : "Se creará un mesociclo en la raíz del plan."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            {serverError ? (
              <Alert variant="destructive" role="alert" data-testid="cycle-form-error">
                <AlertTitle>No se pudo crear el ciclo</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={parentCycle !== null}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="cycle-form-type" className="w-full">
                          <SelectValue placeholder="Tipo de ciclo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MESOCICLO">{CYCLE_TYPE_LABELS.MESOCICLO}</SelectItem>
                        <SelectItem value="MICROCICLO">{CYCLE_TYPE_LABELS.MICROCICLO}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isMicro ? (
                <FormField
                  control={form.control}
                  name="parentCycleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mesociclo padre</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="cycle-form-parent" className="w-full">
                            <SelectValue placeholder="Selecciona el mesociclo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {mesocycles.map((cycle) => (
                            <SelectItem key={cycle.id} value={String(cycle.id)}>
                              {cycle.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" data-testid="cycle-form-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inicio</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="cycle-form-startDate" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="cycle-form-endDate" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="orderIndex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Orden</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} data-testid="cycle-form-orderIndex" {...field} />
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
                disabled={createMutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="cycle-form-submit">
                {createMutation.isPending ? "Creando…" : "Crear ciclo"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
