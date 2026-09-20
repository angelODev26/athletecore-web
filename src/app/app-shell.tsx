import { NavLink, Outlet } from "react-router-dom";

import { decodeJwtPayload, getRolesFromToken, hasAnyRole } from "@/lib/auth/jwt";
import { useSessionStore } from "@/lib/auth/session-store";

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
  { to: "/checkups", label: "Chequeos" },
  { to: "/reports", label: "Reportes" },
];

export function AppShell() {
  const accessToken = useSessionStore((state) => state.tokens?.access ?? null);
  const clearSession = useSessionStore((state) => state.clearSession);
  const userRoles = getRolesFromToken(accessToken);
  const claims = accessToken ? decodeJwtPayload(accessToken) : null;
  const username = typeof claims?.sub === "string" ? claims.sub : null;

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || hasAnyRole(userRoles, item.roles));

  return (
    <div className="bg-paper text-ink flex min-h-screen">
      <aside className="border-line bg-surface flex w-60 shrink-0 flex-col border-r p-4">
        <p className="text-ink text-sm font-semibold">AthleteCore</p>
        <nav className="mt-6 grid gap-1" aria-label="Navegación principal">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm no-underline transition-colors ${
                  isActive ? "bg-accent text-accent-ink" : "text-ink-soft hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-line mt-auto border-t pt-4">
          {username ? <p className="text-ink-soft truncate text-xs">{username}</p> : null}
          <button
            type="button"
            onClick={clearSession}
            className="text-ink-soft hover:text-ink mt-2 cursor-pointer border-0 bg-transparent p-0 text-left text-sm"
            data-testid="logout-button"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
