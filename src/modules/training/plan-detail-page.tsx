import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import { useHasAnyRole } from "@/lib/auth/session-store";
import type { SessionResponse, TrainingCycleNode } from "@/lib/api/types";
import {
  CYCLE_TYPE_LABELS,
  formatDateEs,
  formatDateRangeEs,
  formatTimeHm,
} from "@/modules/training/format";
import { SessionStatusBadge } from "@/modules/training/session-status-badge";
import { CycleFormDialog } from "@/modules/training/cycle-form";
import { SessionFormDialog } from "@/modules/training/session-form";
import {
  useCycleSessions,
  useTrainingPlan,
} from "@/modules/training/training-api";

/*
 * Detalle del plan (T3): la jerarquía llega montada y ordenada por el back
 * (`GET /training-plans/{id}`) — el front la renderiza `cycles[].children[]` TAL CUAL,
 * sin re-ensamblar ni reordenar. Sesiones por microciclo vía el endpoint plano de
 * ciclos (`GET /training-cycles/{id}/sessions`), que el design permite usar aquí.
 */

export function PlanDetailPage() {
  const { planId } = useParams();
  const id = Number(planId);
  const navigate = useNavigate();
  const isAdmin = useHasAnyRole(["ADMIN"]);

  // C5: id no numérico → query deshabilitada (sin GET .../NaN); el render muestra "no encontrado".
  const planQuery = useTrainingPlan(id, Number.isFinite(id));

  const [cycleFormOpen, setCycleFormOpen] = useState(false);
  const [cycleParent, setCycleParent] = useState<TrainingCycleNode | null>(null);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [sessionCycleId, setSessionCycleId] = useState<number | null>(null);

  if (Number.isNaN(id)) {
    return <NotFoundState />;
  }

  if (planQuery.isError) {
    if (isApiError(planQuery.error) && planQuery.error.status === 404) {
      return <NotFoundState />;
    }
    return (
      <div className="grid gap-4">
        <div
          className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
          data-testid="plan-detail-error"
          role="alert"
        >
          <div>
            <p className="text-strong text-title font-semibold">No se pudo cargar el plan</p>
            <p className="text-dim mt-1 text-body">Comprueba tu conexión e inténtalo de nuevo.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void planQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const plan = planQuery.data;

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/training" className="text-primary-text text-caption hover:underline">
            ← Planes
          </Link>
          <h1 className="text-heading text-strong mt-1 font-semibold">
            {planQuery.isPending ? "Cargando…" : plan?.name}
          </h1>
          {plan ? (
            <>
              <p className="text-dim text-body">{formatDateRangeEs(plan.startDate, plan.endDate)}</p>
              {plan.description ? <p className="text-dim mt-1 text-body">{plan.description}</p> : null}
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" data-testid="training-alerts-link">
            <Link to="/training/alerts">Alertas de asistencia</Link>
          </Button>
          {isAdmin ? (
            <Button
              type="button"
              onClick={() => {
                setCycleParent(null);
                setCycleFormOpen(true);
              }}
              data-testid="cycle-create-root"
            >
              Añadir mesociclo
            </Button>
          ) : null}
        </div>
      </header>

      {planQuery.isPending ? (
        <div className="border-line bg-panel rounded-card border p-4" data-testid="plan-detail-loading">
          <p className="text-dim text-body">Cargando árbol del plan…</p>
        </div>
      ) : plan && plan.cycles.length === 0 ? (
        <div
          className="border-line bg-panel rounded-card grid place-items-center gap-3 border border-dashed p-10 text-center"
          data-testid="plan-tree-empty"
        >
          <div>
            <p className="text-strong text-title font-semibold">El plan no tiene ciclos todavía</p>
            <p className="text-dim mt-1 text-body">
              {isAdmin
                ? "Añade el primer mesociclo para empezar a planificar."
                : "Cuando el staff añada ciclos se verán aquí."}
            </p>
          </div>
        </div>
      ) : plan ? (
        <div className="grid gap-3" data-testid="plan-tree">
          {plan.cycles.map((cycle) => (
            <CycleNodeView
              key={cycle.id}
              node={cycle}
              isAdmin={isAdmin}
              onAddMicrocycle={(parent) => {
                setCycleParent(parent);
                setCycleFormOpen(true);
              }}
              onAddSession={(cycleId) => {
                setSessionCycleId(cycleId);
                setSessionFormOpen(true);
              }}
            />
          ))}
        </div>
      ) : null}

      {plan ? (
        <CycleFormDialog
          open={cycleFormOpen}
          onOpenChange={setCycleFormOpen}
          plan={plan}
          parentCycle={cycleParent}
          onSaved={() => setCycleFormOpen(false)}
        />
      ) : null}

      <SessionFormDialog
        open={sessionFormOpen}
        onOpenChange={setSessionFormOpen}
        cycleId={sessionCycleId}
        onSaved={(session) => {
          setSessionFormOpen(false);
          void navigate(`/training/sessions/${session.id}`);
        }}
      />
    </div>
  );
}

function CycleNodeView({
  node,
  isAdmin,
  onAddMicrocycle,
  onAddSession,
}: {
  node: TrainingCycleNode;
  isAdmin: boolean;
  onAddMicrocycle: (parent: TrainingCycleNode) => void;
  onAddSession: (cycleId: number) => void;
}) {
  const isMeso = node.type === "MESOCICLO";

  return (
    <section
      className={`border-line bg-panel rounded-card border p-4 ${isMeso ? "" : "border-l-4 border-l-primary/40"}`}
      data-testid={`cycle-node-${node.id}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isMeso ? "secondary" : "outline"}>{CYCLE_TYPE_LABELS[node.type]}</Badge>
          <p className="text-strong text-title font-semibold">{node.name}</p>
          <span className="text-dim text-caption">
            {formatDateRangeEs(node.startDate, node.endDate)} · orden {node.orderIndex}
          </span>
        </div>
        <div className="flex gap-2">
          {isAdmin && isMeso ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddMicrocycle(node)}
              data-testid={`cycle-create-${node.id}`}
            >
              Añadir microciclo
            </Button>
          ) : null}
          {!isMeso ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddSession(node.id)}
              data-testid={`session-create-${node.id}`}
            >
              Añadir sesión
            </Button>
          ) : null}
        </div>
      </header>

      {!isMeso ? <MicrocycleSessions cycleId={node.id} /> : null}

      {node.children.map((child) => (
        <CycleNodeView
          key={child.id}
          node={child}
          isAdmin={isAdmin}
          onAddMicrocycle={onAddMicrocycle}
          onAddSession={onAddSession}
        />
      ))}
    </section>
  );
}

function MicrocycleSessions({ cycleId }: { cycleId: number }) {
  const sessionsQuery = useCycleSessions(cycleId);

  if (sessionsQuery.isError) {
    return (
      <p className="text-dim text-caption mt-3" role="alert" data-testid={`cycle-sessions-error-${cycleId}`}>
        No se pudieron cargar las sesiones de este microciclo.
      </p>
    );
  }

  const sessions = sessionsQuery.data ?? [];

  if (sessions.length === 0) {
    return (
      <p className="text-dim text-caption mt-3" data-testid={`cycle-sessions-empty-${cycleId}`}>
        Sin sesiones en este microciclo.
      </p>
    );
  }

  return (
    <ul className="mt-3 grid gap-2">
      {sessions.map((session) => (
        <li key={session.id}>
          <SessionRow session={session} />
        </li>
      ))}
    </ul>
  );
}

function SessionRow({ session }: { session: SessionResponse }) {
  const navigate = useNavigate();
  const time = formatTimeHm(session.startTime);

  return (
    <button
      type="button"
      className="border-divider bg-raised hover:border-primary-text flex w-full items-center justify-between gap-3 rounded-control border px-3 py-2 text-left transition-colors"
      data-testid={`session-row-${session.id}`}
      onClick={() => void navigate(`/training/sessions/${session.id}`)}
    >
      <span className="text-body font-medium">
        {formatDateEs(session.sessionDate)}
        {time ? <span className="text-dim"> · {time}</span> : null}
      </span>
      <SessionStatusBadge status={session.status} />
    </button>
  );
}

function NotFoundState() {
  return (
    <div
      className="border-line bg-panel rounded-card grid place-items-center gap-3 border border-dashed p-10 text-center"
      data-testid="plan-not-found"
    >
      <div>
        <p className="text-strong text-title font-semibold">Plan no encontrado</p>
        <p className="text-dim mt-1 text-body">Puede que se haya borrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/training">Volver a planes</Link>
        </Button>
      </div>
    </div>
  );
}
