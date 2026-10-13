import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { AttendanceStatus, SessionDetailResponse } from "@/lib/api/types";
import { ATTENDANCE_STATUS_LABELS } from "@/modules/training/format";
import {
  allAthletesKey,
  fetchAllAthletes,
  useUpsertAttendance,
} from "@/modules/training/training-api";
import { toSubmitErrorMessage } from "@/modules/training/submit-error";

/*
 * Planilla de pase de lista (T6): combina la asistencia embebida en el detalle de la
 * sesión con el listado COMPLETO de deportistas (`fetchAllAthletes` agota el único
 * listado paginado del back). Los atletas sin registro aparecen como "sin marcar".
 * Cada marca envía `POST .../attendance` (upsert: re-marcar corrige sin duplicar).
 * Sesión CANCELADA → pase bloqueado con aviso y controles deshabilitados.
 */

const ATTENDANCE_OPTIONS: AttendanceStatus[] = ["PRESENTE", "AUSENTE", "JUSTIFICADO"];

interface AttendanceGridProps {
  session: SessionDetailResponse;
}

export function AttendanceGrid({ session }: AttendanceGridProps) {
  const cancelled = session.status === "CANCELADA";
  const [overrides, setOverrides] = useState<Map<number, AttendanceStatus>>(new Map());
  const [actionError, setActionError] = useState<string | null>(null);

  const athletesQuery = useQuery({
    queryKey: allAthletesKey,
    queryFn: fetchAllAthletes,
  });
  const upsert = useUpsertAttendance(session.id);

  if (cancelled) {
    return (
      <div className="grid gap-3">
        <Alert data-testid="attendance-cancelled" role="alert">
          <AlertTitle>Sesión cancelada</AlertTitle>
          <AlertDescription>
            La sesión está cancelada; no admite asistencia.
          </AlertDescription>
        </Alert>
        <AttendanceTable
          athletes={athletesQuery.data ?? []}
          loading={athletesQuery.isPending}
          error={athletesQuery.isError}
          onRetry={() => void athletesQuery.refetch()}
          session={session}
          overrides={overrides}
          disabled
        />
      </div>
    );
  }

  const mark = (athleteId: number, status: AttendanceStatus) => {
    setActionError(null);
    // Optimista solo en el estado local de la fila; la verdad se re-sincroniza con
    // la invalidación del detalle (T6).
    setOverrides((current) => new Map(current).set(athleteId, status));
    upsert.mutate(
      { athleteId, status },
      {
        onSuccess: () => {
          setOverrides((current) => {
            const next = new Map(current);
            next.delete(athleteId);
            return next;
          });
        },
        onError: (error) => {
          setOverrides((current) => {
            const next = new Map(current);
            next.delete(athleteId);
            return next;
          });
          setActionError(toSubmitErrorMessage(error, "No se pudo registrar la asistencia. Inténtalo de nuevo."));
        },
      },
    );
  };

  return (
    <div className="grid gap-3">
      {actionError ? (
        <Alert variant="destructive" role="alert" data-testid="attendance-error">
          <AlertTitle>No se pudo registrar la asistencia</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      <AttendanceTable
        athletes={athletesQuery.data ?? []}
        loading={athletesQuery.isPending}
        error={athletesQuery.isError}
        onRetry={() => void athletesQuery.refetch()}
        session={session}
        overrides={overrides}
        onMark={mark}
      />
    </div>
  );
}

interface AttendanceTableProps {
  athletes: Array<{ id: number; fullName: string }>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  session: SessionDetailResponse;
  overrides: Map<number, AttendanceStatus>;
  disabled?: boolean;
  onMark?: (athleteId: number, status: AttendanceStatus) => void;
}

function AttendanceTable({
  athletes,
  loading,
  error,
  onRetry,
  session,
  overrides,
  disabled = false,
  onMark,
}: AttendanceTableProps) {
  if (error) {
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-8 text-center"
        data-testid="attendance-athletes-error"
        role="alert"
      >
        <div>
          <p className="text-strong text-title font-semibold">No se pudo cargar la lista de deportistas</p>
          <Button type="button" variant="outline" className="mt-3" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="border-line bg-panel rounded-card grid gap-3 border p-4" data-testid="attendance-loading">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="border-line bg-panel rounded-card border" data-testid="attendance-grid">
      <ul className="divide-divider divide-y">
        {athletes.map((athlete) => {
          const record = session.attendance.find((entry) => entry.athleteId === athlete.id);
          const status = overrides.get(athlete.id) ?? record?.status ?? null;

          return (
            <li
              key={athlete.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              data-testid={`attendance-row-${athlete.id}`}
            >
              <div className="min-w-40">
                <p className="text-body font-medium">{athlete.fullName}</p>
                {status === null ? (
                  <Badge variant="outline" data-testid={`attendance-unmarked-${athlete.id}`}>
                    Sin marcar
                  </Badge>
                ) : (
                  <p className="text-dim text-caption">{ATTENDANCE_STATUS_LABELS[status]}</p>
                )}
              </div>
              <div className="flex gap-2" data-testid={`attendance-mark-${athlete.id}`}>
                {ATTENDANCE_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={status === option ? "default" : "outline"}
                    disabled={disabled}
                    onClick={() => onMark?.(athlete.id, option)}
                    aria-pressed={status === option}
                    data-testid={`attendance-${option}-${athlete.id}`}
                  >
                    {ATTENDANCE_STATUS_LABELS[option]}
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {athletes.length === 0 ? (
        <p className="text-dim text-caption p-4" data-testid="attendance-athletes-empty">
          No hay deportistas dados de alta.
        </p>
      ) : null}
    </div>
  );
}
