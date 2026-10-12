import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { isApiError, toUserFacingMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  athleteBasicSchema,
  AthleteBasicForm,
  emptyAthleteBasicValues,
  type AthleteBasicFormValues,
} from "@/modules/athletes/athlete-form";
import { useAthlete, useUpdateAthlete } from "@/modules/athletes/athletes-api";

/*
 * Edición parcial (design.md A5): la API no permite cambiar username ni email
 * (se muestran bloqueados con nota) y el PUT solo lleva campos editables.
 */

export function AthleteEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const parsedId = Number(id);
  const athleteId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : 0;

  const athleteQuery = useAthlete(athleteId);
  const updateMutation = useUpdateAthlete(athleteId);

  const form = useForm<AthleteBasicFormValues>({
    resolver: zodResolver(athleteBasicSchema),
    defaultValues: emptyAthleteBasicValues,
  });

  // Prefijar cuando llegue el detalle.
  useEffect(() => {
    const athlete = athleteQuery.data;
    if (athlete) {
      form.reset({
        username: athlete.username,
        email: athlete.email,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        photoUrl: athlete.photoUrl ?? "",
        birthDate: athlete.birthDate ?? "",
      });
    }
  }, [athleteQuery.data, form]);

  const serverError = (() => {
    const error = updateMutation.error;
    if (!error) {
      return null;
    }
    if (isApiError(error) && error.status === 400) {
      return toUserFacingMessage(error);
    }
    return "No se pudo guardar. Inténtalo de nuevo en unos segundos.";
  })();

  if (athleteQuery.isPending) {
    return (
      <div className="grid place-items-center border-line bg-panel rounded-card border border-dashed p-10 text-center" data-testid="athlete-edit-loading">
        <p className="text-dim text-body">Cargando deportista…</p>
      </div>
    );
  }

  if (athleteQuery.isError) {
    return (
      <div className="grid gap-4" data-testid="athlete-edit-error">
        <div
          className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
          role="alert"
        >
          <div>
            <p className="text-strong text-title font-semibold">
              {isApiError(athleteQuery.error) && athleteQuery.error.status === 404
                ? "Deportista no encontrado"
                : "No se pudo cargar la ficha"}
            </p>
            <p className="text-dim mt-1 text-body">No se puede editar este deportista ahora mismo.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/athletes">Volver a la lista</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const athlete = athleteQuery.data;
  if (!athlete) {
    return null;
  }

  const onSubmit = (values: AthleteBasicFormValues) => {
    // PUT parcial: solo campos editables (username/email no se envían).
    updateMutation.mutate(
      {
        firstName: values.firstName,
        lastName: values.lastName,
        ...(values.birthDate === "" ? {} : { birthDate: values.birthDate }),
        ...(values.photoUrl === "" ? {} : { photoUrl: values.photoUrl }),
      },
      {
        onSuccess: () => void navigate(`/athletes/${athlete.id}`),
      },
    );
  };

  return (
    <div className="grid gap-4" data-testid="athlete-edit-page">
      <header className="grid gap-1">
        <h1 className="text-heading text-strong font-semibold">Editar deportista</h1>
        <p className="text-dim text-body">{athlete.fullName}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Datos del deportista</CardTitle>
          <CardDescription>
            El nombre de usuario y el email no se pueden cambiar por la API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AthleteBasicForm
            form={form}
            lockIdentity
            withBirthDate
            pending={updateMutation.isPending}
            submitLabel="Guardar cambios"
            serverError={serverError}
            onSubmit={onSubmit}
            footerExtra={
              <Button asChild type="button" variant="ghost">
                <Link to={`/athletes/${athlete.id}`}>Cancelar</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
