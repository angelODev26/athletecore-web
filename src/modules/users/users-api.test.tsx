// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { CreateUserRequest, UserResponse } from "@/lib/api/types";

import {
  USERS_LIST_KEY,
  USERS_PAGE_SIZE,
  fetchUsers,
  paginateClientSide,
  useCreateUser,
  useUsers,
} from "./users-api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

function makeUser(id: number): UserResponse {
  return {
    id,
    username: `staff${id}`,
    email: `staff${id}@club.com`,
    firstName: "Nombre",
    lastName: `Apellido ${id}`,
    enabled: true,
    active: true,
  };
}

describe("capa de datos de usuarios", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("useUsers pide GET /users exacto (solo ADMIN en el back; array completo, sin paginar)", async () => {
    apiFetchMock.mockResolvedValueOnce([makeUser(1)]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([makeUser(1)]);
    // URL y método exactos del contrato 03 §4: GET plano, sin query params.
    expect(apiFetchMock).toHaveBeenCalledWith("/users");
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetchUsers también usa el recurso plano /users (sin page/size del back)", async () => {
    apiFetchMock.mockResolvedValueOnce([]);

    await fetchUsers();

    expect(apiFetchMock).toHaveBeenCalledWith("/users");
  });

  it("D2: la paginación es client-side — clave sin página y el slice local no llama al back", () => {
    // La clave de la lista es constante (no incluye la página): una única
    // entrada en caché para todo el listado — pasar de página no reconsulta.
    expect(USERS_LIST_KEY).toEqual(["users", "list"]);

    const users = Array.from({ length: 12 }, (_, index) => makeUser(index + 1));
    const firstPage = paginateClientSide(users, 0, USERS_PAGE_SIZE);
    const secondPage = paginateClientSide(users, 1, USERS_PAGE_SIZE);

    expect(USERS_PAGE_SIZE).toBe(10);
    expect(firstPage.items.map((user) => user.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(firstPage.totalItems).toBe(12);
    expect(secondPage.items.map((user) => user.id)).toEqual([11, 12]);
    // El adapter es puro: trocear la lista completa no dispara red.
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("useCreateUser hace POST /users con roles e invalida la lista", async () => {
    const created = { ...makeUser(3), roles: ["ROLE_COACH"] };
    apiFetchMock.mockResolvedValueOnce(created);
    const body: CreateUserRequest = {
      username: "coach3",
      email: "coach3@club.com",
      firstName: "Nombre",
      lastName: "Apellido 3",
      password: "secreto123",
      confirmPassword: "secreto123",
      roles: ["COACH"],
    };

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateUser(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(body);
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/users", { method: "POST", body });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: USERS_LIST_KEY });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("USERS_LIST_KEY es un destino de invalidación válido (preparada para la mutación de la fase B)", async () => {
    apiFetchMock.mockResolvedValue([makeUser(1)]); // fetch inicial + refetch tras invalidar

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // Lo que hará useCreateUser (fase B): invalidar la clave de la lista…
    await queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY });
    // …deja la query stale y el observer activo refresca (segundo GET /users).
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(apiFetchMock).toHaveBeenLastCalledWith("/users");
  });
});
