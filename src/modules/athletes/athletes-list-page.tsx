import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { isApiError } from "@/lib/api";
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
import { AthleteAvatar } from "@/modules/athletes/athlete-avatar";
import { useAthletesPage } from "@/modules/athletes/athletes-api";

/*
 * Lista de deportistas (design.md A1): el back pagina de verdad (doc 04 §2), así
 * que la página/tamaño son estado local y cada navegación dispara un GET nuevo.
 * PROHIBIDO traer la colección completa y paginar en memoria.
 */

const PAGE_SIZE = 10;

export function AthletesListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const athletesQuery = useAthletesPage(page, PAGE_SIZE);

  const pageModel = athletesQuery.data;
  const totalItems = pageModel?.totalItems ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;
  const isRefreshing = athletesQuery.isPlaceholderData;

  if (athletesQuery.isError) {
    return (
      <div className="grid gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-heading text-strong font-semibold">Deportistas</h1>
        </header>
        <div
          className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
          data-testid="athletes-error"
          role="alert"
        >
          <div>
            <p className="text-strong text-title font-semibold">No se pudo cargar la lista</p>
            <p className="text-dim mt-1 text-body">
              {isApiError(athletesQuery.error)
                ? "El servidor respondió con un error. Inténtalo de nuevo."
                : "Comprueba tu conexión e inténtalo de nuevo."}
            </p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => void athletesQuery.refetch()}>
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-heading text-strong font-semibold">Deportistas</h1>
          <p className="text-dim text-body">
            {athletesQuery.isPending
              ? "Cargando…"
              : `${totalItems} deportista${totalItems === 1 ? "" : "s"} en total`}
          </p>
        </div>
        <Button asChild data-testid="athlete-create-link">
          <Link to="/athletes/nuevo">Crear deportista</Link>
        </Button>
      </header>

      {athletesQuery.isPending ? (
        <div className="border-line bg-panel rounded-card grid gap-3 border p-4" data-testid="athletes-loading">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : pageModel && pageModel.items.length === 0 ? (
        <div
          className="border-line bg-panel rounded-card grid place-items-center gap-3 border border-dashed p-10 text-center"
          data-testid="athletes-empty"
        >
          <div>
            <p className="text-strong text-title font-semibold">Aún no hay deportistas</p>
            <p className="text-dim mt-1 text-body">Da de alta tu primer deportista para empezar.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/athletes/nuevo">Crear deportista</Link>
            </Button>
          </div>
        </div>
      ) : pageModel ? (
        <div
          className={`border-line bg-panel rounded-card border transition-opacity ${isRefreshing ? "opacity-60" : ""}`}
        >
          <Table data-testid="athletes-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-dim text-caption w-14">Foto</TableHead>
                <TableHead className="text-dim text-caption">Usuario</TableHead>
                <TableHead className="text-dim text-caption">Nombre</TableHead>
                <TableHead className="text-dim text-caption">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageModel.items.map((athlete) => (
                <TableRow
                  key={athlete.id}
                  className="cursor-pointer"
                  data-testid="athletes-row"
                  onClick={() => void navigate(`/athletes/${athlete.id}`)}
                >
                  <TableCell>
                    <AthleteAvatar
                      firstName={athlete.firstName}
                      lastName={athlete.lastName}
                      photoUrl={athlete.photoUrl}
                      className="size-8"
                    />
                  </TableCell>
                  <TableCell className="text-body font-medium">
                    <Link
                      to={`/athletes/${athlete.id}`}
                      className="text-primary-text hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {athlete.username}
                    </Link>
                  </TableCell>
                  <TableCell className="text-body">{athlete.fullName}</TableCell>
                  <TableCell className="text-body">{athlete.email}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {pageModel && pageModel.items.length > 0 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Paginación de deportistas">
          <p className="text-dim text-caption">
            Página {page + 1} de {Math.max(totalPages, 1)}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!hasPrev || isRefreshing}
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              data-testid="athletes-pagination-prev"
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasNext || isRefreshing}
              onClick={() => setPage((current) => current + 1)}
              data-testid="athletes-pagination-next"
            >
              Siguiente
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
