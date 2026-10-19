// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRoutes } from "@/app/router";
import { apiFetch } from "@/lib/api";
import type { UserResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";

import { USERS_PAGE_SIZE } from "./users-api";
import { UsersPage } from "./users-page";

/*
 * Fase A de `gestion-usuarios`: la lista de usuarios (C1/C4/C7).
 * - Columnas usuario/nombre/email + badge `enabled` informativo (`active` no se muestra).
 * - Paginación client-side (D2): pasar de página NO llama de nuevo al back.
 * - Guard de ruta real: se monta `appRoutes` con `createMemoryRouter` (mismo grafo
 *   que producción) — USER por URL directa ve "sin permisos" SIN cerrar sesión.
 *
 * Cero red: `apiFetch` se mockea. En jsdom no hay `<canvas>`, así que
 * `react-chartjs-2` se mockea igual que en router.test.tsx (solo lo importan las
 * páginas de reportes que `appRoutes` carga estáticamente).
 */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("react-chartjs-2", () => ({
  Line: () => null,
  Bar: () => null,
}));

const apiFetchMock = vi.mocked(apiFetch);

// Sin `globals: true` en Vitest no hay auto-cleanup del DOM entre tests.
afterEach(cleanup);

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

function makeUsers(count: number, enabled = true): UserResponse[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    username: `staff${index + 1}`,
    email: `staff${index + 1}@club.com`,
    firstName: "Nombre",
    lastName: `Apellido ${index + 1}`,
    enabled,
    active: true,
  }));
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/usuarios"]}>
      <Routes>
        <Route path="/usuarios" element={<UsersPage />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

/** Monta la tabla REAL de rutas (mismo grafo que producción, sin window.history). */
function renderAppRoute(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(appRoutes, { initialEntries: [initialPath] });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe("UsersPage — lista (C1/C4/C7)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("muestra usuario, nombre, email y el badge enabled informativo por fila", async () => {
    signInAs(["ADMIN"]);
    const [active, inactive] = makeUsers(2);
    apiFetchMock.mockResolvedValueOnce([{ ...active }, { ...inactive, enabled: false }]);
    renderPage();

    const list = await screen.findByTestId("users-list");
    expect(screen.getByTestId("users-page")).toBeInTheDocument();

    // Las 4 columnas del contrato (sin rol: UserResponse no lo trae hasta P2).
    expect(within(list).getByText("Usuario")).toBeInTheDocument();
    expect(within(list).getByText("Nombre")).toBeInTheDocument();
    expect(within(list).getByText("Email")).toBeInTheDocument();
    expect(within(list).getByText("Estado")).toBeInTheDocument();
    expect(within(list).queryByText("Rol")).not.toBeInTheDocument();

    expect(within(list).getByText("staff1")).toBeInTheDocument();
    expect(within(list).getByText("Nombre Apellido 1")).toBeInTheDocument();
    expect(within(list).getByText("staff1@club.com")).toBeInTheDocument();

    // C4: badge informativo por fila — "Activa" (status) / "Inactiva" (neutra).
    const activeBadge = within(list).getByTestId("user-enabled-badge-1");
    expect(activeBadge).toHaveTextContent("Activa");
    expect(activeBadge).toHaveClass("bg-success-subtle");
    const inactiveBadge = within(list).getByTestId("user-enabled-badge-2");
    expect(inactiveBadge).toHaveTextContent("Inactiva");

    // `active` NO se muestra (doc 03 §5: siempre true, informativo sin valor).
    expect(within(list).queryByText("true")).not.toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith("/users");
  });

  it("D2: pagina en cliente — Siguiente NO llama de nuevo al back", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockResolvedValueOnce(makeUsers(USERS_PAGE_SIZE + 2)); // un solo GET, array completo
    renderPage();

    expect(await screen.findByText("staff1")).toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument();
    expect(screen.getByText(/12 usuarios en total/)).toBeInTheDocument();
    expect(screen.queryByText("staff11")).not.toBeInTheDocument();
    expect(screen.getByTestId("users-pagination-prev")).toBeDisabled();
    expect(screen.getByTestId("users-pagination-next")).toBeEnabled();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("users-pagination-next"));

    // Slice local: sin nueva llamada (la clave de la lista no incluye la página).
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("staff11")).toBeInTheDocument();
    expect(screen.getByText("staff12")).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 2/)).toBeInTheDocument();
    expect(screen.getByTestId("users-pagination-prev")).toBeEnabled();
    expect(screen.getByTestId("users-pagination-next")).toBeDisabled();

    await user.click(screen.getByTestId("users-pagination-prev"));
    expect(await screen.findByText("staff1")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // Anterior tampoco consulta
  });

  it("lista vacía: estado vacío", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByTestId("users-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
  });

  it("error de carga: estado con reintento que vuelve a llamar al back", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(makeUsers(1));
    renderPage();

    const errorState = await screen.findByTestId("users-error");
    expect(errorState).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(errorState).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("user-row-1")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Ruta /usuarios — guard RequireRoles([\"ADMIN\"]) sobre el router real", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  afterEach(() => {
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("USER por URL directa ve 'sin permisos' y la sesión sigue viva", async () => {
    signInAs(["USER"]);
    apiFetchMock.mockResolvedValue(makeUsers(1));
    const router = renderAppRoute("/usuarios");

    const forbidden = await screen.findByTestId("forbidden-state");
    expect(forbidden).toHaveTextContent("Tu usuario no tiene permisos para ver esta sección.");
    // La página real nunca se monta (el guard de rol corta antes) ni se llama al back.
    expect(screen.queryByTestId("users-page")).not.toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalledWith("/users");
    // No es un 401 ni una expiración: no se cierra sesión ni se redirige a login.
    expect(useSessionStore.getState().tokens?.access).not.toBeNull();
    expect(router.state.location.pathname).toBe("/usuarios");
  });

  it("ADMIN por URL directa sí ve la lista", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockResolvedValueOnce(makeUsers(1));
    const router = renderAppRoute("/usuarios");

    expect(await screen.findByTestId("users-page")).toBeInTheDocument();
    expect(await screen.findByTestId("user-enabled-badge-1")).toBeInTheDocument();
    expect(screen.queryByTestId("forbidden-state")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/usuarios");
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/users"));
  });
});
