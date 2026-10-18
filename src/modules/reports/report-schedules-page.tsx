import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isApiError, toUserFacingMessage } from "@/lib/api";
import type { ReportScheduleResponse } from "@/lib/api/types";
import { hasAnyRole } from "@/lib/auth/jwt";
import { useSessionRoles } from "@/lib/auth/session-store";
import { cronToHumanText, isScheduleActive, reportTargetLabel, reportTypeLabel } from "@/modules/reports/format";
import { ReportsTabs } from "@/modules/reports/reports-tabs";
import {
  useDeleteReportSchedule,
  useReportSchedules,
  useUpdateReportSchedule,
} from "@/modules/reports/reports-api";
import {
  buildScheduleRequestFromSchedule,
  ScheduleFormDialog,
  toScheduleSubmitErrorMessage,
} from "@/modules/reports/schedule-form";
import { allAthletesKey, fetchAllAthletes } from "@/modules/training/training-api";
import { ErrorState, ForbiddenState } from "@/shared/components/states";
import { formatInstantDateTime } from "@/shared/format/dates";

/*
 * C7: programaciones automáticas de reportes (`/report-schedules`), sección solo ADMIN
 * (la ruta va además bajo `RequireRoles(["ADMIN"])` en el router y su tab se oculta a
 * quien no es ADMIN; aquí se repite el control para que la página nunca muestre gestión
 * aunque se monte por otra vía).
 *
 * - La tabla muestra tipo, objetivo, frecuencia legible (`cronToHumanText`), zona horaria,
 *   estado (badge) y `lastRunAt`/`nextRunAt` TAL CUAL del servidor: nunca se calcula ni se
 *   reformatea una recurrencia. Un cron que no encaja en los presets se muestra CRUDO.
 * - Pausar/Reanudar es un PUT COMPLETO con `active` invertido, sin abrir el formulario
 *   (`buildScheduleRequestFromSchedule` reconstruye todos los campos desde la fila).
 *   `active` es NULLABLE en el DTO (el back ejecuta solo `active === true`): el estado de la
 *   fila se resuelve SIEMPRE con `isScheduleActive`, nunca con truthiness implícita.
 * - Borrar pide confirmación explícita (soft delete, 204).
 * - El NOMBRE del deportista no viene en `ReportScheduleResponse` (solo `athleteId`): se
 *   resuelve contra `fetchAllAthletes` (misma query que la biblioteca, precedente D4).
 *
 * NOTA (`timezone`): el back persiste la zona y la devuelve en el DTO, pero todavía NO la
 * usa para calcular la recurrencia (`ReportScheduleService#computeNextRun` parte de
 * `clock.getZone()`). Es un prerrequisito registrado en la documentación del change
 * `integrar-reportes`: ningún texto de esta pantalla promete que las fechas dependan de la
 * zona horaria de la programación.
 */

const DELETE_FALLBACK_ERROR = "No se pudo borrar la programación. Inténtalo de nuevo.";

/** El estado "Activo" usa el rol de status; "Pausado" queda neutro (no es un error). */
const ACTIVE_BADGE_CLASS = "bg-success-subtle text-success border-transparent";

export function ReportSchedulesPage() {
  const userRoles = useSessionRoles();

  if (!hasAnyRole(userRoles, ["ADMIN"])) {
    return (
      <div className="grid gap-4" data-testid="schedules-forbidden">
        <ReportsTabs />
        <ForbiddenState
          title="Sin acceso"
          description="Solo un administrador puede gestionar las programaciones de reportes."
        />
      </div>
    );
  }

  return <ReportSchedulesManager />;
}

function ReportSchedulesManager() {
  const schedulesQuery = useReportSchedules();
  const athletesQuery = useQuery({ queryKey: allAthletesKey, queryFn: fetchAllAthletes });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReportScheduleResponse | null>(null);

  const athletes = athletesQuery.data ?? [];
  const athleteNames = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete.fullName])),
    [athletes],
  );

  const schedules = schedulesQuery.data ?? [];

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (schedule: ReportScheduleResponse) => {
    setEditing(schedule);
    setFormOpen(true);
  };

  return (
    <div className="grid gap-4" data-testid="schedules-page">
      <ReportsTabs />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-heading text-strong font-semibold">Programaciones</p>
          <p className="text-dim text-body">
            Reportes que se generan solos según una frecuencia, sin escribir cron a mano.
          </p>
        </div>
        <Button type="button" onClick={openCreate} data-testid="schedule-new-button">
          Nueva programación
        </Button>
      </header>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Programaciones registradas</CardTitle>
          <CardDescription>
            Las fechas de última y próxima ejecución las calcula el servidor; la zona horaria
            se guarda con cada programación.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {schedulesQuery.isPending ? (
            <div className="grid gap-3" data-testid="schedules-loading">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : schedulesQuery.isError ? (
            <div data-testid="schedules-error">
              <ErrorState
                title="No se pudieron cargar las programaciones"
                description="Inténtalo de nuevo en unos segundos."
              />
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" onClick={() => void schedulesQuery.refetch()}>
                  Reintentar
                </Button>
              </div>
            </div>
          ) : schedules.length === 0 ? (
            <div
              className="border-line bg-panel rounded-card grid place-items-center border border-dashed p-10 text-center"
              data-testid="schedules-empty"
            >
              <div>
                <p className="text-strong text-title font-semibold">Sin programaciones</p>
                <p className="text-dim mt-1 text-body">
                  Crea una para que el reporte se genere automáticamente.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={openCreate}
                  data-testid="schedule-new-empty"
                >
                  Nueva programación
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-line overflow-hidden rounded-control border">
              <Table data-testid="schedules-list">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Objetivo</TableHead>
                    <TableHead>Frecuencia</TableHead>
                    <TableHead>Zona horaria</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Última ejecución</TableHead>
                    <TableHead>Próxima ejecución</TableHead>
                    <TableHead aria-label="Acciones" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => (
                    <ScheduleRow
                      key={schedule.id}
                      schedule={schedule}
                      athleteNames={athleteNames}
                      onEdit={openEdit}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ScheduleFormDialog open={formOpen} onOpenChange={setFormOpen} schedule={editing} />
    </div>
  );
}

interface ScheduleRowProps {
  schedule: ReportScheduleResponse;
  athleteNames: ReadonlyMap<number, string>;
  onEdit: (schedule: ReportScheduleResponse) => void;
}

/** Cada fila tiene sus propias mutaciones (hooks por fila, sin condicionales). */
function ScheduleRow({ schedule, athleteNames, onEdit }: ScheduleRowProps) {
  const updateSchedule = useUpdateReportSchedule(schedule.id);
  const deleteSchedule = useDeleteReportSchedule(schedule.id);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const busy = updateSchedule.isPending || deleteSchedule.isPending;
  // `active` es nullable en el wire: solo `true` es activa (ver `isScheduleActive`).
  const active = isScheduleActive(schedule);

  const handleToggleActive = () => {
    setActionError(null);
    // PUT COMPLETO con `active` invertido: la fila trae todos los campos del contrato.
    updateSchedule.mutate(buildScheduleRequestFromSchedule(schedule, !active), {
      onError: (error) => setActionError(toScheduleSubmitErrorMessage(error)),
    });
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    // Sin cierre automático: la vista se cierra al confirmar el 204.
    event.preventDefault();
    setActionError(null);
    deleteSchedule.mutate(undefined, {
      onSuccess: () => setDeleteOpen(false),
      onError: (error) => {
        // 404 = ya no existe (soft delete): el listado se refresca y la fila desaparece.
        if (isApiError(error) && error.status === 404) {
          setDeleteOpen(false);
          return;
        }
        setActionError(
          isApiError(error) ? toUserFacingMessage(error) : DELETE_FALLBACK_ERROR,
        );
      },
    });
  };

  return (
    <TableRow data-testid={`schedule-row-${schedule.id}`}>
      <TableCell>
        <Badge variant="outline">{reportTypeLabel(schedule.reportType)}</Badge>
      </TableCell>
      <TableCell className="text-body">{reportTargetLabel(schedule, athleteNames)}</TableCell>
      <TableCell className="text-body">{cronToHumanText(schedule.cronExpression)}</TableCell>
      <TableCell className="text-dim text-body">{schedule.timezone ?? "—"}</TableCell>
      <TableCell>
        <Badge
          variant={active ? "default" : "outline"}
          className={active ? ACTIVE_BADGE_CLASS : undefined}
          data-testid={`schedule-state-${schedule.id}`}
        >
          {active ? "Activo" : "Pausado"}
        </Badge>
      </TableCell>
      <TableCell className="text-dim text-body">
        {schedule.lastRunAt ? formatInstantDateTime(schedule.lastRunAt) : "—"}
      </TableCell>
      <TableCell className="text-dim text-body">
        {schedule.nextRunAt ? formatInstantDateTime(schedule.nextRunAt) : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onEdit(schedule)}
            data-testid={`schedule-edit-${schedule.id}`}
          >
            Editar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={handleToggleActive}
            data-testid={`schedule-toggle-${schedule.id}`}
          >
            {updateSchedule.isPending
              ? active
                ? "Pausando…"
                : "Reanudando…"
              : active
                ? "Pausar"
                : "Reanudar"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
            data-testid={`schedule-delete-${schedule.id}`}
          >
            Borrar
          </Button>
        </div>
        {actionError ? (
          <p
            role="alert"
            className="text-danger-text text-caption mt-2"
            data-testid={`schedule-action-error-${schedule.id}`}
          >
            {actionError}
          </p>
        ) : null}
      </TableCell>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteSchedule.isPending) {
            setDeleteOpen(open);
          }
        }}
      >
        <AlertDialogContent data-testid="schedule-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta programación?</AlertDialogTitle>
            <AlertDialogDescription>
              {reportTargetLabel(schedule, athleteNames)} ·{" "}
              {cronToHumanText(schedule.cronExpression)}. Se elimina la programación (borrado
              lógico) y deja de generar reportes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSchedule.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteSchedule.isPending}
              onClick={handleDelete}
              data-testid={`schedule-delete-confirm-${schedule.id}`}
            >
              {deleteSchedule.isPending ? "Borrando…" : "Borrar programación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableRow>
  );
}
