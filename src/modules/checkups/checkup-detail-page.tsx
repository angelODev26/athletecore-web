import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { isApiError } from "@/lib/api";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasAnyRole } from "@/lib/auth/jwt";
import { useSessionRoles } from "@/lib/auth/session-store";
import type { CheckupTimeResponse } from "@/lib/api/types";
import { ComparisonPanel } from "@/modules/checkups/comparison-panel";
import { categoryLabel, monthNameEs, styleLabel } from "@/modules/checkups/format";
import { useCheckup, useDeleteCheckup } from "@/modules/checkups/checkups-api";
import { TimeFormDialog } from "@/modules/checkups/time-form";

/*
 * C1/C4: detalle del chequeo con tiempos embebidos (GET /checkups/{id}).
 * `timeFormatted` se muestra TAL CUAL — el front nunca formatea; para ordenar se
 * usa `timeSeconds` numérico. Sin PUT de chequeos/tiempos (deuda T5 del back):
 * "corregir" = BORRAR el chequeo completo (con todos sus tiempos) y recrearlo,
 * con confirmación explícita. Tras el DELETE (204) se vuelve a la pestaña.
 */

// Los tiempos se ordenan por `timeSeconds` numérico (nunca por el string formateado).
function sortTimes(times: CheckupTimeResponse[]): CheckupTimeResponse[] {
  return [...times].sort((a, b) => a.timeSeconds - b.timeSeconds);
}

export function CheckupDetailPage() {
  const { checkupId: checkupIdParam } = useParams();
  const navigate = useNavigate();

  const parsedId = Number(checkupIdParam);
  const checkupId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : 0;

  const checkupQuery = useCheckup(checkupId);

  const [timeFormOpen, setTimeFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const userRoles = useSessionRoles();
  const canManage = hasAnyRole(userRoles, ["ADMIN", "COACH"]);

  const checkup = checkupQuery.data;

  // La navegación de vuelta usa el athleteId del chequeo (fuente de verdad del back).
  const deleteCheckup = useDeleteCheckup(checkupId, checkup?.athleteId ?? 0);

  if (checkupQuery.isPending) {
    return (
      <div className="grid gap-4" data-testid="checkup-detail-loading">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (checkupQuery.isError) {
    if (isApiError(checkupQuery.error) && checkupQuery.error.status === 404) {
      return (
        <div
          className="border-line bg-panel rounded-card grid place-items-center gap-3 border p-10 text-center"
          data-testid="checkup-not-found"
        >
          <div>
            <p className="text-strong text-title font-semibold">Chequeo no encontrado</p>
            <p className="text-dim mt-1 text-body">Puede que haya sido eliminado o que el enlace sea incorrecto.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to={checkup ? `/athletes/${checkup.athleteId}/chequeos` : "/athletes"}>
                Volver a los chequeos
              </Link>
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
        data-testid="checkup-detail-error"
        role="alert"
      >
        <div>
          <p className="text-strong text-title font-semibold">No se pudo cargar el chequeo</p>
          <p className="text-dim mt-1 text-body">Inténtalo de nuevo en unos segundos.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void checkupQuery.refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!checkup) {
    return null;
  }

  const times = sortTimes(checkup.times);

  return (
    <div className="grid gap-4" data-testid="checkup-detail-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" className="h-auto justify-start p-0 text-label">
            <Link to={`/athletes/${checkup.athleteId}/chequeos`}>← Volver a los chequeos</Link>
          </Button>
          <p className="text-heading text-strong font-semibold">
            Chequeo de {monthNameEs(checkup.month)} {checkup.year}
          </p>
          <p className="text-dim text-body">
            Categoría {categoryLabel(checkup.category)}
            {checkup.notes ? ` · ${checkup.notes}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <>
              <Button type="button" onClick={() => setTimeFormOpen(true)} data-testid="time-new-button">
                Agregar tiempo
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                data-testid="checkup-delete-button"
              >
                Borrar chequeo
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Tiempos de prueba</CardTitle>
          <CardDescription>
            Formateados por el servidor (mm:ss.fff); ordenados por segundos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <TimesTable times={times} canManage={canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Comparación con la tabla nacional</CardTitle>
          <CardDescription>
            Bajo demanda: compara cada tiempo contra las 3 posiciones de referencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ComparisonPanel checkupId={checkup.id} />
        </CardContent>
      </Card>

      <TimeFormDialog
        open={timeFormOpen}
        onOpenChange={setTimeFormOpen}
        checkup={checkup}
      />

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteCheckup.isPending) {
            setDeleteOpen(open);
          }
        }}
      >
        <AlertDialogContent data-testid="checkup-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar este chequeo?</AlertDialogTitle>
            <AlertDialogDescription>
              No se pueden editar chequeos ni tiempos: borrar este chequeo elimina todos sus
              tiempos. Para corregir un dato, vuelve a crear el chequeo tras borrarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="checkup-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="checkup-delete-action"
              onClick={(event) => {
                // Evitar el cierre automático: la vista se cierra al 204.
                event.preventDefault();
                deleteCheckup.mutate(undefined, {
                  onSuccess: () => {
                    setDeleteOpen(false);
                    void navigate(`/athletes/${checkup.athleteId}/chequeos`);
                  },
                  onError: (error) => {
                    if (isApiError(error) && error.status === 404) {
                      // Ya no existe (borrado en otro lado): consistente (soft delete).
                      setDeleteOpen(false);
                      void navigate(`/athletes/${checkup.athleteId}/chequeos`);
                    }
                  },
                });
              }}
            >
              {deleteCheckup.isPending ? "Borrando…" : "Borrar chequeo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TimesTable({ times, canManage }: { times: CheckupTimeResponse[]; canManage: boolean }) {
  if (times.length === 0) {
    return (
      <p className="text-dim text-body" data-testid="checkup-times-empty">
        {canManage
          ? "Sin tiempos registrados: agrega el primero con “Agregar tiempo”."
          : "Sin tiempos registrados en este chequeo."}
      </p>
    );
  }

  return (
    <div className="border-line overflow-hidden rounded-control border" data-testid="checkup-times-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Estilo</TableHead>
            <TableHead>Distancia</TableHead>
            <TableHead>Tiempo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {times.map((time) => (
            <TableRow key={time.id} data-testid={`checkup-time-row-${time.id}`}>
              <TableCell className="text-body">{styleLabel(time.style)}</TableCell>
              <TableCell className="text-body">{time.distance}m</TableCell>
              {/* `timeFormatted` del servidor tal cual — nunca reprocesarlo (C2). */}
              <TableCell className="text-body">{time.timeFormatted}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
