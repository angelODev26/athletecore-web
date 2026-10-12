// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError, getDuplicateField } from "@/lib/api";

import {
  fetchAthletesPage,
  SPORTS_CATALOG_KEY,
  useAthleteProfile,
  useAthletesPage,
  useSportsCatalog,
} from "./athletes-api";

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

const athlete = {
  id: 7,
  username: "mphelps",
  email: "mphelps@club.com",
  firstName: "Michael",
  lastName: "Phelps",
  fullName: "Michael Phelps",
  birthDate: null,
  photoUrl: null,
  active: true,
};

describe("useAthleteProfile", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("traduce el 404 de perfil a null (sin perfil no es un error)", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(404, { status: 404, error: "Not Found", message: "Perfil no encontrado" }),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAthleteProfile(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("propaga los errores que no son 404", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(500, { status: 500, error: "Internal Server Error", message: "Boom" }),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAthleteProfile(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe("/athletes/7/profile");
  });
});

describe("useAthletesPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("normaliza la Spring Page con toPageModel y pagina server-side", async () => {
    apiFetchMock.mockResolvedValueOnce({
      content: [athlete],
      number: 0,
      size: 10,
      totalElements: 57,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAthletesPage(0, 10), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      items: [athlete],
      page: 0,
      pageSize: 10,
      totalItems: 57,
    });

    const [path] = apiFetchMock.mock.calls[0];
    expect(path).toContain("/athletes?");
    expect(path).toContain("page=0");
    expect(path).toContain("size=10");
    expect(path).toContain("sort=lastName%2Casc");
  });

  it("fetchAthletesPage mantiene la página y el tamaño pedidos", async () => {
    apiFetchMock.mockResolvedValueOnce({ content: [], size: 10, totalElements: 0 });

    const model = await fetchAthletesPage(3, 10);
    expect(model).toEqual({ items: [], page: 3, pageSize: 10, totalItems: 0 });
  });
});

describe("useSportsCatalog", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("queda cacheada para siempre (staleTime infinito, doc 04 §5)", async () => {
    apiFetchMock.mockResolvedValueOnce([]);

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useSportsCatalog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = queryClient.getQueryCache().find({ queryKey: SPORTS_CATALOG_KEY });
    expect((query?.options as { staleTime?: number }).staleTime).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("getDuplicateField (409 de atletas)", () => {
  it("discrimina username frente a email en los mensajes del contrato", () => {
    const usernameConflict = new ApiError(409, {
      status: 409,
      error: "Conflict",
      message: "Athlete with username already exists",
    });
    const emailConflict = new ApiError(409, {
      status: 409,
      error: "Conflict",
      message: "Athlete with email already exists",
    });

    expect(getDuplicateField(usernameConflict)).toBe("username");
    expect(getDuplicateField(emailConflict)).toBe("email");
  });

  it("devuelve null para otros estados", () => {
    const badRequest = new ApiError(400, { status: 400, error: "Bad Request", message: "Error de validación" });
    expect(getDuplicateField(badRequest)).toBeNull();
  });
});
