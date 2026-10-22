// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import type { UserResponse } from "@/lib/api/types";
import { installRadixPointerPolyfills } from "@/modules/checkups/test-setup";

import { UserFormDialog } from "./user-form";

/*
 * Alta de usuario por ADMIN (design §C4): validación local exacta, body con
 * `roles`, 409 por campo sin texto crudo y 400 residual traducido.
 * jsdom no implementa Pointer Capture: el dialog monta un `Select` de Radix.
 */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

beforeAll(() => {
  installRadixPointerPolyfills();
});

afterEach(cleanup);

function createdUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 3,
    username: "coach3",
    email: "coach3@club.com",
    firstName: "Ana",
    lastName: "Pérez",
    enabled: true,
    active: true,
    roles: ["ROLE_COACH"],
    ...overrides,
  };
}

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<UserFormDialog open onOpenChange={onOpenChange} />, { wrapper });
  return { onOpenChange, queryClient };
}

interface FormOverrides {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  confirmPassword?: string;
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: FormOverrides = {},
) {
  const values = {
    username: "coach3",
    email: "coach3@club.com",
    firstName: "Ana",
    lastName: "Pérez",
    password: "secreto123",
    confirmPassword: "secreto123",
    ...overrides,
  };

  await user.clear(screen.getByTestId("user-username-input"));
  await user.type(screen.getByTestId("user-username-input"), values.username);
  await user.clear(screen.getByTestId("user-email-input"));
  await user.type(screen.getByTestId("user-email-input"), values.email);
  await user.clear(screen.getByTestId("user-firstName-input"));
  await user.type(screen.getByTestId("user-firstName-input"), values.firstName);
  await user.clear(screen.getByTestId("user-lastName-input"));
  await user.type(screen.getByTestId("user-lastName-input"), values.lastName);
  await user.clear(screen.getByTestId("user-password-input"));
  await user.type(screen.getByTestId("user-password-input"), values.password);
  await user.clear(screen.getByTestId("user-confirmPassword-input"));
  await user.type(screen.getByTestId("user-confirmPassword-input"), values.confirmPassword);
}

async function pickRole(label: string, user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("user-role-select"));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("UserFormDialog — validación local (C4)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("bloquea el envío con campos vacíos sin llamar al back", async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("user-submit"));

    expect(await screen.findByText("El nombre de usuario debe tener entre 3 y 50 caracteres")).toBeInTheDocument();
    expect(screen.getByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(screen.getByText("La contraseña debe tener al menos 8 caracteres")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("exige password de al menos 8 y confirmaciones iguales", async () => {
    renderDialog();
    const user = userEvent.setup();

    await fillForm(user, { password: "corta12", confirmPassword: "corta12" });
    await user.click(screen.getByTestId("user-submit"));

    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();

    await fillForm(user, { password: "secreto123", confirmPassword: "secreto124" });
    await user.click(screen.getByTestId("user-submit"));

    expect(await screen.findByText("Las contraseñas no coinciden")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("envía ROLE_USER por defecto cuando no se cambia el rol", async () => {
    apiFetchMock.mockResolvedValueOnce(createdUser({ roles: ["ROLE_USER"] }));
    renderDialog();
    const user = userEvent.setup();

    expect(screen.getByTestId("user-role-select")).toHaveTextContent("Deportista");
    await fillForm(user);
    await user.click(screen.getByTestId("user-submit"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith("/users", {
      method: "POST",
      body: {
        username: "coach3",
        email: "coach3@club.com",
        firstName: "Ana",
        lastName: "Pérez",
        password: "secreto123",
        confirmPassword: "secreto123",
        roles: ["USER"],
      },
    });
  });
});

describe("UserFormDialog — reset entre aperturas", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("limpia los campos al cerrar y volver a abrir el dialog", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onOpenChange = vi.fn();
    const ui = (open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <UserFormDialog open={open} onOpenChange={onOpenChange} />
      </QueryClientProvider>
    );

    const { rerender } = render(ui(true));
    const user = userEvent.setup();
    await user.type(screen.getByTestId("user-username-input"), "coach3");
    await user.type(screen.getByTestId("user-password-input"), "secreto123");

    rerender(ui(false));
    rerender(ui(true));

    await waitFor(() => expect(screen.getByTestId("user-username-input")).toHaveValue(""));
    expect(screen.getByTestId("user-password-input")).toHaveValue("");
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe("UserFormDialog — alta con rol (C2/C3/C4)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("crea un COACH con el body exacto y cierra el dialog", async () => {
    apiFetchMock.mockResolvedValueOnce(createdUser());
    const { onOpenChange } = renderDialog();
    const user = userEvent.setup();

    await fillForm(user);
    await pickRole("Entrenador / Metodólogo", user);
    await user.click(screen.getByTestId("user-submit"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith("/users", {
      method: "POST",
      body: {
        username: "coach3",
        email: "coach3@club.com",
        firstName: "Ana",
        lastName: "Pérez",
        password: "secreto123",
        confirmPassword: "secreto123",
        roles: ["COACH"],
      },
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("un 409 de username se marca por campo sin mostrar texto crudo", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(409, {
        status: 409,
        error: "Conflict",
        message: "User with username already exists",
      }),
    );
    const { onOpenChange } = renderDialog();
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByTestId("user-submit"));

    const fieldError = await screen.findByTestId("user-duplicate-field");
    expect(fieldError).toHaveTextContent("Ya existe un usuario con ese nombre de usuario");
    expect(screen.queryByText("User with username already exists")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("un 409 de email se marca en el campo email", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(409, {
        status: 409,
        error: "Conflict",
        message: "User with email already exists",
      }),
    );
    renderDialog();
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByTestId("user-submit"));

    expect(await screen.findByTestId("user-duplicate-field")).toHaveTextContent(
      "Ya existe un usuario con ese email",
    );
  });

  it("un 409 genérico de integridad se muestra como conflicto global seguro", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(409, {
        status: 409,
        error: "Conflict",
        message: "El recurso ya existe o entra en conflicto con una restricción de integridad",
      }),
    );
    renderDialog();
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByTestId("user-submit"));

    const alert = await screen.findByTestId("user-form-error");
    expect(alert).toHaveTextContent("Ya existe un usuario con esos datos");
    expect(alert).not.toHaveTextContent("restricción de integridad");
  });

  it("un 400 residual se traduce y nunca muestra el mensaje crudo", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(400, {
        status: 400,
        error: "Bad Request",
        message: "Error de validación",
        details: "Password must be at least 8 characters",
      }),
    );
    renderDialog();
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByTestId("user-submit"));

    const alert = await screen.findByTestId("user-form-error");
    expect(alert).toHaveTextContent("La contraseña debe tener al menos 8 caracteres");
    expect(alert).not.toHaveTextContent("Password must be at least 8 characters");
  });
});
