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
import type { SessionResponse } from "@/lib/api/types";
import { SESSION_STATUS_LABELS } from "@/modules/training/format";
import {
  useCreateSession,
  useUpdateSession,
} from "@/modules/training/training-api";
import { toSubmitErrorMessage } from "@/modules/training/submit-error";

/*
 * Alta/edición de sesiones (T4): la creación SOLO existe anidada en un ciclo
 * (`POST /training-cycles/{cycleId}/sessions`); no hay sesiones sueltas en UI porque
 * el back no tiene listado global — una sesión suelta sería inalcanzable (deuda
 * registrada en el design). Enums con valores exactos del servidor y etiquetas ES
 * solo en presentación (T10).
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^$|^\d{2}:\d{2}(:\d{2})?$/;

/** `HH:mm` del input time → `HH:mm:ss` del contrato (doc 05 §3). */
export function toContractTime(value: string): string {
  if (value === "") {
    return "";
  }
  return value.length === 5 ? `${value}:00` : value;
}

/** Valida un número opcional por campo ("" = ausente), con rangos del contrato doc 05 §3. */
function optionalNumber(
  values: SessionFormRawValues,
  ctx: z.RefinementCtx,
  field: "volume" | "intensity" | "distance",
  label: string,
  min: number,
  max: number | null,
  integer: boolean,
): void {
  const raw = values[field].trim();
  if (raw === "") {
    return;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    ctx.addIssue({ code: "custom", path: [field], message: `${label} debe ser un número` });
    return;
  }
  if (integer && !Number.isInteger(parsed)) {
    ctx.addIssue({ code: "custom", path: [field], message: `${label} debe ser un número entero` });
    return;
  }
  if (parsed < min) {
    ctx.addIssue({ code: "custom", path: [field], message: `${label} debe ser al menos ${min}` });
    return;
  }
  if (max !== null && parsed > max) {
    ctx.addIssue({ code: "custom", path: [field], message: `${label} no puede superar ${max}` });
  }
}

interface SessionFormRawValues {
  volume: string;
  intensity: string;
  distance: string;
}

export const sessionFormSchema = z.object({
  sessionDate: z.string().regex(ISO_DATE_PATTERN, "La fecha de sesión es obligatoria (AAAA-MM-DD)"),
  startTime: z.string().regex(TIME_PATTERN, "Introduce una hora válida (HH:mm)"),
  status: z.enum(["PROGRAMADA", "EJECUTADA", "CANCELADA"]),
  volume: z.string(),
  intensity: z.string(),
  distance: z.string(),
  observations: z.string().trim(),
}).superRefine((values, ctx) => {
  optionalNumber(values, ctx, "volume", "El volumen", 0, 100000, true);
  optionalNumber(values, ctx, "intensity", "La intensidad", 0, 100, true);
  optionalNumber(values, ctx, "distance", "La distancia", 0, null, false);
});

export type SessionFormValues = z.infer<typeof sessionFormSchema>;

interface SessionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ciclo contenedor (alta anidada, obligatorio en creación — T4). */
  cycleId: number | null;
  /** Presente en edición (PUT parcial contra /training-sessions/{id}). */
  session?: SessionResponse | null;
  onSaved: (session: SessionResponse) => void;
}

const EMPTY_VALUES: SessionFormValues = {
  sessionDate: "",
  startTime: "",
  status: "PROGRAMADA",
  volume: "",
  intensity: "",
  distance: "",
  observations: "",
};

function toFormValues(session: SessionResponse | null | undefined): SessionFormValues {
  if (!session) {
    return EMPTY_VALUES;
  }
  return {
    sessionDate: session.sessionDate,
    startTime: session.startTime ? session.startTime.slice(0, 5) : "",
    status: session.status,
    volume: session.volume === null ? "" : String(session.volume),
    intensity: session.intensity === null ? "" : String(session.intensity),
    distance: session.distance === null ? "" : String(session.distance),
    observations: session.observations ?? "",
  };
}

export function SessionFormDialog({ open, onOpenChange, cycleId, session, onSaved }: SessionFormDialogProps) {
  const isEdit = session !== null && session !== undefined;
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useCreateSession(cycleId ?? 0);
  const updateMutation = useUpdateSession(session?.id ?? 0);
  const pending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: toFormValues(session),
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset(toFormValues(session));
    }
  }, [open, session, form]);

  const handleSubmit = form.handleSubmit((values) => {
    setServerError(null);

    const parsedVolume = values.volume.trim() === "" ? undefined : Number(values.volume);
    const parsedIntensity = values.intensity.trim() === "" ? undefined : Number(values.intensity);
    const parsedDistance = values.distance.trim() === "" ? undefined : Number(values.distance);
    const contractTime = values.startTime === "" ? undefined : toContractTime(values.startTime);

    const onError = (error: unknown) => {
      setServerError(toSubmitErrorMessage(error, "No se pudo guardar la sesión. Inténtalo de nuevo."));
    };

    if (isEdit && session) {
      // C1: el back aplica "null = omitir" por campo (TrainingSessionService.updateSession,
      // `if (request.x() != null)`) — NO distingue campo ausente de campo a null, así que
      // con el back actual es imposible limpiar un opcional ya guardado. Vaciar un campo
      // con valor previo es un error de campo, no un cambio silenciosamente descartado.
      const NOT_CLEARABLE = "Una vez guardado no se puede dejar vacío; solo puedes sustituirlo";
      let blocked = false;
      if (session.startTime !== null && values.startTime === "") {
        form.setError("startTime", { message: NOT_CLEARABLE });
        blocked = true;
      }
      if (session.volume !== null && values.volume.trim() === "") {
        form.setError("volume", { message: NOT_CLEARABLE });
        blocked = true;
      }
      if (session.intensity !== null && values.intensity.trim() === "") {
        form.setError("intensity", { message: NOT_CLEARABLE });
        blocked = true;
      }
      if (session.distance !== null && values.distance.trim() === "") {
        form.setError("distance", { message: NOT_CLEARABLE });
        blocked = true;
      }
      if (session.observations !== null && values.observations === "") {
        form.setError("observations", { message: NOT_CLEARABLE });
        blocked = true;
      }
      if (blocked) {
        return;
      }

      // PUT parcial (doc 05 §3): solo campos modificados.
      const changes: Record<string, unknown> = {};
      if (values.sessionDate !== session.sessionDate) changes.sessionDate = values.sessionDate;
      if (toContractTime(values.startTime) !== (session.startTime ?? "")) {
        changes.startTime = contractTime;
      }
      if (values.status !== session.status) changes.status = values.status;
      if (parsedVolume !== undefined && parsedVolume !== session.volume) changes.volume = parsedVolume;
      if (parsedIntensity !== undefined && parsedIntensity !== session.intensity) changes.intensity = parsedIntensity;
      if (parsedDistance !== undefined && parsedDistance !== session.distance) changes.distance = parsedDistance;
      if (values.observations !== (session.observations ?? "")) changes.observations = values.observations;

      updateMutation.mutate(changes, {
        onSuccess: (updated) => {
          onSaved(updated);
          onOpenChange(false);
        },
        onError,
      });
      return;
    }

    if (cycleId === null) {
      // No debería ocurrir en UI (T4), pero nunca enviar una sesión suelta por error.
      setServerError("Las sesiones se crean dentro de un microciclo.");
      return;
    }

    createMutation.mutate(
      {
        cycleId,
        sessionDate: values.sessionDate,
        ...(contractTime !== undefined ? { startTime: contractTime } : {}),
        status: values.status,
        ...(parsedVolume !== undefined ? { volume: parsedVolume } : {}),
        ...(parsedIntensity !== undefined ? { intensity: parsedIntensity } : {}),
        ...(parsedDistance !== undefined ? { distance: parsedDistance } : {}),
        ...(values.observations ? { observations: values.observations } : {}),
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
      <DialogContent data-testid="session-form-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar sesión" : "Nueva sesión"}</DialogTitle>
          <DialogDescription>
            La fecha de sesión es obligatoria; el resto de campos son opcionales.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            {serverError ? (
              <Alert variant="destructive" role="alert" data-testid="session-form-error">
                <AlertTitle>No se pudo guardar la sesión</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sessionDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha *</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="session-form-date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora de inicio</FormLabel>
                    <FormControl>
                      <Input type="time" data-testid="session-form-startTime" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="session-form-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.keys(SESSION_STATUS_LABELS) as Array<keyof typeof SESSION_STATUS_LABELS>).map(
                        (status) => (
                          <SelectItem key={status} value={status}>
                            {SESSION_STATUS_LABELS[status]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="volume"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Volumen</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} data-testid="session-form-volume" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="intensity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intensidad (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} data-testid="session-form-intensity" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="distance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distancia</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="any" data-testid="session-form-distance" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="observations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea rows={3} data-testid="session-form-observations" {...field} />
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
              <Button type="submit" disabled={pending} data-testid="session-form-submit">
                {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear sesión"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
