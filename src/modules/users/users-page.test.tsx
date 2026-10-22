// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { appRoutes } from "@/app/router";
import { apiFetch } from "@/lib/api";
import type { UserResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";
import { installRadixPointerPolyfills } from "@/modules/checkups/test-setup";

import { USERS_LIST_KEY, USERS_PAGE_SIZE } from "./users-api";
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

beforeAll(() => {
  installRadixPointerPolyfills();
});

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

async function fillNewUserForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { username: string; email: string; firstName: string; lastName: string },
) {
  await user.type(screen.getByTestId("user-username-input"), values.username);
  await user.type(screen.getByTestId("user-email-input"), values.email);
  await user.type(screen.getByTestId("user-firstName-input"), values.firstName);
  await user.type(screen.getByTestId("user-lastName-input"), values.lastName);
  await user.type(screen.getByTestId("user-password-input"), "secreto123");
  await user.type(screen.getByTestId("user-confirmPassword-input"), "secreto123");
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

  return queryClient;
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

    // Las 5 columnas del contrato (roles ya viajan desde P2).
    expect(within(list).getByText("Usuario")).toBeInTheDocument();
    expect(within(list).getByText("Nombre")).toBeInTheDocument();
    expect(within(list).getByText("Email")).toBeInTheDocument();
    expect(within(list).getByText("Rol")).toBeInTheDocument();
    expect(within(list).getByText("Estado")).toBeInTheDocument();
    // Render tolerante: sin `roles` en la respuesta, la celda queda neutra.
    expect(screen.getByTestId("user-roles-1")).toHaveTextContent("—");

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

  it("muestra el estado de carga mientras la query está pendiente", async () => {
    signInAs(["ADMIN"]);
    let resolveUsers: (users: UserResponse[]) => void = () => {};
    apiFetchMock.mockReturnValueOnce(
      new Promise<UserResponse[]>((resolve) => {
        resolveUsers = resolve;
      }),
    );
    renderPage();

    const loading = await screen.findByTestId("users-loading");
    expect(loading).toBeInTheDocument();
    expect(screen.getByText("Cargando usuarios")).toBeInTheDocument();
    expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("users-empty")).not.toBeInTheDocument();

    resolveUsers(makeUsers(1));

    expect(await screen.findByTestId("users-list")).toBeInTheDocument();
    expect(screen.queryByTestId("users-loading")).not.toBeInTheDocument();
  });

  it("un refetch que reduce la lista recorta la página fuera de rango", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock
      .mockResolvedValueOnce(makeUsers(USERS_PAGE_SIZE + 2))
      .mockResolvedValueOnce(makeUsers(3));
    const queryClient = renderPage();

    expect(await screen.findByText("staff1")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("users-pagination-next"));
    expect(await screen.findByText("staff11")).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 2/)).toBeInTheDocument();

    // Refetch con menos datos: 2 páginas → 1 página (la actual deja de existir).
    await queryClient.refetchQueries({ queryKey: USERS_LIST_KEY });

    await waitFor(() => expect(screen.getByText(/Página 1 de 1/)).toBeInTheDocument());
    expect(screen.getByText(/3 usuarios en total/)).toBeInTheDocument();
    expect(within(screen.getByTestId("users-list")).getAllByRole("row")).toHaveLength(4); // cabecera + 3
    expect(screen.getByText("staff1")).toBeInTheDocument();
    expect(screen.queryByText("staff11")).not.toBeInTheDocument();
    expect(screen.getByTestId("users-pagination-prev")).toBeDisabled();
    expect(screen.getByTestId("users-pagination-next")).toBeDisabled();
    expect(screen.queryByText(/Página 2 de 1/)).not.toBeInTheDocument();
  });

  it("P4: refetch fallido con datos conservados muestra el error y NO el pie de paginación", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock
      .mockResolvedValueOnce(makeUsers(USERS_PAGE_SIZE + 2))
      .mockRejectedValueOnce(new Error("network down"));
    const queryClient = renderPage();

    expect(await screen.findByText("staff1")).toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument();

    // Refetch que falla: TanStack Query CONSERVA `data` y marca `isError: true`.
    await queryClient.refetchQueries({ queryKey: USERS_LIST_KEY }).catch(() => {});

    expect(await screen.findByTestId("users-error")).toBeInTheDocument();
    expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
    // Lo importante: la navegación no se pinta junto a la tarjeta de error.
    expect(screen.queryByText(/Página 1 de 2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/usuarios en total/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("users-pagination-prev")).not.toBeInTheDocument();
    expect(screen.queryByTestId("users-pagination-next")).not.toBeInTheDocument();
  });

  it("renderiza los roles con etiquetas ES y tolera respuestas sin roles", async () => {
    signInAs(["ADMIN"]);
    const [coach, legacy] = makeUsers(2);
    apiFetchMock.mockResolvedValueOnce([
      { ...coach, roles: ["ROLE_COACH", "ROLE_USER"] },
      { ...legacy, roles: undefined },
    ]);
    renderPage();

    const list = await screen.findByTestId("users-list");
    const coachRoles = within(list).getByTestId("user-roles-1");
    expect(coachRoles).toHaveTextContent("Entrenador / Metodólogo, Deportista");
    expect(within(list).getByTestId("user-roles-2")).toHaveTextContent("—");
  });

  it("ADMIN ve el botón de alta y abre el dialog 'Nuevo usuario'", async () => {
    signInAs(["ADMIN"]);
    apiFetchMock.mockResolvedValueOnce(makeUsers(1));
    renderPage();

    const button = await screen.findByTestId("user-new-button");
    const user = userEvent.setup();
    await user.click(button);

    const dialog = await screen.findByTestId("user-form-dialog");
    expect(screen.getByTestId("user-form")).toBeInTheDocument();
    expect(within(dialog).getByText("Nuevo usuario")).toBeInTheDocument();
  });

  it("alta de COACH: cierra el dialog y la lista invalidada muestra el usuario nuevo", async () => {
    signInAs(["ADMIN"]);
    const [adminUser, created] = makeUsers(2);
    const createdCoach = { ...created, username: "coach2", email: "coach2@club.com", roles: ["ROLE_COACH"] };
    apiFetchMock
      .mockResolvedValueOnce([adminUser])
      .mockResolvedValueOnce(createdCoach)
      .mockResolvedValueOnce([adminUser, createdCoach]);
    renderPage();

    expect(await screen.findByText("staff1")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("user-new-button"));

    await screen.findByTestId("user-form");
    await fillNewUserForm(user, {
      username: "coach2",
      email: "coach2@club.com",
      firstName: "Carlos",
      lastName: "Coach",
    });

    await user.click(screen.getByTestId("user-role-select"));
    await user.click(await screen.findByRole("option", { name: "Entrenador / Metodólogo" }));
    await user.click(screen.getByTestId("user-submit"));

    await waitFor(() => expect(screen.queryByTestId("user-form-dialog")).not.toBeInTheDocument());
    expect(await screen.findByTestId("user-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("user-roles-2")).toHaveTextContent("Entrenador / Metodólogo");
    expect(screen.getByTestId("user-created-success")).toHaveTextContent("«coach2»");
    expect(apiFetchMock).toHaveBeenCalledWith("/users", {
      method: "POST",
      body: {
        username: "coach2",
        email: "coach2@club.com",
        firstName: "Carlos",
        lastName: "Coach",
        password: "secreto123",
        confirmPassword: "secreto123",
        roles: ["COACH"],
      },
    });
  });

  it("al crear desde una página > 0 vuelve a la primera y confirma el alta", async () => {
    signInAs(["ADMIN"]);
    const initial = makeUsers(USERS_PAGE_SIZE + 2);
    const created = {
      ...makeUsers(USERS_PAGE_SIZE + 3)[USERS_PAGE_SIZE + 2],
      username: "nuevo12",
      email: "nuevo12@club.com",
      roles: ["ROLE_USER"],
    };
    apiFetchMock
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce([...initial, created]);
    renderPage();

    expect(await screen.findByText("staff1")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("users-pagination-next"));
    expect(await screen.findByText("staff11")).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 2/)).toBeInTheDocument();

    await user.click(screen.getByTestId("user-new-button"));
    await screen.findByTestId("user-form");
    await fillNewUserForm(user, {
      username: "nuevo12",
      email: "nuevo12@club.com",
      firstName: "Nuevo",
      lastName: "Usuario",
    });
    await user.click(screen.getByTestId("user-submit"));

    await waitFor(() => expect(screen.queryByTestId("user-form-dialog")).not.toBeInTheDocument());
    expect(await screen.findByTestId("user-created-success")).toHaveTextContent("«nuevo12»");
    expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument();
    expect(screen.getByText(/13 usuarios en total/)).toBeInTheDocument();
  }, 15_000);

  it("USER sin rol ADMIN no ve el botón de alta", async () => {
    signInAs(["USER"]);
    apiFetchMock.mockResolvedValueOnce(makeUsers(1));
    renderPage();

    expect(await screen.findByTestId("users-list")).toBeInTheDocument();
    expect(screen.queryByTestId("user-new-button")).not.toBeInTheDocument();
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
