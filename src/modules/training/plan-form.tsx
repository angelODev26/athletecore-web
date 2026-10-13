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
import { Textarea } from "@/components/ui/textarea";
import type { TrainingPlanResponse } from "@/lib/api/types";
import {
  useCreateTrainingPlan,
  useUpdateTrainingPlan,
} from "@/modules/training/training-api";
import { toSubmitErrorMessage } from "@/modules/training/submit-error";

/*
 * Alta/edición de plan anual (solo ADMIN, T8). Dialog con validación local de las
 * reglas del contrato (doc 05 §2): nombre obligatorio (máx 150) y endDate ≥ startDate.
 * La comparación de fechas es por string ISO (T10): `YYYY-MM-DD` ordena léxicamente.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const planFormSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(150, "El nombre no puede superar 150 caracteres"),
    startDate: z.string().regex(ISO_DATE_PATTERN, "Introduce una fecha válida (AAAA-MM-DD)"),
    endDate: z.string().regex(ISO_DATE_PATTERN, "Introduce una fecha válida (AAAA-MM-DD)"),
    description: z.string().trim(),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: "La fecha de fin debe ser posterior o igual a la de inicio",
    path: ["endDate"],
  });

export type PlanFormValues = z.infer<typeof planFormSchema>;

const EMPTY_VALUES: PlanFormValues = { name: "", startDate: "", endDate: "", description: "" };

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Presente en edición; null/undefined en alta. */
  plan?: TrainingPlanResponse | null;
  /** Aviso de que otra acción dejó el plan recién guardado (p. ej. tras crear). */
  onSaved: (plan: TrainingPlanResponse) => void;
}

export function PlanFormDialog({ open, onOpenChange, plan, onSaved }: PlanFormDialogProps) {
  const isEdit = plan !== null && plan !== undefined;
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useCreateTrainingPlan();
  const updateMutation = useUpdateTrainingPlan(plan?.id ?? 0);
  const pending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset(
        isEdit
          ? {
              name: plan.name,
              startDate: plan.startDate,
              endDate: plan.endDate,
              description: plan.description ?? "",
            }
          : EMPTY_VALUES,
      );
    }
  }, [open, isEdit, plan, form]);

  const handleSubmit = form.handleSubmit((values) => {
    setServerError(null);

    const onError = (error: unknown) => {
      setServerError(toSubmitErrorMessage(error, "No se pudo guardar el plan. Inténtalo de nuevo."));
    };

    if (isEdit && plan) {
      // PUT parcial (doc 05 §2): solo los campos modificados.
      const changes: Partial<typeof values> = {};
      if (values.name !== plan.name) changes.name = values.name;
      if (values.startDate !== plan.startDate) changes.startDate = values.startDate;
      if (values.endDate !== plan.endDate) changes.endDate = values.endDate;
      if (values.description !== (plan.description ?? "")) changes.description = values.description;

      updateMutation.mutate(changes, {
        onSuccess: (updated) => {
          onSaved(updated);
          onOpenChange(false);
        },
        onError,
      });
      return;
    }

    createMutation.mutate(
      {
        name: values.name,
        startDate: values.startDate,
        endDate: values.endDate,
        ...(values.description ? { description: values.description } : {}),
      },
      {
        onSuccess: (created) => {
          onSaved(created);
          onOpenChange(false);
        },
        onError,
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="plan-form-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar plan" : "Nuevo plan anual"}</DialogTitle>
          <DialogDescription>
            Define el nombre y el rango de fechas del plan anual.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            {serverError ? (
              <Alert variant="destructive" role="alert" data-testid="plan-form-error">
                <AlertTitle>No se pudo guardar el plan</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" data-testid="plan-form-name" {...field} />
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
                      <Input type="date" data-testid="plan-form-startDate" {...field} />
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
                      <Input type="date" data-testid="plan-form-endDate" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} data-testid="plan-form-description" {...field} />
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
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending} data-testid="plan-form-submit">
                {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear plan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
