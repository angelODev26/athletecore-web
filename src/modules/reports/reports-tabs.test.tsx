// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useSessionStore } from "@/lib/auth/session-store";

import { ReportsTabs, reportsTabValueForPath } from "./reports-tabs";

/*
 * Fase 4 de `integrar-reportes`: sub-navegación de la sección de reportes (C1).
 * Biblioteca y Equipo siempre; Programaciones SOLO ADMIN. El tab activo sale de la
 * ruta actual, no de un estado interno.
 */

/** JWT mínimo con roles en el claim (formato del back: `roles: ["ROLE_ADMIN", …]`). */
function tokenWithRoles(roles: string[]): string {
  const payload = {
    sub: "staff",
    roles: roles.map((role) => `ROLE_${role}`),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encoded = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  return `.${encoded}.`;
}

function signInAs(roles: string[]) {
  useSessionStore.setState({
    tokens: { access: tokenWithRoles(roles) },
    expiresAt: Date.now() + 3_600_000,
  });
}

function renderTabs(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ReportsTabs />
    </MemoryRouter>,
  );
}

describe("ReportsTabs (C1)", () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  afterEach(cleanup);

  it("ADMIN ve los 3 tabs con la Biblioteca activa en /reports", () => {
    signInAs(["ADMIN"]);

    renderTabs("/reports");

    const tabs = screen.getByTestId("reports-tabs");
    expect(within(tabs).getAllByRole("tab")).toHaveLength(3);
    expect(within(tabs).getByRole("tab", { name: "Programaciones" })).toHaveAttribute(
      "href",
      "/reports/programaciones",
    );
    expect(within(tabs).getByRole("tab", { name: "Biblioteca" })).toHaveAttribute("aria-selected", "true");
    expect(within(tabs).getByRole("tab", { name: "Biblioteca" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("COACH ve Biblioteca y Equipo (sin Programaciones) y Equipo activo en su ruta", () => {
    signInAs(["COACH"]);

    renderTabs("/reports/equipo");

    const tabs = screen.getByTestId("reports-tabs");
    expect(within(tabs).getAllByRole("tab")).toHaveLength(2);
    expect(within(tabs).queryByRole("tab", { name: "Programaciones" })).not.toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: "Equipo" })).toHaveAttribute("aria-selected", "true");
    expect(within(tabs).getByRole("tab", { name: "Biblioteca" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("USER por URL directa a programaciones no ve ese tab y mantiene la sesión en Biblioteca", () => {
    signInAs(["USER"]);

    renderTabs("/reports/programaciones");

    const tabs = screen.getByTestId("reports-tabs");
    expect(within(tabs).queryByRole("tab", { name: "Programaciones" })).not.toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: "Biblioteca" })).toHaveAttribute("aria-selected", "true");
  });

  it("reportsTabValueForPath: index, sub-ruta de equipo, detalle y programaciones", () => {
    expect(reportsTabValueForPath("/reports")).toBe("library");
    expect(reportsTabValueForPath("/reports/equipo")).toBe("team");
    expect(reportsTabValueForPath("/reports/programaciones")).toBe("schedules");
    // El detalle de un reporte vive en la biblioteca.
    expect(reportsTabValueForPath("/reports/12")).toBe("library");
  });
});
