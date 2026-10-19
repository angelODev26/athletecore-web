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

/*
 * Navegación por rol (integrar-checkups): el placeholder "Chequeos" desaparece del
 * nav (los chequeos viven en la ficha del atleta) y "Tabla nacional" solo es
 * visible para ADMIN (C1/C3).
 */
describe("AppShell — navegación del módulo de chequeos", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  function renderNav() {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<div data-testid="home-page">Inicio</div>} />
            <Route path="tabla-nacional" element={<div data-testid="national-page">Tabla</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  function navLinks() {
    return Array.from(document.querySelectorAll("nav a")).map((link) => link.textContent);
  }

  it("el nav ya no contiene la sección placeholder 'Chequeos'", () => {
    const payload = { sub: "admin", roles: ["ROLE_ADMIN"], exp: Math.floor(Date.now() / 1000) + 3600 };
    useSessionStore.setState({
      tokens: { access: `.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.` },
      expiresAt: Date.now() + 3_600_000,
    });

    renderNav();

    expect(navLinks()).not.toContain("Chequeos");
    expect(navLinks()).toContain("Deportistas");
  });

  it("ADMIN ve 'Tabla nacional' y navega a /tabla-nacional", async () => {
    const payload = { sub: "admin", roles: ["ROLE_ADMIN"], exp: Math.floor(Date.now() / 1000) + 3600 };
    useSessionStore.setState({
      tokens: { access: `.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.` },
      expiresAt: Date.now() + 3_600_000,
    });

    renderNav();

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Tabla nacional" }));

    await waitFor(() => expect(screen.getByTestId("national-page")).toBeInTheDocument());
  });

  it("COACH y USER no ven 'Tabla nacional' en el nav", () => {
    const payload = { sub: "coach", roles: ["ROLE_COACH"], exp: Math.floor(Date.now() / 1000) + 3600 };
    useSessionStore.setState({
      tokens: { access: `.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.` },
      expiresAt: Date.now() + 3_600_000,
    });

    renderNav();

    expect(navLinks()).not.toContain("Tabla nacional");

    cleanup();

    const userPayload = { sub: "user", roles: ["ROLE_USER"], exp: Math.floor(Date.now() / 1000) + 3600 };
    useSessionStore.setState({
      tokens: { access: `.${btoa(JSON.stringify(userPayload)).replace(/=+$/, "")}.` },
      expiresAt: Date.now() + 3_600_000,
    });

    renderNav();

    expect(navLinks()).not.toContain("Tabla nacional");
  });
});

/*
 * Navegación de usuarios (`gestion-usuarios` fase A, C1): "Usuarios" es visible
 * solo para ADMIN y lleva a /usuarios (mismo patrón que "Tabla nacional").
 */
describe("AppShell — navegación del módulo de usuarios", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  function renderNav() {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<div data-testid="home-page">Inicio</div>} />
            <Route path="usuarios" element={<div data-testid="users-page-mock">Usuarios</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  function navLinks() {
    return Array.from(document.querySelectorAll("nav a")).map((link) => link.textContent);
  }

  function signIn(roles: string[]) {
    const payload = {
      sub: "staff",
      roles: roles.map((role) => `ROLE_${role}`),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    useSessionStore.setState({
      tokens: { access: `.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.` },
      expiresAt: Date.now() + 3_600_000,
    });
  }

  it("ADMIN ve 'Usuarios' y navega a /usuarios", async () => {
    signIn(["ADMIN"]);
    renderNav();

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Usuarios" }));

    await waitFor(() => expect(screen.getByTestId("users-page-mock")).toBeInTheDocument());
  });

  it("COACH y USER no ven 'Usuarios' en el nav", () => {
    signIn(["COACH"]);
    renderNav();
    expect(navLinks()).not.toContain("Usuarios");

    cleanup();

    signIn(["USER"]);
    renderNav();
    expect(navLinks()).not.toContain("Usuarios");
  });
});
