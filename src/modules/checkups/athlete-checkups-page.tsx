import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

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
import type { CheckupResponse } from "@/lib/api/types";
import { useSessionRoles } from "@/lib/auth/session-store";
import { CheckupFormDialog } from "@/modules/checkups/checkup-form";
import { useAthleteCheckups } from "@/modules/checkups/checkups-api";
import { categoryLabel, MONTH_NAMES_ES, monthNameEs } from "@/modules/checkups/format";
import { ProjectionsPanel } from "@/modules/checkups/projections-panel";

/*
 * C1: pestaña de chequeos de la ficha del atleta (cualquier autenticado). Lista
 * con filtro año/mes SERVER-SIDE (query params condicionales), alta en dialog
 * para ADMIN/COACH (C3) y panel de proyección de medallería (C6).
 */

export function AthleteCheckupsPage() {
  const { id } = useParams();

  // Un id inválido consulta /athletes/0 → 404 del back → estado "no encontrado".
  const parsedId = Number(id);
  const athleteId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : 0;

  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const userRoles = useSessionRoles();
  const canManage = hasAnyRole(userRoles, ["ADMIN", "COACH"]);

  const filters = useMemo(() => {
    const year = yearFilter.trim() === "" ? undefined : Number(yearFilter);
    const month = monthFilter === "" ? undefined : Number(monthFilter);
    return {
      ...(year !== undefined && Number.isInteger(year) ? { year } : {}),
      ...(month !== undefined ? { month } : {}),
    };
  }, [yearFilter, monthFilter]);

  const checkupsQuery = useAthleteCheckups(athleteId, filters);

  // C5: la pre-validación de duplicado usa la lista SIN filtrar. Se consulta aparte
  // (sin params) y solo mientras el dialog está abierto — la lista principal puede
  // llevar un filtro año/mes que ocultaría el período duplicado (falso negativo).
  const unfilteredQuery = useAthleteCheckups(athleteId, {}, formOpen);

  const checkups = checkupsQuery.data ?? [];

  // Años disponibles en la lista cargada + el actual, ordenados desc (presentación).
  const yearOptions = useMemo(() => {
    const years = new Set<number>(checkups.map((checkup) => checkup.year));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [checkups]);

  return (
    <div className="grid gap-4" data-testid="athlete-checkups-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" className="h-auto justify-start p-0 text-label">
            <Link to={`/athletes/${athleteId}`}>← Volver a la ficha</Link>
          </Button>
          <p className="text-heading text-strong font-semibold">Chequeos</p>
          <p className="text-dim text-body">Registro mensual de chequeos y tiempos de prueba.</p>
        </div>
        {canManage ? (
          <Button type="button" onClick={() => setFormOpen(true)} data-testid="checkup-new-button">
            Nuevo chequeo
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3" data-testid="checkups-filters">
        <FilterSelect
          label="Año"
          testid="checkups-filter-year"
          value={yearFilter}
          onChange={setYearFilter}
          placeholder="Todos los años"
          options={yearOptions.map((year) => ({ value: String(year), label: String(year) }))}
        />
        <FilterSelect
          label="Mes"
          testid="checkups-filter-month"
          value={monthFilter}
          onChange={setMonthFilter}
          placeholder="Todos los meses"
          options={MONTH_NAMES_ES.map((name, index) => ({ value: String(index + 1), label: name }))}
        />
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Chequeos registrados</CardTitle>
          <CardDescription>Período, categoría y notas de cada chequeo.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <CheckupsTable
            query={checkupsQuery}
            canManage={canManage}
            onNew={() => setFormOpen(true)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Proyección de medallería</CardTitle>
          <CardDescription>
            Clasificación calculada por el servidor contra el bronce de la tabla nacional.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ProjectionsPanel athleteId={athleteId} />
        </CardContent>
      </Card>

      <CheckupFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        athleteId={athleteId}
        // Alta: pre-validación de duplicado contra la lista SIN filtro (C5).
        existingCheckups={formOpen ? (unfilteredQuery.data ?? []) : []}
      />
    </div>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  testid,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: FilterOption[];
}) {
  return (
    <label className="grid gap-1">
      <span className="text-dim text-caption">{label}</span>
      <select
        className="border-field-line bg-panel text-strong rounded-control h-9 border px-3 text-body"
        data-testid={testid}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckupsTable({
  query,
  canManage,
  onNew,
}: {
  query: ReturnType<typeof useAthleteCheckups>;
  canManage: boolean;
  onNew: () => void;
}) {
  if (query.isPending) {
    return (
      <div className="grid gap-2" data-testid="checkups-loading">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-6 text-center"
        data-testid="checkups-error"
        role="alert"
      >
        <div>
          <p className="text-strong text-body font-medium">No se pudo cargar la lista de chequeos</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void query.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const checkups = query.data ?? [];

  if (checkups.length === 0) {
    return (
      <div
        className="border-line bg-panel rounded-card grid place-items-center border border-dashed p-8 text-center"
        data-testid="checkups-empty"
      >
        <div>
          <p className="text-strong text-body font-medium">Sin chequeos</p>
          <p className="text-dim mt-1 text-body">
            {canManage
              ? "Registra el primer chequeo mensual de este deportista."
              : "Todavía no hay chequeos registrados."}
          </p>
          {canManage ? (
            <Button type="button" variant="outline" className="mt-3" data-testid="checkup-new-empty" onClick={onNew}>
              Nuevo chequeo
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="border-line overflow-hidden rounded-control border" data-testid="checkups-list">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Notas</TableHead>
            <TableHead aria-label="Acciones" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {checkups.map((checkup: CheckupResponse) => (
            <TableRow key={checkup.id} data-testid={`checkup-row-${checkup.id}`}>
              <TableCell className="text-body">
                <Link
                  to={`/athletes/${checkup.athleteId}/chequeos/${checkup.id}`}
                  className="text-primary-text underline-offset-4 hover:underline"
                >
                  {monthNameEs(checkup.month)} {checkup.year}
                </Link>
              </TableCell>
              <TableCell className="text-body">{categoryLabel(checkup.category)}</TableCell>
              <TableCell className="text-dim text-body">{checkup.notes ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" data-testid={`checkup-open-${checkup.id}`}>
                  <Link to={`/athletes/${checkup.athleteId}/chequeos/${checkup.id}`}>Ver detalle</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
