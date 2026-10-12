// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";

import { AthleteCreatePage } from "./athlete-create-page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

// Sin `globals: true` en Vitest no hay auto-cleanup del DOM entre tests.
afterEach(cleanup);

function WizardRoutes() {
  return (
    <MemoryRouter initialEntries={["/athletes/nuevo"]}>
      <Routes>
        <Route path="/athletes/nuevo" element={<AthleteCreatePage />} />
        <Route path="/athletes/:id" element={<div data-testid="athlete-detail-mock" />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

async function fillValidBasicStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("athlete-form-username"), "mphelps");
  await user.type(screen.getByTestId("athlete-form-email"), "mphelps@club.com");
  await user.type(screen.getByTestId("athlete-form-firstName"), "Michael");
  await user.type(screen.getByTestId("athlete-form-lastName"), "Phelps");
}

describe("AthleteCreatePage — paso 1", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("bloquea el envío con validación client-side inválida antes de llamar al back (T1)", async () => {
    const user = userEvent.setup();
    const { wrapper } = renderWizard();
    render(<WizardRoutes />, { wrapper });

    await user.type(screen.getByTestId("athlete-form-username"), "ab");
    await user.type(screen.getByTestId("athlete-form-email"), "no-es-un-email");
    await user.click(screen.getByTestId("athlete-form-submit"));

    expect(await screen.findByText("El nombre de usuario debe tener entre 3 y 255 caracteres")).toBeInTheDocument();
    expect(screen.getByText("Introduce un email válido")).toBeInTheDocument();
    expect(screen.getByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("un 409 de username duplicado cae en el campo username con texto en español", async () => {
    const user = userEvent.setup();
    const { wrapper } = renderWizard();
    render(<WizardRoutes />, { wrapper });

    await fillValidBasicStep(user);
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(409, { status: 409, error: "Conflict", message: "Athlete with username already exists" }),
    );

    await user.click(screen.getByTestId("athlete-form-submit"));

    expect(
      await screen.findByText("Ya existe un deportista con ese nombre de usuario"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Athlete with username already exists")).not.toBeInTheDocument();
  });

  it("un 409 de email duplicado cae en el campo email (no en username)", async () => {
    const user = userEvent.setup();
    const { wrapper } = renderWizard();
    render(<WizardRoutes />, { wrapper });

    await fillValidBasicStep(user);
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(409, { status: 409, error: "Conflict", message: "Athlete with email already exists" }),
    );

    await user.click(screen.getByTestId("athlete-form-submit"));

    expect(await screen.findByText("Ya existe un deportista con ese email")).toBeInTheDocument();
    expect(screen.queryByText("Ya existe un deportista con ese nombre de usuario")).not.toBeInTheDocument();
  });
});

describe("AthleteCreatePage — paso 2", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("abandonar en el paso 2 navega a la ficha del deportista recién creado", async () => {
    const user = userEvent.setup();
    const { wrapper } = renderWizard();
    render(<WizardRoutes />, { wrapper });

    await fillValidBasicStep(user);
    apiFetchMock.mockResolvedValueOnce({
      id: 7,
      username: "mphelps",
      email: "mphelps@club.com",
      firstName: "Michael",
      lastName: "Phelps",
      fullName: "Michael Phelps",
      birthDate: null,
      photoUrl: null,
      active: true,
    });

    await user.click(screen.getByTestId("athlete-form-submit"));
    expect(await screen.findByText("Paso 2 de 3 · Fecha de nacimiento")).toBeInTheDocument();

    await user.click(screen.getByTestId("athlete-skip-step"));
    await waitFor(() => expect(screen.getByTestId("athlete-detail-mock")).toBeInTheDocument());
  });

  it("guarda la fecha con PUT parcial y avanza al paso 3", async () => {
    const user = userEvent.setup();
    const { wrapper } = renderWizard();
    render(<WizardRoutes />, { wrapper });

    await fillValidBasicStep(user);
    apiFetchMock.mockResolvedValueOnce({
      id: 7,
      username: "mphelps",
      email: "mphelps@club.com",
      firstName: "Michael",
      lastName: "Phelps",
      fullName: "Michael Phelps",
      birthDate: null,
      photoUrl: null,
      active: true,
    });
    await user.click(screen.getByTestId("athlete-form-submit"));
    expect(await screen.findByText("Paso 2 de 3 · Fecha de nacimiento")).toBeInTheDocument();

    const dateInput = screen.getByTestId("athlete-birthdate-input");
    await user.type(dateInput, "1985-06-30");
    apiFetchMock.mockResolvedValueOnce({
      id: 7,
      username: "mphelps",
      email: "mphelps@club.com",
      firstName: "Michael",
      lastName: "Phelps",
      fullName: "Michael Phelps",
      birthDate: "1985-06-30",
      photoUrl: null,
      active: true,
    });

    await user.click(screen.getByTestId("athlete-step2-continue"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(apiFetchMock.mock.calls[1]?.[0]).toBe("/athletes/7");
    expect(apiFetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "PUT", body: { birthDate: "1985-06-30" } });
    expect(await screen.findByText("Perfil antropométrico")).toBeInTheDocument();
  });
});

const createdAthlete = {
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

const updatedAthlete = { ...createdAthlete, birthDate: "1985-06-30" };

const savedProfile = {
  id: 3,
  weightKgs: 72.5,
  heightCm: 178,
  armSpanCm: null,
  bmi: 22.88,
  bmiCategory: "Normal",
  notes: "",
  isComplete: false,
};

/** Rellena pasos 1 y 2 con mocks felices y deja el wizard en el paso 3. */
async function advanceToStep3(user: ReturnType<typeof userEvent.setup>) {
  await fillValidBasicStep(user);
  apiFetchMock.mockResolvedValueOnce(createdAthlete);
  await user.click(screen.getByTestId("athlete-form-submit"));
  expect(await screen.findByText("Paso 2 de 3 · Fecha de nacimiento")).toBeInTheDocument();

  await user.type(screen.getByTestId("athlete-birthdate-input"), "1985-06-30");
  apiFetchMock.mockResolvedValueOnce(updatedAthlete);
  await user.click(screen.getByTestId("athlete-step2-continue"));
  expect(await screen.findByText("Paso 3 de 3 · Perfil antropométrico")).toBeInTheDocument();
}

describe("AthleteCreatePage — paso 3", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("el envío del perfil llama a POST /{id}/profile (upsert) y navega a la ficha", async () => {
    const user = userEvent.setup();
    const { wrapper } = renderWizard();
    render(<WizardRoutes />, { wrapper });

    await advanceToStep3(user);
    apiFetchMock.mockResolvedValueOnce(savedProfile);

    await user.type(screen.getByTestId("athlete-profile-weight"), "72.5");
    await user.type(screen.getByTestId("athlete-profile-height"), "178");
    await user.click(screen.getByTestId("athlete-finish-step"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3));
    const [path, options] = apiFetchMock.mock.calls[2]!;
    expect(path).toBe("/athletes/7/profile");
    expect(options).toMatchObject({
      method: "POST",
      body: { weightKgs: 72.5, heightCm: 178, notes: "" },
    });
    expect(await screen.findByTestId("athlete-detail-mock")).toBeInTheDocument();
  });

  it("'Omitir y terminar' navega a la ficha sin llamar al back", async () => {
    const user = userEvent.setup();
    const { wrapper } = renderWizard();
    render(<WizardRoutes />, { wrapper });

    await advanceToStep3(user);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByTestId("athlete-skip-step"));
    expect(await screen.findByTestId("athlete-detail-mock")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
