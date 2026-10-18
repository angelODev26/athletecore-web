import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { isApiError, toUserFacingMessage } from "@/lib/api";
import type { AthleteProfileResponse, SportResponse } from "@/lib/api/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AthleteAvatar } from "@/modules/athletes/athlete-avatar";
import {
  useAssignAthleteSports,
  useAthlete,
  useAthleteProfile,
  useAthleteSportIds,
  useDeleteAthlete,
  useSportsCatalog,
  useUpsertAthleteProfile,
} from "@/modules/athletes/athletes-api";
import {
  athleteProfileSchema,
  AthleteProfileForm,
  emptyAthleteProfileValues,
  type AthleteProfileFormValues,
} from "@/modules/athletes/athlete-profile-form";
import { AthleteSportsForm } from "@/modules/athletes/athlete-sports-form";

/*
 * Ficha del deportista (design.md A3/A4/A6/A7): compone 4 llamadas tolerando el
 * 404 de perfil ("sin perfil") y de atleta ("no encontrado"). BMI, categoría e
 * isComplete se muestran TAL CUAL del servidor; nunca se calculan en el front.
 */

const NOT_AVAILABLE = "no disponible";

export function AthleteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const justCreated = Boolean((location.state as { recienCreado?: boolean } | null)?.recienCreado);

  // Un id inválido consulta /athletes/0 → 404 del back → estado "no encontrado".
  const parsedId = Number(id);
  const athleteId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : 0;

  const athleteQuery = useAthlete(athleteId);
  const profileQuery = useAthleteProfile(athleteId);
  const sportIdsQuery = useAthleteSportIds(athleteId);
  const catalogQuery = useSportsCatalog();

  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [sportsFormOpen, setSportsFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const profileForm = useForm<AthleteProfileFormValues>({
    resolver: zodResolver(athleteProfileSchema),
    defaultValues: emptyAthleteProfileValues,
  });
  const upsertProfile = useUpsertAthleteProfile(athleteId);
  const assignSports = useAssignAthleteSports(athleteId);
  const deleteAthlete = useDeleteAthlete(athleteId);

  const sportById = useMemo(
    () => new Map((catalogQuery.data ?? []).map((sport) => [sport.id, sport])),
    [catalogQuery.data],
  );

  const athlete = athleteQuery.data;

  const openProfileForm = () => {
    const profile = profileQuery.data;
    profileForm.reset({
      weightKgs: profile ? String(profile.weightKgs) : "",
      heightCm: profile ? String(profile.heightCm) : "",
      armSpanCm: profile && profile.armSpanCm !== null ? String(profile.armSpanCm) : "",
      notes: profile?.notes ?? "",
    });
    setProfileFormOpen(true);
  };

  const onProfileSubmit = (values: AthleteProfileFormValues) => {
    upsertProfile.mutate(
      {
        weightKgs: Number(values.weightKgs),
        heightCm: Number(values.heightCm),
        ...(values.armSpanCm === "" ? {} : { armSpanCm: Number(values.armSpanCm) }),
        notes: values.notes,
      },
      {
        onSuccess: () => setProfileFormOpen(false),
      },
    );
  };

  const profileServerError = mapServerError(upsertProfile.error, "No se pudo guardar el perfil.");
  const sportsServerError = mapServerError(assignSports.error, "No se pudo guardar la asignación de deportes.");
  const deleteServerError = mapServerError(deleteAthlete.error, "No se pudo eliminar el deportista.");

  const secondaryQueriesFailed =
    profileQuery.isError || sportIdsQuery.isError || catalogQuery.isError;

  if (athleteQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (athleteQuery.isError) {
    if (isApiError(athleteQuery.error) && athleteQuery.error.status === 404) {
      return (
        <div
          className="border-line bg-panel rounded-card grid place-items-center gap-3 border p-10 text-center"
          data-testid="athlete-not-found"
        >
          <div>
            <p className="text-strong text-title font-semibold">Deportista no encontrado</p>
            <p className="text-dim mt-1 text-body">Puede que haya sido eliminado o que el enlace sea incorrecto.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/athletes">Volver a la lista</Link>
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
        data-testid="athlete-error"
        role="alert"
      >
        <div>
          <p className="text-strong text-title font-semibold">No se pudo cargar la ficha</p>
          <p className="text-dim mt-1 text-body">Inténtalo de nuevo en unos segundos.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void athleteQuery.refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!athlete) {
    return null;
  }

  return (
    <div className="grid gap-4">
      {justCreated ? (
        <Alert data-testid="athlete-created-notice">
          <AlertTitle>Deportista creado</AlertTitle>
          <AlertDescription>
            Puedes completar su fecha de nacimiento, perfil antropométrico y deportes desde esta ficha.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <AthleteAvatar
                firstName={athlete.firstName}
                lastName={athlete.lastName}
                photoUrl={athlete.photoUrl}
                className="size-16"
              />
              <div>
                <CardTitle className="text-heading">{athlete.fullName}</CardTitle>
                <CardDescription className="text-body">
                  {athlete.username} · {athlete.email}
                </CardDescription>
                <p className="text-dim mt-1 text-caption">
                  Fecha de nacimiento: {athlete.birthDate ?? "no registrada"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" data-testid="athlete-checkups-link">
                <Link to={`/athletes/${athlete.id}/chequeos`}>Chequeos</Link>
              </Button>
              <Button asChild variant="outline" data-testid="athlete-report-link">
                <Link to={`/athletes/${athlete.id}/report`}>Reporte</Link>
              </Button>
              <Button asChild variant="outline" data-testid="athlete-edit-link">
                <Link to={`/athletes/${athlete.id}/editar`}>Editar</Link>
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                data-testid="athlete-delete-button"
              >
                Eliminar deportista
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {secondaryQueriesFailed ? (
        <div
          className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
          data-testid="athlete-sections-error"
          role="alert"
        >
          <div>
            <p className="text-strong text-title font-semibold">No se pudieron cargar el perfil y los deportes</p>
            <p className="text-dim mt-1 text-body">Inténtalo de nuevo en unos segundos.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                void profileQuery.refetch();
                void sportIdsQuery.refetch();
                void catalogQuery.refetch();
              }}
            >
              Reintentar
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card data-testid="athlete-profile-card">
            <CardHeader>
              <CardTitle>Perfil antropométrico</CardTitle>
              <CardDescription>Datos y valores calculados por el servidor.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {profileQuery.isPending ? (
                <div className="grid gap-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              ) : profileQuery.data === null ? (
                <div className="grid gap-3" data-testid="athlete-profile-empty">
                  <p className="text-body">Sin perfil registrado</p>
                  <Button type="button" variant="outline" className="w-fit" onClick={openProfileForm}>
                    Crear perfil
                  </Button>
                </div>
              ) : profileFormOpen ? (
                <AthleteProfileForm
                  form={profileForm}
                  pending={upsertProfile.isPending}
                  serverError={profileServerError}
                  onSubmit={onProfileSubmit}
                  onCancel={() => setProfileFormOpen(false)}
                />
              ) : (
                <ProfileReadView
                  profile={profileQuery.data}
                  onEdit={openProfileForm}
                  isSaving={upsertProfile.isPending}
                />
              )}
            </CardContent>
          </Card>

          <Card data-testid="athlete-sports-card">
            <CardHeader>
              <CardTitle>Deportes</CardTitle>
              <CardDescription>Deportes asignados al deportista.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {sportIdsQuery.isPending || catalogQuery.isPending ? (
                <div className="grid gap-2">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              ) : sportsFormOpen ? (
                <AthleteSportsForm
                  catalog={catalogQuery.data ?? []}
                  assignedIds={sportIdsQuery.data ?? []}
                  pending={assignSports.isPending}
                  serverError={sportsServerError}
                  onSave={(sportIds) => assignSports.mutate({ sportIds }, { onSuccess: () => setSportsFormOpen(false) })}
                  onCancel={() => setSportsFormOpen(false)}
                />
              ) : (
                <SportsReadView
                  assignedIds={sportIdsQuery.data ?? []}
                  sportById={sportById}
                  onEdit={() => setSportsFormOpen(true)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteAthlete.isPending) {
            setDeleteOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar deportista?</AlertDialogTitle>
            <AlertDialogDescription>
              {athlete.fullName} se dará de baja (borrado lógico) y dejará de aparecer en la lista. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteServerError ? (
            <Alert variant="destructive" role="alert" data-testid="athlete-delete-error">
              <AlertTitle>No se pudo eliminar</AlertTitle>
              <AlertDescription>{deleteServerError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="athlete-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="athlete-delete-confirm"
              onClick={(event) => {
                // Evitar el cierre automático: la ficha se cierra al 204.
                event.preventDefault();
                deleteAthlete.mutate(undefined, {
                  onSuccess: () => {
                    setDeleteOpen(false);
                    void navigate("/athletes");
                  },
                  onError: (error) => {
                    if (isApiError(error) && error.status === 404) {
                      // Ya no existe (borrado en otro lado): volver a la lista.
                      setDeleteOpen(false);
                      void navigate("/athletes");
                    }
                  },
                });
              }}
            >
              {deleteAthlete.isPending ? "Eliminando…" : "Eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ProfileReadViewProps {
  profile: AthleteProfileResponse | null;
  onEdit: () => void;
  isSaving: boolean;
}

function ProfileReadView({ profile, onEdit, isSaving }: ProfileReadViewProps) {
  if (!profile) {
    return null;
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Badge variant={profile.isComplete ? "default" : "outline"} data-testid="athlete-profile-completeness">
          {profile.isComplete ? "Perfil completo" : "Perfil incompleto"}
        </Badge>
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <ReadItem label="Peso" value={`${profile.weightKgs} kg`} testId="athlete-profile-weight-value" />
        <ReadItem label="Talla" value={`${profile.heightCm} cm`} testId="athlete-profile-height-value" />
        <ReadItem
          label="Envergadura"
          value={profile.armSpanCm !== null ? `${profile.armSpanCm} cm` : NOT_AVAILABLE}
          testId="athlete-profile-armspan-value"
        />
        <ReadItem
          label="IMC (servidor)"
          value={profile.bmi !== null ? String(profile.bmi) : NOT_AVAILABLE}
          testId="athlete-profile-bmi-value"
        />
        <ReadItem
          label="Categoría IMC"
          value={profile.bmiCategory ?? NOT_AVAILABLE}
          testId="athlete-profile-bmi-category-value"
        />
        <ReadItem label="Notas" value={profile.notes ?? "—"} testId="athlete-profile-notes-value" />
      </dl>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={onEdit}
        disabled={isSaving}
        data-testid="athlete-profile-edit"
      >
        Editar perfil
      </Button>
    </div>
  );
}

interface SportsReadViewProps {
  assignedIds: number[];
  sportById: Map<number, SportResponse>;
  onEdit: () => void;
}

function SportsReadView({ assignedIds, sportById, onEdit }: SportsReadViewProps) {
  return (
    <div className="grid gap-3">
      {assignedIds.length === 0 ? (
        <p className="text-body" data-testid="athlete-sports-none">
          Sin deportes asignados.
        </p>
      ) : (
        <ul className="grid gap-2" data-testid="athlete-sports-list">
          {assignedIds.map((sportId) => {
            const sport = sportById.get(sportId);
            return (
              <li key={sportId} className="border-line rounded-control border p-2">
                <p className="text-body font-medium">{sport ? sport.name : `Deporte ${sportId}`}</p>
                {sport && sport.disciplineIds.length > 0 ? (
                  <p className="text-dim text-caption">
                    Disciplinas (IDs): {sport.disciplineIds.join(", ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" variant="outline" className="w-fit" onClick={onEdit} data-testid="athlete-sports-edit">
        Editar deportes
      </Button>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-4" data-testid="athlete-detail-loading">
      <div className="border-line bg-panel rounded-card flex items-center gap-4 border p-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

function ReadItem({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div>
      <dt className="text-dim text-caption">{label}</dt>
      <dd className="text-body" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function mapServerError(error: unknown, genericMessage: string): string | null {
  if (!error) {
    return null;
  }
  if (isApiError(error) && error.status === 400) {
    return toUserFacingMessage(error);
  }
  return genericMessage;
}
