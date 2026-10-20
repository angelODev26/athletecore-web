import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { USERS_PAGE_SIZE, paginateClientSide, useUsers } from "@/modules/users/users-api";
import { EmptyState, ErrorState, LoadingState } from "@/shared/components/states";

/*
 * Lista de usuarios (fase A de `gestion-usuarios`). La ruta `/usuarios` vive bajo
 * RequireRoles(["ADMIN"]) en el router — el back re-valida igual (403 → estado
 * global "sin permisos"): ocultar es UX, no seguridad.
 *
 * C4: `enabled` es un badge INFORMATIVO — no existe endpoint para cambiarlo (sin
 * PUT /users/{id}); `active` NO se muestra (doc 03 §5: siempre true en la
 * práctica). D2: `GET /users` no pagina en el back, así que la paginación es
 * CLIENTE — pulsar Anterior/Siguiente NO llama de nuevo al back.
 */

/** El estado "Activa" usa el rol de status; "Inactiva" queda neutra (no es un error). */
const ENABLED_BADGE_CLASS = "bg-success-subtle text-success border-transparent";

export function UsersPage() {
  const [page, setPage] = useState(0);
  const usersQuery = useUsers();

  const users = usersQuery.data ?? [];
  const totalPages = Math.max(Math.ceil(users.length / USERS_PAGE_SIZE), 1);
  /*
   * Recorte tras un refetch que reduce la lista: si `page` queda fuera de rango
   * (solo alcanzable con datos en vivo manteniendo la página, o reutilizando el
   * patrón en fase B), se renderiza la última válida y se normaliza el estado.
   * El clamp derivado evita un render intermedio vacío; el efecto deja `page`
   * consistente para el siguiente clic.
   */
  const currentPage = Math.min(page, totalPages - 1);
  const pageModel = paginateClientSide(users, currentPage, USERS_PAGE_SIZE);
  const hasPrev = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [page, currentPage]);

  return (
    <div className="grid gap-4" data-testid="users-page">
      <header>
        <h1 className="text-heading text-strong font-semibold">Usuarios</h1>
        <p className="text-dim text-body">Cuentas del staff con acceso a AthleteCore.</p>
      </header>

      {usersQuery.isError ? (
        <div data-testid="users-error">
          <ErrorState
            title="No se pudo cargar la lista de usuarios"
            description="Comprueba tu conexión e inténtalo de nuevo."
          />
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="outline" onClick={() => void usersQuery.refetch()}>
              Reintentar
            </Button>
          </div>
        </div>
      ) : usersQuery.isPending ? (
        <div data-testid="users-loading">
          <LoadingState title="Cargando usuarios" description="Preparando la lista de cuentas…" />
        </div>
      ) : users.length === 0 ? (
        <div data-testid="users-empty">
          <EmptyState
            title="Todavía no hay usuarios"
            description="Cuando exista una cuenta con acceso, aparecerá aquí."
          />
        </div>
      ) : (
        <div className="border-line bg-panel rounded-card border">
          <Table data-testid="users-list">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-dim text-caption">Usuario</TableHead>
                <TableHead className="text-dim text-caption">Nombre</TableHead>
                <TableHead className="text-dim text-caption">Email</TableHead>
                <TableHead className="text-dim text-caption">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageModel.items.map((user) => (
                <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                  <TableCell className="text-body font-medium">{user.username}</TableCell>
                  <TableCell className="text-body">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell className="text-body">{user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={user.enabled ? "default" : "outline"}
                      className={user.enabled ? ENABLED_BADGE_CLASS : undefined}
                      data-testid={`user-enabled-badge-${user.id}`}
                    >
                      {user.enabled ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {users.length > 0 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Paginación de usuarios">
          <p className="text-dim text-caption">
            Página {currentPage + 1} de {totalPages} · {pageModel.totalItems} usuario
            {pageModel.totalItems === 1 ? "" : "s"} en total
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!hasPrev}
              onClick={() => setPage(Math.max(currentPage - 1, 0))}
              data-testid="users-pagination-prev"
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasNext}
              onClick={() => setPage(currentPage + 1)}
              data-testid="users-pagination-next"
            >
              Siguiente
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
