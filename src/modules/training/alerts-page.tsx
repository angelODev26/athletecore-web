import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { AttendanceAlertResponse } from "@/lib/api/types";
import { useAlertsAckStore, isAlertDismissed } from "@/modules/training/alerts-ack-store";
import { formatDateEs } from "@/modules/training/format";
import {
  paginateClientSide,
  useAttendanceAlerts,
} from "@/modules/training/training-api";

/*
 * Bandeja de alertas de ausencias (T7): `GET /alerts/attendance` sin paginar →
 * paginación client-side (D2). "Marcar como vista" es un dismiss LOCAL con el par
 * `(athleteId, lastAbsenceDate)` — no se llama al acknowledge del back (no persiste
 * nada) y el copy lo aclara honestamente.
 */

const PAGE_SIZE = 10;

export function AlertsPage() {
  const [page, setPage] = useState(0);
  const acked = useAlertsAckStore((state) => state.acked);
  const ackAlert = useAlertsAckStore((state) => state.ackAlert);

  const alertsQuery = useAttendanceAlerts();

  if (alertsQuery.isError) {
    return (
      <div className="grid gap-4">
        <SectionHeader />
        <div
          className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
          data-testid="alerts-error"
          role="alert"
        >
          <div>
            <p className="text-strong text-title font-semibold">No se pudieron cargar las alertas</p>
            <p className="text-dim mt-1 text-body">Comprueba tu conexión e inténtalo de nuevo.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void alertsQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const allAlerts = alertsQuery.data ?? [];
  // Ocultas solo las cuyo par (athleteId, lastAbsenceDate) coincide; si la racha crece
  // (nuevo lastAbsenceDate) la alerta reaparece (T7).
  const visibleAlerts = allAlerts.filter(
    (alert) => !isAlertDismissed(acked, alert.athleteId, alert.lastAbsenceDate),
  );
  const totalPages = Math.ceil(visibleAlerts.length / PAGE_SIZE);
  // C6: tras un dismiss, re-clamp para no quedarse en una página vacía (mínimo 0).
  const effectivePage = Math.min(Math.max(page, 0), Math.max(totalPages - 1, 0));
  const pageModel = paginateClientSide(visibleAlerts, effectivePage, PAGE_SIZE);

  return (
    <div className="grid gap-4">
      <SectionHeader />

      <p className="text-dim text-caption" data-testid="alerts-local-notice">
        “Marcar como vista” oculta la alerta solo en este navegador; puede reaparecer si
        continúan las ausencias.
      </p>

      {alertsQuery.isPending ? (
        <div className="border-line bg-panel rounded-card border p-4" data-testid="alerts-loading">
          <p className="text-dim text-body">Cargando alertas…</p>
        </div>
      ) : allAlerts.length === 0 ? (
        <div
          className="border-line bg-panel rounded-card grid place-items-center gap-3 border border-dashed p-10 text-center"
          data-testid="alerts-empty"
        >
          <div>
            <p className="text-strong text-title font-semibold">No hay alertas activas</p>
            <p className="text-dim mt-1 text-body">
              Cuando un deportista acumule ausencias consecutivas aparecerá aquí.
            </p>
          </div>
        </div>
      ) : visibleAlerts.length === 0 ? (
        <div
          className="border-line bg-panel rounded-card grid place-items-center gap-3 border border-dashed p-10 text-center"
          data-testid="alerts-all-dismissed"
        >
          <div>
            <p className="text-strong text-title font-semibold">Todas las alertas están marcadas como vistas</p>
            <p className="text-dim mt-1 text-body">
              Volverán si la racha de ausencias continúa.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3" data-testid="alerts-list">
          {pageModel.items.map((alert) => (
            <AlertCard
              key={alert.athleteId}
              alert={alert}
              onAck={() => ackAlert(alert.athleteId, alert.lastAbsenceDate)}
            />
          ))}
        </div>
      )}

      {visibleAlerts.length > 0 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Paginación de alertas">
          <p className="text-dim text-caption">
            Página {effectivePage + 1} de {Math.max(totalPages, 1)} · {pageModel.totalItems} alerta
            {pageModel.totalItems === 1 ? "" : "s"} visible
            {pageModel.totalItems === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={effectivePage === 0 || totalPages <= 1}
              onClick={() => setPage(Math.max(effectivePage - 1, 0))}
              data-testid="alerts-pagination-prev"
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={effectivePage >= totalPages - 1}
              onClick={() => setPage(effectivePage + 1)}
              data-testid="alerts-pagination-next"
            >
              Siguiente
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function AlertCard({ alert, onAck }: { alert: AttendanceAlertResponse; onAck: () => void }) {
  return (
    <article
      className="border-line bg-panel rounded-card flex flex-wrap items-center justify-between gap-3 border p-4"
      data-testid={`alert-card-${alert.athleteId}`}
    >
      <div>
        <p className="text-strong text-title font-semibold">{alert.athleteFullName}</p>
        {/* C3: el umbral de racha es configuración del servidor (TRAINING_ABSENCE_THRESHOLD,
            doc 05 §5) — el front muestra el conteo tal cual, sin clasificar (T10). */}
        <p className="text-dim text-body">
          <span className="text-strong font-semibold">{alert.consecutiveAbsenceCount}</span>{" "}
          ausencia{alert.consecutiveAbsenceCount === 1 ? "" : "s"} consecutiva
          {alert.consecutiveAbsenceCount === 1 ? "" : "s"}
        </p>
        <p className="text-dim text-caption">
          Última ausencia: {formatDateEs(alert.lastAbsenceDate)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onAck} data-testid={`alert-ack-${alert.athleteId}`}>
          Marcar como vista
        </Button>
      </div>
    </article>
  );
}

function SectionHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-heading text-strong font-semibold">Alertas de asistencia</h1>
        <p className="text-dim text-body">Deportistas con ausencias consecutivas.</p>
      </div>
      <Button asChild variant="ghost" data-testid="training-plans-link">
        <Link to="/training">Ver planes</Link>
      </Button>
    </header>
  );
}
