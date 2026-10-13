import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isApiError } from "@/lib/api";
import { useHasAnyRole } from "@/lib/auth/session-store";
import type { SessionDetailResponse, SessionStatus } from "@/lib/api/types";
import { AttendanceGrid } from "@/modules/training/attendance-grid";
import {
  SESSION_STATUS_LABELS,
  formatDateEs,
  formatTimeHm,
} from "@/modules/training/format";
import { SessionStatusBadge } from "@/modules/training/session-status-badge";
import { SessionFormDialog } from "@/modules/training/session-form";
import {
  useDeleteSession,
  useSession,
  useUpdateSessionStatus,
} from "@/modules/training/training-api";

/*
 * Detalle de sesión + pase de lista (T6). El cambio de estado usa `PUT .../status`
 * (doc 05 §3); el borrado es solo ADMIN con confirmación (soft delete → 204).
 * La planilla vive en `attendance-grid.tsx`.
 */

const STATUS_VALUES: SessionStatus[] = ["PROGRAMADA", "EJECUTADA", "CANCELADA"];

export function SessionDetailPage() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const navigate = useNavigate();
  const isAdmin = useHasAnyRole(["ADMIN"]);

  // C5: id no numérico → query deshabilitada (sin GET .../NaN); el render muestra "no encontrado".
  const sessionQuery = useSession(id, Number.isFinite(id));
  const statusMutation = useUpdateSessionStatus(id);
  const deleteMutation = useDeleteSession(id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (Number.isNaN(id)) {
    return <SessionNotFoundState />;
  }

  if (sessionQuery.isError) {
    if (isApiError(sessionQuery.error) && sessionQuery.error.status === 404) {
      return <SessionNotFoundState />;
    }
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
        data-testid="session-detail-error"
        role="alert"
      >
        <div>
          <p className="text-strong text-title font-semibold">No se pudo cargar la sesión</p>
          <p className="text-dim mt-1 text-body">Comprueba tu conexión e inténtalo de nuevo.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => void sessionQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const session = sessionQuery.data;

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/training" className="text-primary-text text-caption hover:underline">
            ← Planes
          </Link>
          <h1 className="text-heading text-strong mt-1 font-semibold">
            {sessionQuery.isPending ? "Cargando…" : session ? `Sesión del ${formatDateEs(session.sessionDate)}` : ""}
          </h1>
          {session ? (
            <p className="text-dim text-body">
              {formatTimeHm(session.startTime) ? `${formatTimeHm(session.startTime)} · ` : ""}
              {session.cycleId !== null ? `Ciclo #${session.cycleId}` : "Sin ciclo"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session ? <SessionStatusBadge status={session.status} /> : null}
          {session ? (
            <Select
              value={session.status}
              onValueChange={(value) => {
                if (value !== session.status) {
                  statusMutation.mutate(value as SessionStatus);
                }
              }}
              disabled={statusMutation.isPending}
            >
              <SelectTrigger data-testid="session-status-select" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_VALUES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {SESSION_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {session ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(true)}
              data-testid="session-edit"
            >
              Editar
            </Button>
          ) : null}
          {isAdmin && session ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              data-testid="session-delete"
            >
              Borrar
            </Button>
          ) : null}
        </div>
      </header>

      {session ? (
        <>
          <SessionMetrics session={session} />
          <AttendanceGrid session={session} />
        </>
      ) : null}

      {session ? (
        <SessionFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          cycleId={session.cycleId}
          session={session}
          onSaved={() => setEditOpen(false)}
        />
      ) : null}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent data-testid="session-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              La sesión desaparecerá del microciclo (borrado lógico). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate(undefined, {
                  onSuccess: () => void navigate("/training"),
                });
              }}
            >
              {deleteMutation.isPending ? "Borrando…" : "Borrar sesión"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** C7: recibe la sesión por props — una sola suscripción a `useSession` en la página. */
function SessionMetrics({ session }: { session: SessionDetailResponse }) {
  const metrics: Array<{ label: string; value: string | null }> = [
    { label: "Volumen", value: session.volume === null ? null : String(session.volume) },
    { label: "Intensidad", value: session.intensity === null ? null : `${session.intensity}` },
    { label: "Distancia", value: session.distance === null ? null : String(session.distance) },
  ];

  return (
    <div className="border-line bg-panel rounded-card grid gap-4 border p-4 sm:grid-cols-3" data-testid="session-metrics">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <p className="text-dim text-caption">{metric.label}</p>
          {/* T10: `volume`, `intensity` y `distance` se muestran tal cual, sin cálculo. */}
          <p className="text-title text-strong font-semibold">{metric.value ?? "—"}</p>
        </div>
      ))}
      {session.observations ? (
        <div className="sm:col-span-3">
          <p className="text-dim text-caption">Observaciones</p>
          <p className="text-body">{session.observations}</p>
        </div>
      ) : null}
    </div>
  );
}

function SessionNotFoundState() {
  return (
    <div
      className="border-line bg-panel rounded-card grid place-items-center gap-3 border border-dashed p-10 text-center"
      data-testid="session-not-found"
    >
      <div>
        <p className="text-strong text-title font-semibold">Sesión no encontrada</p>
        <p className="text-dim mt-1 text-body">Puede que se haya borrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/training">Volver a planes</Link>
        </Button>
      </div>
    </div>
  );
}
