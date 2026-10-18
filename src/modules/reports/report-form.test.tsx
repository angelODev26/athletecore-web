// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";
import type { AthleteResponse, ReportDetailResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";
import { installRadixPointerPolyfills } from "@/modules/checkups/test-setup";

import { ReportFormDialog, REPORT_TITLE_MAX_LENGTH, validateReportLocally } from "./report-form";
import { installApiRoutes } from "./test-utils";

/*
 * Fase 5 de `integrar-reportes`: generación SÍNCRONA (`POST /reports`, C5/T3).
 * Validación local EXACTA antes de llamar al back, loading durante toda la request
 * (sin polling) y lectura del `status` final de la `201`: GENERATED navega al detalle,
 * FAILED deja el dialog abierto con el `errorMessage` del servidor.
 *
 * Usa los polyfills de Radix de los tests del proyecto (jsdom no implementa Pointer
 * Capture): el dialog monta `Select` del registry.
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

function athlete(id: number, fullName: string): AthleteResponse {
  return {
    id,
    username: `user${id}`,
    email: `user${id}@athletecore.test`,
    firstName: "Nombre",
    lastName: fullName,
    fullName,
    birthDate: null,
    photoUrl: null,
    active: true,
  };
}

const ATHLETES = [athlete(7, "Michael Phelps"), athlete(8, "Katie Ledecky")];
const ATHLETES_PAGE = { content: ATHLETES, last: true, totalElements: ATHLETES.length };

function reportDetail(
  overrides: Partial<ReportDetailResponse> & { id: number },
): ReportDetailResponse {
  return {
    reportType: "INDIVIDUAL",
    athleteId: 7,
    category: null,
    year: null,
    month: null,
    title: "Informe",
    status: "GENERATED",
    errorMessage: null,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:01Z",
    exports: [],
    ...overrides,
  };
}

function renderForm() {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/reports"]}>
      <Routes>
        <Route
          path="/reports"
          element={<ReportFormDialog open onOpenChange={onOpenChange} />}
        />
        <Route path="/reports/:reportId" element={<div data-testid="report-detail-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
  return onOpenChange;
}

function installFormRoutes(
  post: unknown | ((path: string, options: unknown) => Promise<unknown>) = reportDetail({ id: 9 }),
) {
  installApiRoutes([
    { match: /^\/athletes\?/, resolve: ATHLETES_PAGE },
    { match: /^\/reports$/, method: "POST", resolve: post },
  ]);
}

function postCalls(): Array<{ path: string; body: unknown }> {
  return apiFetchMock.mock.calls
    .filter(([, options]) => options?.method === "POST")
    .map(([path, options]) => ({ path: path as string, body: options?.body }));
}

/** Selecciona una opción de un `Select` del registry (abre el trigger y pulsa la opción). */
async function pickOption(testid: string, label: string, user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId(testid));
  await user.click(await screen.findByRole("option", { name: label }));
}

async function pickIndividualAthlete(user: ReturnType<typeof userEvent.setup>) {
  await pickOption("report-type-select", "Individual", user);
  // La lista de deportistas llega por su propia query: el trigger está deshabilitado
  // mientras carga.
  await waitFor(() => expect(screen.getByTestId("report-athlete-select")).not.toBeDisabled());
  await pickOption("report-athlete-select", "Michael Phelps", user);
}

describe("validateReportLocally — reglas del contrato (C5)", () => {
  it("INDIVIDUAL sin athleteId bloquea con error de campo", () => {
    const errors = validateReportLocally({
      reportType: "INDIVIDUAL",
      athleteId: "",
      title: "Informe",
      year: "",
    });
    expect(errors.athleteId).toBe("Selecciona el deportista del reporte");
    expect(errors.title).toBeUndefined();
  });

  it("GENERAL no exige deportista", () => {
    expect(
      validateReportLocally({ reportType: "GENERAL", athleteId: "", title: "Equipo", year: "" }),
    ).toEqual({});
  });

  it("título vacío o de 201 caracteres bloquea; 200 pasa", () => {
    expect(
      validateReportLocally({ reportType: "GENERAL", athleteId: "", title: "   ", year: "" }).title,
    ).toBe("El título es obligatorio");
    expect(
      validateReportLocally({
        reportType: "GENERAL",
        athleteId: "",
        title: "x".repeat(REPORT_TITLE_MAX_LENGTH + 1),
        year: "",
      }).title,
    ).toBe("El título no puede superar 200 caracteres");
    expect(
      validateReportLocally({
        reportType: "GENERAL",
        athleteId: "",
        title: "x".repeat(REPORT_TITLE_MAX_LENGTH),
        year: "",
      }),
    ).toEqual({});
  });

  it("el año, si viene, debe ser un entero (formato del input, no regla del DTO)", () => {
    expect(
      validateReportLocally({ reportType: "GENERAL", athleteId: "", title: "Equipo", year: "20x6" })
        .year,
    ).toBe("El año debe ser un número entero (por ejemplo 2026)");
  });
});

describe("ReportFormDialog — generación síncrona (C5, C9, C11)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({
      tokens: { access: `.${btoa(JSON.stringify({ sub: "coach", roles: ["ROLE_COACH"], exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, "")}.` },
      expiresAt: Date.now() + 3_600_000,
    });
  });

  it("INDIVIDUAL sin deportista: marca el campo y NO llama al back", async () => {
    installFormRoutes();
    renderForm();

    const user = userEvent.setup();
    await pickOption("report-type-select", "Individual", user);
    fireEvent.change(screen.getByTestId("report-title-input"), {
      target: { value: "Informe marzo" },
    });
    await user.click(screen.getByTestId("report-submit"));

    expect(await screen.findByText("Selecciona el deportista del reporte")).toBeInTheDocument();
    expect(postCalls()).toHaveLength(0);
  });

  it("título por encima de 200 caracteres: bloqueo local sin llamar al back", async () => {
    installFormRoutes();
    renderForm();

    const user = userEvent.setup();
    await pickIndividualAthlete(user);
    fireEvent.change(screen.getByTestId("report-title-input"), {
      target: { value: "x".repeat(REPORT_TITLE_MAX_LENGTH + 1) },
    });
    await user.click(screen.getByTestId("report-submit"));

    expect(await screen.findByText("El título no puede superar 200 caracteres")).toBeInTheDocument();
    expect(postCalls()).toHaveLength(0);
  });

  it("201 GENERATED: POST con el body exacto, cierra y navega al detalle", async () => {
    installFormRoutes(reportDetail({ id: 9 }));
    const onOpenChange = renderForm();

    const user = userEvent.setup();
    await pickIndividualAthlete(user);
    fireEvent.change(screen.getByTestId("report-title-input"), {
      target: { value: "  Informe marzo  " },
    });
    fireEvent.change(screen.getByTestId("report-year-input"), { target: { value: "2026" } });
    await pickOption("report-month-select", "Marzo", user);
    await user.click(screen.getByTestId("report-submit"));

    expect(await screen.findByTestId("report-detail-mock")).toBeInTheDocument();

    expect(postCalls()).toEqual([
      {
        path: "/reports",
        body: {
          reportType: "INDIVIDUAL",
          title: "Informe marzo",
          athleteId: 7,
          year: 2026,
          month: 3,
        },
      },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("201 GENERATED GENERAL: envía categoría (opcional) y omite athleteId", async () => {
    installFormRoutes(reportDetail({ id: 11, reportType: "GENERAL", athleteId: null }));
    renderForm();

    const user = userEvent.setup();
    await pickOption("report-type-select", "General", user);
    await pickOption("report-category-select", "Juvenil", user);
    fireEvent.change(screen.getByTestId("report-title-input"), {
      target: { value: "Equipo juvenil Q1" },
    });
    await user.click(screen.getByTestId("report-submit"));

    await screen.findByTestId("report-detail-mock");
    expect(postCalls()).toEqual([
      { path: "/reports", body: { reportType: "GENERAL", title: "Equipo juvenil Q1", category: "JUVENIL" } },
    ]);
  });

  it("el botón queda en loading durante TODA la request síncrona (sin polling)", async () => {
    let resolvePost!: (value: ReportDetailResponse) => void;
    const pendingPost = new Promise<ReportDetailResponse>((resolve) => {
      resolvePost = resolve;
    });
    installFormRoutes(() => pendingPost);
    renderForm();

    const user = userEvent.setup();
    await pickIndividualAthlete(user);
    fireEvent.change(screen.getByTestId("report-title-input"), { target: { value: "Informe" } });
    await user.click(screen.getByTestId("report-submit"));

    const submit = screen.getByTestId("report-submit");
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("Generando…");
    // Una sola request en vuelo: la generación es síncrona, no hay polling de estado.
    expect(postCalls()).toHaveLength(1);
    expect(screen.queryByTestId("report-detail-mock")).not.toBeInTheDocument();

    resolvePost(reportDetail({ id: 9 }));

    expect(await screen.findByTestId("report-detail-mock")).toBeInTheDocument();
  });

  it("201 FAILED: el dialog permanece con el errorMessage del servidor en un banner role=alert", async () => {
    installFormRoutes(
      reportDetail({
        id: 9,
        status: "FAILED",
        errorMessage: "El deportista no tiene chequeos registrados",
      }),
    );
    const onOpenChange = renderForm();

    const user = userEvent.setup();
    await pickIndividualAthlete(user);
    fireEvent.change(screen.getByTestId("report-title-input"), { target: { value: "Informe" } });
    await user.click(screen.getByTestId("report-submit"));

    const banner = await screen.findByTestId("report-generation-error");
    expect(banner).toHaveAttribute("role", "alert");
    expect(within(banner).getByText("El deportista no tiene chequeos registrados")).toBeInTheDocument();

    // El dialog sigue abierto, sin navegación ni cierre.
    expect(screen.getByTestId("report-form")).toBeInTheDocument();
    expect(screen.queryByTestId("report-detail-mock")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("400 residual: mensaje seguro del diccionario del contrato, nunca texto crudo", async () => {
    installFormRoutes(() =>
      Promise.reject(
        new ApiError(400, {
          status: 400,
          error: "Bad Request",
          message: "El reporte individual requiere un athleteId",
        }),
      ),
    );
    renderForm();

    const user = userEvent.setup();
    await pickOption("report-type-select", "General", user);
    fireEvent.change(screen.getByTestId("report-title-input"), { target: { value: "Equipo" } });
    await user.click(screen.getByTestId("report-submit"));

    const banner = await screen.findByTestId("report-form-error");
    expect(banner).toHaveAttribute("role", "alert");
    expect(
      within(banner).getByText("El reporte individual requiere un athleteId"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("report-form")).toBeInTheDocument();
  });

  it("un error de red desconocido cae en el mensaje genérico del formulario", async () => {
    installFormRoutes(() => Promise.reject(new Error("boom")));
    renderForm();

    const user = userEvent.setup();
    await pickOption("report-type-select", "General", user);
    fireEvent.change(screen.getByTestId("report-title-input"), { target: { value: "Equipo" } });
    await user.click(screen.getByTestId("report-submit"));

    const banner = await screen.findByTestId("report-form-error");
    expect(
      within(banner).getByText("No se pudo generar el reporte. Inténtalo de nuevo."),
    ).toBeInTheDocument();
    expect(within(banner).queryByText("boom")).not.toBeInTheDocument();
  });
});
