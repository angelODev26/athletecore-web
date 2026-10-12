import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { getDuplicateField, isApiError, toUserFacingMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCreateAthlete, useUpdateAthlete, useUpsertAthleteProfile } from "@/modules/athletes/athletes-api";
import {
  athleteBasicSchema,
  athleteBirthDateSchema,
  AthleteBasicForm,
  emptyAthleteBasicValues,
  type AthleteBasicFormValues,
} from "@/modules/athletes/athlete-form";
import {
  athleteProfileSchema,
  AthleteProfileForm,
  emptyAthleteProfileValues,
  type AthleteProfileFormValues,
} from "@/modules/athletes/athlete-profile-form";
import { z } from "zod";

/*
 * Alta guiada en 3 pasos (design.md A2, deuda T6): el DTO de creación no admite
 * birthDate, así que POST → PUT (fecha) → POST profile (upsert opcional). Tras el
 * paso 1 el deportista YA EXISTE: abandonar el wizard no deshace nada, navega a
 * la ficha con un aviso.
 */

type WizardStep = 1 | 2 | 3;

const birthDateStepSchema = z.object({ birthDate: athleteBirthDateSchema.min(1, "La fecha de nacimiento es obligatoria") });
type BirthDateStepValues = z.infer<typeof birthDateStepSchema>;

const STEP_TITLES: Record<WizardStep, string> = {
  1: "Datos básicos",
  2: "Fecha de nacimiento",
  3: "Perfil antropométrico",
};

export function AthleteCreatePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>(1);
  const [athleteId, setAthleteId] = useState<number | null>(null);

  return (
    <div className="grid gap-4" data-testid="athlete-create-page">
      <header className="grid gap-1">
        <h1 className="text-heading text-strong font-semibold">Nuevo deportista</h1>
        <p className="text-dim text-body">Paso {step} de 3 · {STEP_TITLES[step]}</p>
        <ol className="mt-1 flex gap-1.5" aria-label="Progreso del alta">
          {([1, 2, 3] as const).map((value) => (
            <li
              key={value}
              aria-current={value === step ? "step" : undefined}
              className={`h-1.5 w-10 rounded-pill ${value <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </ol>
      </header>

      {step === 1 ? <BasicStep onCreated={(id) => { setAthleteId(id); setStep(2); }} /> : null}
      {step === 2 && athleteId !== null ? (
        <BirthDateStep
          athleteId={athleteId}
          onDone={() => setStep(3)}
          onAbandon={() => void navigate(`/athletes/${athleteId}`, { state: { recienCreado: true } })}
        />
      ) : null}
      {step === 3 && athleteId !== null ? (
        <ProfileStep
          athleteId={athleteId}
          onDone={() => void navigate(`/athletes/${athleteId}`)}
          onAbandon={() => void navigate(`/athletes/${athleteId}`, { state: { recienCreado: true } })}
        />
      ) : null}
    </div>
  );
}

function BasicStep({ onCreated }: { onCreated: (id: number) => void }) {
  const createMutation = useCreateAthlete();
  const [stepServerError, setStepServerError] = useState<string | null>(null);

  const form = useForm<AthleteBasicFormValues>({
    resolver: zodResolver(athleteBasicSchema),
    defaultValues: emptyAthleteBasicValues,
  });

  const onSubmit = (values: AthleteBasicFormValues) => {
    setStepServerError(null);
    createMutation.mutate(
      {
        username: values.username,
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        ...(values.photoUrl === "" ? {} : { photoUrl: values.photoUrl }),
      },
      {
        onSuccess: (athlete) => onCreated(athlete.id),
        onError: (error) => {
          if (!isApiError(error)) {
            setStepServerError("No se pudo crear el deportista. Inténtalo de nuevo en unos segundos.");
            return;
          }
          if (error.status === 409) {
            const field = getDuplicateField(error);
            if (field === "username") {
              form.setError("username", { type: "server", message: "Ya existe un deportista con ese nombre de usuario" });
              return;
            }
            if (field === "email") {
              form.setError("email", { type: "server", message: "Ya existe un deportista con ese email" });
              return;
            }
            setStepServerError("Los datos entran en conflicto con un deportista existente.");
            return;
          }
          if (error.status === 400) {
            setStepServerError(toUserFacingMessage(error));
            return;
          }
          setStepServerError("No se pudo crear el deportista. Inténtalo de nuevo en unos segundos.");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos básicos</CardTitle>
        <CardDescription>Identidad del deportista. Tras este paso el alta ya queda registrada.</CardDescription>
      </CardHeader>
      <CardContent>
        <AthleteBasicForm
          form={form}
          pending={createMutation.isPending}
          submitLabel="Crear deportista y continuar"
          serverError={stepServerError}
          onSubmit={onSubmit}
          footerExtra={
            <Button asChild type="button" variant="ghost">
              <Link to="/athletes">Cancelar</Link>
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

function BirthDateStep({
  athleteId,
  onDone,
  onAbandon,
}: {
  athleteId: number;
  onDone: () => void;
  onAbandon: () => void;
}) {
  const updateMutation = useUpdateAthlete(athleteId);
  const [stepServerError, setStepServerError] = useState<string | null>(null);

  const form = useForm<BirthDateStepValues>({
    resolver: zodResolver(birthDateStepSchema),
    defaultValues: { birthDate: "" },
  });

  const onSubmit = (values: BirthDateStepValues) => {
    setStepServerError(null);
    updateMutation.mutate(
      { birthDate: values.birthDate },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (isApiError(error) && error.status === 400) {
            setStepServerError(toUserFacingMessage(error));
            return;
          }
          setStepServerError("No se pudo guardar la fecha. Inténtalo de nuevo en unos segundos.");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fecha de nacimiento</CardTitle>
        <CardDescription>
          El alta ya está hecha; la fecha se guarda en una segunda llamada (deuda del contrato, T6). Si la omites
          puedes añadirla después desde la ficha.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            {stepServerError ? (
              <div className="border-line bg-panel rounded-card border p-3 text-body" role="alert" data-testid="athlete-step2-error">
                {stepServerError}
              </div>
            ) : null}
            <FormField
              control={form.control}
              name="birthDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de nacimiento</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="athlete-birthdate-input" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={updateMutation.isPending} data-testid="athlete-step2-continue">
                {updateMutation.isPending ? "Guardando…" : "Guardar y continuar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={onAbandon}
                data-testid="athlete-skip-step"
              >
                Omitir y terminar
              </Button>
            </div>
            <p className="text-dim text-caption">
              El deportista ya existe: puedes completar estos datos más tarde desde su ficha.
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ProfileStep({
  athleteId,
  onDone,
  onAbandon,
}: {
  athleteId: number;
  onDone: () => void;
  onAbandon: () => void;
}) {
  const upsertMutation = useUpsertAthleteProfile(athleteId);
  const [stepServerError, setStepServerError] = useState<string | null>(null);

  const form = useForm<AthleteProfileFormValues>({
    resolver: zodResolver(athleteProfileSchema),
    defaultValues: emptyAthleteProfileValues,
  });

  const onSubmit = (values: AthleteProfileFormValues) => {
    setStepServerError(null);
    upsertMutation.mutate(
      {
        weightKgs: Number(values.weightKgs),
        heightCm: Number(values.heightCm),
        ...(values.armSpanCm === "" ? {} : { armSpanCm: Number(values.armSpanCm) }),
        notes: values.notes,
      },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (isApiError(error) && error.status === 400) {
            setStepServerError(toUserFacingMessage(error));
            return;
          }
          setStepServerError("No se pudo guardar el perfil. Inténtalo de nuevo en unos segundos.");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil antropométrico</CardTitle>
        <CardDescription>
          Paso opcional: peso, talla y envergadura. El IMC lo calcula el servidor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AthleteProfileForm
          form={form}
          pending={upsertMutation.isPending}
          serverError={stepServerError}
          submitLabel="Guardar perfil y terminar"
          submitTestId="athlete-finish-step"
          onSubmit={onSubmit}
          onSkip={onAbandon}
        />
        <p className="text-dim mt-3 text-caption">
          El deportista ya existe: puedes completar su perfil más tarde desde su ficha.
        </p>
      </CardContent>
    </Card>
  );
}
