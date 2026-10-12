// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { AthleteResponse } from "@/lib/api/types";

import { AthleteEditPage } from "./athlete-edit-page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

// Sin `globals: true` en Vitest no hay auto-cleanup del DOM entre tests.
afterEach(cleanup);

const athlete: AthleteResponse = {
  id: 7,
  username: "mphelps",
  email: "mphelps@club.com",
  firstName: "Michael",
  lastName: "Phelps",
  fullName: "Michael Phelps",
  birthDate: "1985-06-30",
  photoUrl: null,
  active: true,
};

function EditRoutes() {
  return (
    <MemoryRouter initialEntries={["/athletes/7/editar"]}>
      <Routes>
        <Route path="/athletes/:id/editar" element={<AthleteEditPage />} />
        <Route path="/athletes/:id" element={<div data-testid="athlete-detail-mock" />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEdit() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<EditRoutes />, { wrapper });
}

describe("AthleteEditPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("prefija los datos y muestra username/email bloqueados con nota", async () => {
    apiFetchMock.mockResolvedValueOnce(athlete);
    renderEdit();

    const usernameInput = await screen.findByTestId("athlete-form-username");
    expect(usernameInput).toHaveValue("mphelps");
    expect(usernameInput).toBeDisabled();
    expect(screen.getByTestId("athlete-form-email")).toBeDisabled();
    expect(screen.getAllByText("No editable por la API")).toHaveLength(2);
    expect(screen.getByTestId("athlete-birthdate-input")).toHaveValue("1985-06-30");
  });

  it("el PUT no contiene username ni email aunque estén en pantalla (A5)", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation(async (path, options) => {
      if (path === "/athletes/7" && options?.method === "PUT") {
        return athlete;
      }
      if (path === "/athletes/7") {
        return athlete;
      }
      throw new Error(`Endpoint inesperado en el test: ${path}`);
    });
    renderEdit();

    const firstNameInput = await screen.findByTestId("athlete-form-firstName");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Michael Andrés");

    await user.click(screen.getByTestId("athlete-form-submit"));

    await waitFor(() => expect(screen.getByTestId("athlete-detail-mock")).toBeInTheDocument());

    const putCalls = apiFetchMock.mock.calls.filter(([, options]) => options?.method === "PUT");
    expect(putCalls).toHaveLength(1);
    const [path, options] = putCalls[0]!;
    expect(path).toBe("/athletes/7");
    // Assert directo sobre el body: solo campos editables del contrato (doc 04 §2).
    expect(options!.body).toEqual({
      firstName: "Michael Andrés",
      lastName: "Phelps",
      birthDate: "1985-06-30",
    });
  });
});
