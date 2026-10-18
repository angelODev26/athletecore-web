import { NavLink, useLocation } from "react-router-dom";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasAnyRole } from "@/lib/auth/jwt";
import { useSessionRoles } from "@/lib/auth/session-store";

/*
 * C1: sub-navegación de la sección de reportes, presente en TODAS sus páginas.
 *
 * - "Biblioteca" (`/reports`) y "Equipo" (`/reports/equipo`): siempre.
 * - "Programaciones" (`/reports/programaciones`): SOLO ADMIN (el tab se oculta a
 *   COACH/USER, mismo patrón que "Tabla nacional": el GET es abierto pero la
 *   gestión es de ADMIN; la ruta además va bajo `RequireRoles(["ADMIN"])`).
 *
 * El tab activo sale de la RUTA actual (`useLocation`), no de un estado interno:
 * cada trigger navega con `NavLink` (href real → enlace compartible y navegable
 * con teclado) dentro del `TabsTrigger asChild` del registry.
 *
 * Nota de la versión instalada: `TabsTrigger` del registry se estiliza con el
 * variant `data-active:`, pero la primitiva `@radix-ui/react-tabs` de este repo
 * (1.2.0, vía `radix-ui@1.8.0`) solo emite `data-state`; por eso el atributo
 * `data-active` se lo pasa este componente a partir de la ruta activa.
 */

export interface ReportsTab {
  value: string;
  to: string;
  label: string;
  /** `true` para el index de la sección (evita que `/reports` matchee `/reports/equipo`). */
  end?: boolean;
  roles?: readonly string[];
}

const REPORTS_TABS: readonly ReportsTab[] = [
  { value: "library", to: "/reports", label: "Biblioteca", end: true },
  { value: "team", to: "/reports/equipo", label: "Equipo" },
  {
    value: "schedules",
    to: "/reports/programaciones",
    label: "Programaciones",
    roles: ["ADMIN"],
  },
];

/** Valor del tab de la biblioteca: fallback del detalle (`/reports/:reportId`) y similares. */
const DEFAULT_TAB_VALUE = "library";

/**
 * Tab activo para una ruta. Exportado para poder probarlo sin montar el router:
 * las sub-rutas de la sección (`/reports/:reportId`) mantienen activa la Biblioteca.
 */
export function reportsTabValueForPath(
  pathname: string,
  tabs: readonly ReportsTab[] = REPORTS_TABS,
): string {
  const match = tabs.find((tab) =>
    tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`),
  );
  return match?.value ?? DEFAULT_TAB_VALUE;
}

export function ReportsTabs() {
  const location = useLocation();
  const userRoles = useSessionRoles();

  const visibleTabs = REPORTS_TABS.filter((tab) => !tab.roles || hasAnyRole(userRoles, tab.roles));
  const activeValue = reportsTabValueForPath(location.pathname, visibleTabs);

  return (
    <Tabs value={activeValue} data-testid="reports-tabs">
      <TabsList>
        {visibleTabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            asChild
            data-active={activeValue === tab.value ? "true" : undefined}
          >
            <NavLink to={tab.to} end={tab.end}>
              {tab.label}
            </NavLink>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
