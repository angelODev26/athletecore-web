// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/app/app-shell";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";

// C10: se prueba el camino REAL — apiFetch (http.ts) recibe un 403 del "servidor"
// (fetch global stubbeado), invoca el handler registrado por AppShell y este pinta
// ForbiddenState sin cerrar sesión. No se mockea @/lib/api.

function makeErrorResponse(status: number, message: string) {
  const body = JSON.stringify({ status, error: "Forbidden", message });
  if (typeof Response === "function") {
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  }
  // Fallback mínimo con la superficie que usa http.ts (ok/status/statusText/json).
  return {
    ok: false,
    status,
    statusText: "Forbidden",
    headers: new Headers(),
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

/** Página hija que dispara una petición con 403 al montar (como una query real). */
function ForbiddenTriggerPage() {
  return (
    <div data-testid="trigger-page">
      <p>Contenido de la sección</p>
      <Trigger />
    </div>
  );
}

function Trigger() {
  void apiFetch("/seccion-protegida").catch(() => {
    // El error de la query se maneja en la página; aquí solo interesa el handler global.
  });
  return null;
}

function renderShell() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<ForbiddenTriggerPage />} />
          {/* Destino de un ítem real de la barra lateral (Deportistas → /athletes). */}
          <Route path="athletes" element={<div data-testid="other-page">Otra sección</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell — wiring de setForbiddenHandler (C10)", () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({
      tokens: { access: "test-token" },
      expiresAt: Date.now() + 3_600_000,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeErrorResponse(403, "Acceso denegado")),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("un 403 de servidor muestra la vista 'sin permisos' SIN cerrar sesión", async () => {
    renderShell();

    expect(await screen.findByTestId("forbidden-state")).toBeInTheDocument();
    // El contenido de la página con 403 queda reemplazado por la vista global.
    expect(screen.queryByTestId("trigger-page")).not.toBeInTheDocument();
    // La sesión sigue activa (no se confunde con expiración → no redirige a login).
    expect(useSessionStore.getState().tokens?.access).toBe("test-token");
  });

  it("el flag se reinicia al navegar a otra ruta (vuelve el contenido normal)", async () => {
    renderShell();

    const user = userEvent.setup();
    await screen.findByTestId("forbidden-state");

    // Navegar con un ítem real del sidebar (Deportistas → /athletes).
    await user.click(screen.getByRole("link", { name: "Deportistas" }));

    await waitFor(() => expect(screen.getByTestId("other-page")).toBeInTheDocument());
    expect(screen.queryByTestId("forbidden-state")).not.toBeInTheDocument();
    expect(useSessionStore.getState().tokens?.access).toBe("test-token");
  });
});
