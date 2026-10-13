import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TrainingPlanResponse } from "@/lib/api/types";
import { useHasAnyRole } from "@/lib/auth/session-store";
import { formatDateRangeEs } from "@/modules/training/format";
import { PlanFormDialog } from "@/modules/training/plan-form";
import {
  paginateClientSide,
  useDeleteTrainingPlan,
  useTrainingPlans,
} from "@/modules/training/training-api";

/*
 * Lista de planes anuales (T2/D2): `GET /training-plans` no paga en el back (doc 08 §3),
 * así que la página completa llega de una vez y la paginación es CLIENTE con
 * `paginateClientSide` — pulsar Anterior/Siguiente NO llama de nuevo al back.
 * Escrituras de plan solo ADMIN (T8).
 */

const PAGE_SIZE = 10;

export function PlansListPage() {
  const navigate = useNavigate();
  const isAdmin = useHasAnyRole(["ADMIN"]);

  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TrainingPlanResponse | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<TrainingPlanResponse | null>(null);

  const plansQuery = useTrainingPlans();
  const deleteMutation = useDeleteTrainingPlan(deletingPlan?.id ?? 0);

  const allPlans = plansQuery.data ?? [];
  const pageModel = paginateClientSide(allPlans, page, PAGE_SIZE);
  const totalPages = Math.ceil(pageModel.totalItems / PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  const openCreate = () => {
    setEditingPlan(null);
    setFormOpen(true);
  };

  const openEdit = (plan: TrainingPlanResponse) => {
    setEditingPlan(plan);
    setFormOpen(true);
  };

  if (plansQuery.isError) {
    return (
      <div className="grid gap-4">
        <SectionHeader isAdmin={isAdmin} />
        <div
          className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
          data-testid="plans-error"
          role="alert"
        >
          <div>
            <p className="text-strong text-title font-semibold">No se pudo cargar la lista de planes</p>
            <p className="text-dim mt-1 text-body">Comprueba tu conexión e inténtalo de nuevo.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void plansQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <SectionHeader isAdmin={isAdmin} onCreate={openCreate} />

      {plansQuery.isPending ? (
        <div className="border-line bg-panel rounded-card grid gap-3 border p-4" data-testid="plans-loading">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : allPlans.length === 0 ? (
        <div
          className="border-line bg-panel rounded-card grid place-items-center gap-3 border border-dashed p-10 text-center"
          data-testid="plans-empty"
        >
          <div>
            <p className="text-strong text-title font-semibold">Aún no hay planes anuales</p>
            <p className="text-dim mt-1 text-body">
              {isAdmin
                ? "Crea el primer plan para empezar a planificar la temporada."
                : "Cuando el staff cree un plan aparecerá aquí."}
            </p>
            {isAdmin ? (
              <Button type="button" variant="outline" className="mt-4" onClick={openCreate} data-testid="plan-create">
                Crear plan
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="border-line bg-panel rounded-card border">
          <Table data-testid="plans-list">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-dim text-caption">Plan</TableHead>
                <TableHead className="text-dim text-caption">Fechas</TableHead>
                <TableHead className="text-dim text-caption">Estado</TableHead>
                {isAdmin ? <TableHead className="text-dim text-caption w-40">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageModel.items.map((plan) => (
                <TableRow
                  key={plan.id}
                  className="cursor-pointer"
                  data-testid={`plan-row-${plan.id}`}
                  onClick={() => void navigate(`/training/plans/${plan.id}`)}
                >
                  <TableCell className="text-body font-medium">
                    <Link
                      to={`/training/plans/${plan.id}`}
                      className="text-primary-text hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {plan.name}
                    </Link>
                    {plan.description ? (
                      <p className="text-dim text-caption mt-0.5 line-clamp-1">{plan.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-body">
                    {formatDateRangeEs(plan.startDate, plan.endDate)}
                  </TableCell>
                  <TableCell>
                    {plan.active ? (
                      <Badge variant="secondary">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Inactivo</Badge>
                    )}
                  </TableCell>
                  {isAdmin ? (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(plan)}
                          data-testid={`plan-edit-${plan.id}`}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeletingPlan(plan)}
                          data-testid={`plan-delete-${plan.id}`}
                        >
                          Borrar
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {allPlans.length > 0 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Paginación de planes">
          <p className="text-dim text-caption">
            Página {page + 1} de {Math.max(totalPages, 1)} · {pageModel.totalItems} plan
            {pageModel.totalItems === 1 ? "" : "es"} en total
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!hasPrev}
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              data-testid="plans-pagination-prev"
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasNext}
              onClick={() => setPage((current) => current + 1)}
              data-testid="plans-pagination-next"
            >
              Siguiente
            </Button>
          </div>
        </nav>
      ) : null}

      <PlanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        plan={editingPlan}
        onSaved={() => {
          // La invalidación de la lista la hace la mutación; el diálogo se cierra solo.
        }}
      />

      <AlertDialog
        open={deletingPlan !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingPlan(null);
          }
        }}
      >
        <AlertDialogContent data-testid="plan-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar el plan “{deletingPlan?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              El plan desaparecerá de la lista (borrado lógico). Esta acción no se puede deshacer.
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
                  onSuccess: () => {
                    setDeletingPlan(null);
                    setPage(0);
                  },
                });
              }}
            >
              {deleteMutation.isPending ? "Borrando…" : "Borrar plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionHeader({ isAdmin, onCreate }: { isAdmin: boolean; onCreate?: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-heading text-strong font-semibold">Entrenamientos</h1>
        <p className="text-dim text-body">Planes anuales de la temporada.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" data-testid="training-alerts-link">
          <Link to="/training/alerts">Alertas de asistencia</Link>
        </Button>
        {isAdmin && onCreate ? (
          <Button type="button" onClick={onCreate} data-testid="plan-create">
            Crear plan
          </Button>
        ) : null}
      </div>
    </header>
  );
}
