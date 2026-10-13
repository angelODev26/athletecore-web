import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { setForbiddenHandler } from "@/lib/api/http";
import { getUsernameFromToken, hasAnyRole } from "@/lib/auth/jwt";
import { useSessionRoles, useSessionStore } from "@/lib/auth/session-store";
import { ForbiddenState } from "@/shared/components/states";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  roles?: readonly string[];
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/athletes", label: "Deportistas" },
  { to: "/training", label: "Entrenamientos", roles: ["ADMIN", "COACH"] },
  { to: "/tabla-nacional", label: "Tabla nacional", roles: ["ADMIN"] },
  { to: "/reports", label: "Reportes" },
];

export function AppShell() {
  const accessToken = useSessionStore((state) => state.tokens?.access ?? null);
  const clearSession = useSessionStore((state) => state.clearSession);
  const userRoles = useSessionRoles();
  const username = useMemo(() => getUsernameFromToken(accessToken), [accessToken]);
  const location = useLocation();

  // C10: un 403 real del servidor (rol insuficiente) muestra la vista "sin permisos"
  // SIN cerrar sesión — no confundir con expiración (401 → login, lo hace http.ts).
  // Se desregistra al desmontar y el flag se reinicia al cambiar de ruta.
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    setForbiddenHandler(() => setForbidden(true));
    return () => setForbiddenHandler(null);
  }, []);

  useEffect(() => {
    setForbidden(false);
  }, [location.pathname]);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || hasAnyRole(userRoles, item.roles));

  return (
    <div className="bg-bg text-strong flex min-h-screen flex-col md:flex-row">
      <aside className="border-line bg-drawer flex shrink-0 flex-col border-b p-4 md:w-60 md:border-r md:border-b-0">
        <p className="text-strong text-title font-semibold">AthleteCore</p>
        <nav className="mt-4 grid gap-1 md:mt-6" aria-label="Navegación principal">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-control px-3 py-2 text-label font-medium no-underline transition-colors ${
                  isActive ? "bg-primary text-on-primary" : "text-dim hover:bg-panel hover:text-strong"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-divider mt-auto border-t pt-4">
          {username ? <p className="text-dim truncate text-caption">{username}</p> : null}
          <Button
            type="button"
            variant="ghost"
            className="text-dim hover:text-strong mt-1 h-auto justify-start p-0 text-label font-normal"
            onClick={clearSession}
            data-testid="logout-button"
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {forbidden ? <ForbiddenState /> : <Outlet />}
      </main>
    </div>
  );
}
