// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import type { AthleteResponse, ReportScheduleResponse } from "@/lib/api/types";
import { formatInstantDateTime } from "@/shared/format/dates";

import { installReportSchedulePolyfills } from "./test-setup";
import { installApiRoutes } from "./test-utils";
import {
  buildScheduleRequest,
  buildScheduleRequestFromSchedule,
  initialScheduleFormValues,
  validateScheduleLocally,
  NO_SCHEDULE_TIMEZONE,
  NO_SCHEDULE_TIMEZONE_LABEL,
  SCHEDULE_INVALID_CRON_MESSAGE,
  ScheduleFormDialog,
} from "./schedule-form";
import type { ScheduleFormValues } from "./schedule-form";

/*
 * Fase 6 de `integrar-reportes` (C7): presets → cron de 6 campos en el formulario de
 * programaciones. El usuario nunca escribe cron; la expresión se genera, se muestra
 * read-only y viaja en el POST/PUT. La edición es un PUT COMPLETO (ningún campo omitido)
 * y un cron que no encaja en los presets entra en modo "personalizado".
 */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

beforeAll(() => {
  installReportSchedulePolyfills();
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

function scheduleRow(
  overrides: Partial<ReportScheduleResponse> & { id: number },
): ReportScheduleResponse {
  return {
    reportType: "GENERAL",
    athleteId: null,
    category: null,
    cronExpression: "0 0 6 * * *",
    timezone: "America/Bogota",
    active: true,
    lastRunAt: null,
    nextRunAt: "2026-11-01T11:00:00Z",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function values(overrides: Partial<ScheduleFormValues> = {}): ScheduleFormValues {
  return {
    frequency: "DAILY",
    weekday: "MON",
    dayOfMonth: "1",
    hour: "6",
    minute: "0",
    timezone: "America/Bogota",
    reportType: "GENERAL",
    athleteId: "",
    category: "",
    active: true,
    ...overrides,
  };
}

function renderForm(schedule: ReportScheduleResponse | null = null) {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/reports/programaciones"]}>
      <ScheduleFormDialog open onOpenChange={onOpenChange} schedule={schedule} />
    </MemoryRouter>,
    { wrapper },
  );
  return onOpenChange;
}

function installFormRoutes({
  post = scheduleRow({ id: 3 }),
  put = scheduleRow({ id: 5 }),
}: {
  post?: unknown | ((path: string, options: unknown) => Promise<unknown>);
  put?: unknown | ((path: string, options: unknown) => Promise<unknown>);
} = {}): void {
  installApiRoutes([
    { match: /^\/athletes\?/, resolve: ATHLETES_PAGE },
    { match: /^\/report-schedules$/, method: "POST", resolve: post },
    { match: /^\/report-schedules\/\d+$/, method: "PUT", resolve: put },
  ]);
}

function callsOf(method: string): Array<{ path: string; body: unknown }> {
  return apiFetchMock.mock.calls
    .filter(([, options]) => options?.method === method)
    .map(([path, options]) => ({ path: path as string, body: options?.body }));
}

/** Las 6 claves del contrato: el PUT es completo, ninguna puede faltar. */
const CONTRACT_KEYS = ["active", "athleteId", "category", "cronExpression", "reportType", "timezone"];

async function pickOption(testid: string, label: string, user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId(testid));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("validateScheduleLocally — reglas locales (C7)", () => {
  it("exige frecuencia y tipo de reporte", () => {
    expect(validateScheduleLocally(values({ frequency: "", reportType: "" }))).toEqual({
      frequency: "Elige una frecuencia para la programación",
      reportType: "Selecciona el tipo de reporte",
    });
  });

  it("INDIVIDUAL exige deportista; GENERAL no", () => {
    expect(validateScheduleLocally(values({ reportType: "INDIVIDUAL" })).athleteId).toBe(
      "Selecciona el deportista del reporte",
    );
    expect(validateScheduleLocally(values({ reportType: "INDIVIDUAL", athleteId: "7" }))).toEqual({});
    expect(validateScheduleLocally(values({ reportType: "GENERAL" }))).toEqual({});
  });
});

describe("buildScheduleRequest — cuerpo completo del contrato", () => {
  it("INDIVIDUAL envía athleteId numérico y category explícitamente null", () => {
    const body = buildScheduleRequest(
      values({ reportType: "INDIVIDUAL", athleteId: "7" }),
      "0 0 6 * * *",
    );

    expect(Object.keys(body).sort()).toEqual(CONTRACT_KEYS);
    expect(body).toEqual({
      reportType: "INDIVIDUAL",
      athleteId: 7,
      category: null,
      cronExpression: "0 0 6 * * *",
      timezone: "America/Bogota",
      active: true,
    });
  });

  it("GENERAL sin categoría la envía null (nunca omitida)", () => {
    const body = buildScheduleRequest(values({ reportType: "GENERAL" }), "0 0 6 1 * *");

    expect(Object.keys(body).sort()).toEqual(CONTRACT_KEYS);
    expect(body).toMatchObject({ athleteId: null, category: null });
  });

  it("NO_SCHEDULE_TIMEZONE («Sin zona horaria») viaja como null: campo opcional del contrato", () => {
    const body = buildScheduleRequest(
      values({ timezone: NO_SCHEDULE_TIMEZONE }),
      "0 0 6 * * *",
    );

    expect(Object.keys(body).sort()).toEqual(CONTRACT_KEYS);
    expect(body.timezone).toBeNull();
  });

  it("una zona real se reenvía tal cual (ni null ni sustitución)", () => {
    const body = buildScheduleRequest(values({ timezone: "Europe/Madrid" }), "0 0 6 * * *");

    expect(body.timezone).toBe("Europe/Madrid");
  });
});

describe("buildScheduleRequestFromSchedule — pausar/reanudar es PUT completo", () => {
  it("invierte active sin omitir ningún campo de la fila", () => {
    const row = scheduleRow({
      id: 5,
      reportType: "INDIVIDUAL",
      athleteId: 7,
      category: "JUVENIL",
      cronExpression: "0 30 7 * * MON",
      timezone: "Europe/Madrid",
      active: true,
    });

    const body = buildScheduleRequestFromSchedule(row, false);

    expect(Object.keys(body).sort()).toEqual(CONTRACT_KEYS);
    expect(body).toEqual({
      reportType: "INDIVIDUAL",
      athleteId: 7,
      category: "JUVENIL",
      cronExpression: "0 30 7 * * MON",
      timezone: "Europe/Madrid",
      active: false,
    });
  });
});

describe("initialScheduleFormValues — pre-carga de la edición", () => {
  it("reconstruye el preset desde el cron y conserva el resto de la fila", () => {
    const initial = initialScheduleFormValues(
      scheduleRow({
        id: 5,
        reportType: "INDIVIDUAL",
        athleteId: 7,
        cronExpression: "0 30 7 * * MON",
        timezone: "America/Mexico_City",
        active: false,
      }),
    );

    expect(initial.customCron).toBeNull();
    expect(initial.values).toEqual(
      values({
        frequency: "WEEKLY",
        weekday: "MON",
        hour: "7",
        minute: "30",
        timezone: "America/Mexico_City",
        reportType: "INDIVIDUAL",
        athleteId: "7",
        active: false,
      }),
    );
  });

  it("un cron fuera de los presets entra en modo personalizado (frequency vacía)", () => {
    const initial = initialScheduleFormValues(scheduleRow({ id: 6, cronExpression: "0 0 6 * 1 MON" }));

    expect(initial.customCron).toBe("0 0 6 * 1 MON");
    expect(initial.values.frequency).toBe("");
    // El resto de la fila SÍ se pre-carga: no se pierde nada del PUT completo.
    expect(initial.values.timezone).toBe("America/Bogota");
    expect(initial.values.active).toBe(true);
  });

  it("`timezone: null` se pre-carga como «Sin zona horaria»: el default NO la sustituye", () => {
    const initial = initialScheduleFormValues(scheduleRow({ id: 5, timezone: null }));

    expect(initial.values.timezone).toBe(NO_SCHEDULE_TIMEZONE);
  });
});

describe("ScheduleFormDialog — crear desde preset (C7)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  // Interactúa con tres Select de Radix: bajo la suite completa (38 workers) supera el
  // timeout por defecto de 5 s, así que se le da margen explícito.
  it("«Mensual, día 1, 06:00» → `0 0 6 1 * *` y confirma la próxima ejecución", { timeout: 20_000 }, async () => {
    const created = scheduleRow({
      id: 3,
      cronExpression: "0 0 6 1 * *",
      nextRunAt: "2026-11-01T11:00:00Z",
    });
    installFormRoutes({ post: created });
    renderForm();

    const user = userEvent.setup();
    await pickOption("schedule-frequency-select", "Mensual", user);
    await pickOption("schedule-type-select", "General", user);
    await pickOption("schedule-category-select", "Juvenil", user);

    // El cron se genera y se muestra read-only (no hay campo libre).
    const preview = screen.getByTestId("schedule-cron-preview");
    expect(preview).toHaveValue("0 0 6 1 * *");
    expect(preview).toHaveAttribute("readonly");

    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("POST");
    expect(callsOf("POST")).toHaveLength(1);
    expect(call.path).toBe("/report-schedules");
    expect(Object.keys(call.body as object).sort()).toEqual(CONTRACT_KEYS);
    expect(call.body).toEqual({
      reportType: "GENERAL",
      athleteId: null,
      category: "JUVENIL",
      cronExpression: "0 0 6 1 * *",
      timezone: "America/Bogota",
      active: true,
    });

    // Confirmación con el `nextRunAt` que devolvió el servidor (nunca calculado aquí).
    const nextRun = await screen.findByTestId("schedule-next-run");
    expect(nextRun).toHaveTextContent("Próxima ejecución:");
    expect(nextRun).toHaveTextContent(formatInstantDateTime(created.nextRunAt as string));
  });

  it("sin tipo de reporte bloquea el envío (no llama al back)", async () => {
    installFormRoutes();
    renderForm();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("schedule-submit"));

    expect(await screen.findByText("Selecciona el tipo de reporte")).toBeInTheDocument();
    expect(callsOf("POST")).toHaveLength(0);
    expect(callsOf("PUT")).toHaveLength(0);
  });

  it("el switch de activo envía `active: false` cuando se desactiva", { timeout: 20_000 }, async () => {
    installFormRoutes();
    renderForm();

    const user = userEvent.setup();
    await pickOption("schedule-type-select", "General", user);
    await user.click(screen.getByTestId("schedule-active-switch"));
    expect(screen.getByTestId("schedule-active-switch")).toHaveAttribute("data-state", "unchecked");

    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("POST");
    expect(call.body).toMatchObject({ active: false });
  });

  it("un 400 de cron se traduce al mensaje seguro, nunca al texto crudo", { timeout: 20_000 }, async () => {
    installFormRoutes({
      post: () =>
        Promise.reject(
          new ApiError(400, {
            status: 400,
            error: "Bad Request",
            message: "Expresión cron inválida: 0 0 6 1 * *",
          }),
        ),
    });
    renderForm();

    const user = userEvent.setup();
    await pickOption("schedule-type-select", "General", user);
    await user.click(screen.getByTestId("schedule-submit"));

    const banner = await screen.findByTestId("schedule-form-error");
    expect(banner).toHaveTextContent(SCHEDULE_INVALID_CRON_MESSAGE);
    expect(banner).not.toHaveTextContent("Expresión cron inválida");
  });

  it("alta: el select de zona arranca en el default America/Bogota y el POST la envía", { timeout: 20_000 }, async () => {
    installFormRoutes();
    renderForm();

    expect(screen.getByTestId("schedule-timezone-select")).toHaveTextContent("America/Bogota");

    const user = userEvent.setup();
    await pickOption("schedule-type-select", "General", user);
    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("POST");
    expect(call.body).toMatchObject({ timezone: "America/Bogota" });
  });

  it("alta: elegir «Sin zona horaria» envía `timezone: null` con el cuerpo completo", { timeout: 20_000 }, async () => {
    installFormRoutes();
    renderForm();

    const user = userEvent.setup();
    await pickOption("schedule-type-select", "General", user);
    await pickOption("schedule-timezone-select", NO_SCHEDULE_TIMEZONE_LABEL, user);
    expect(screen.getByTestId("schedule-timezone-select")).toHaveTextContent(
      NO_SCHEDULE_TIMEZONE_LABEL,
    );

    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("POST");
    expect(Object.keys(call.body as object).sort()).toEqual(CONTRACT_KEYS);
    expect(call.body).toMatchObject({ timezone: null });
  });
});

describe("ScheduleFormDialog — editar (PUT completo, C7)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("pre-carga la fila entera y hace PUT con TODOS los campos", { timeout: 20_000 }, async () => {
    const row = scheduleRow({
      id: 5,
      reportType: "INDIVIDUAL",
      athleteId: 7,
      cronExpression: "0 30 7 * * MON",
      timezone: "America/Mexico_City",
      active: false,
    });
    installFormRoutes({ put: row });
    renderForm(row);

    // Preset reconstruido desde el cron + resto de campos pre-cargados.
    expect(screen.getByTestId("schedule-cron-preview")).toHaveValue("0 30 7 * * MON");
    expect(screen.getByTestId("schedule-frequency-select")).toHaveTextContent("Semanal");
    expect(screen.getByTestId("schedule-weekday-select")).toHaveTextContent("Lunes");
    expect(screen.getByTestId("schedule-timezone-select")).toHaveTextContent("America/Mexico_City");
    expect(screen.getByTestId("schedule-type-select")).toHaveTextContent("Individual");
    expect(screen.getByTestId("schedule-active-switch")).toHaveAttribute("data-state", "unchecked");
    await waitFor(() =>
      expect(screen.getByTestId("schedule-athlete-select")).toHaveTextContent("Michael Phelps"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("PUT");
    expect(callsOf("PUT")).toHaveLength(1);
    expect(call.path).toBe("/report-schedules/5");
    expect(Object.keys(call.body as object).sort()).toEqual(CONTRACT_KEYS);
    expect(call.body).toEqual({
      reportType: "INDIVIDUAL",
      athleteId: 7,
      category: null,
      cronExpression: "0 30 7 * * MON",
      timezone: "America/Mexico_City",
      active: false,
    });

    await screen.findByTestId("schedule-next-run");
  });

  it("`active: null` (nullable del wire) pre-carga el switch APAGADO y el PUT reenvía `active: false`", { timeout: 20_000 }, async () => {
    /*
     * `ReportScheduleResponse.java` declara `Boolean active`: el servidor puede mandar
     * `null` y el scheduler solo ejecuta `active = TRUE`, así que el form lo trata como
     * NO activa (switch apagado) en vez de dejarlo pasar como booleano primitivo.
     */
    const row = scheduleRow({ id: 8, active: null });
    installFormRoutes({ put: row });
    renderForm(row);

    expect(screen.getByTestId("schedule-active-switch")).toHaveAttribute("data-state", "unchecked");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("PUT");
    expect(callsOf("PUT")).toHaveLength(1);
    expect(call.path).toBe("/report-schedules/8");
    expect(call.body).toMatchObject({ active: false });
  });

  it("un cron que no encaja en los presets no se puede guardar sin re-elegir frecuencia", { timeout: 20_000 }, async () => {
    const row = scheduleRow({ id: 6, cronExpression: "0 0 6 * 1 MON" });
    installFormRoutes({ put: scheduleRow({ id: 6, cronExpression: "0 0 6 * * *" }) });
    renderForm(row);

    // Modo personalizado: el cron de la fila se muestra crudo y avisa.
    expect(await screen.findByTestId("schedule-custom-cron")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-cron-preview")).toHaveValue("0 0 6 * 1 MON");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("schedule-submit"));

    // El PUT no sale con un cron que la UI no puede representar.
    expect(await screen.findByText("Elige una frecuencia para la programación")).toBeInTheDocument();
    expect(callsOf("PUT")).toHaveLength(0);

    // Al elegir un preset, la expresión se regenera y el PUT sale completo.
    await pickOption("schedule-frequency-select", "Diario", user);
    expect(screen.queryByTestId("schedule-custom-cron")).not.toBeInTheDocument();
    expect(screen.getByTestId("schedule-cron-preview")).toHaveValue("0 0 6 * * *");

    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("PUT");
    expect(Object.keys(call.body as object).sort()).toEqual(CONTRACT_KEYS);
    expect(call.body).toEqual({
      reportType: "GENERAL",
      athleteId: null,
      category: null,
      cronExpression: "0 0 6 * * *",
      timezone: "America/Bogota",
      active: true,
    });
  });

  it("fila con `timezone: null`: select en «Sin zona horaria» y el PUT reenvía null (round-trip fiel)", { timeout: 20_000 }, async () => {
    /*
     * M3: el default NO sustituye un null persistido — el PUT es completo, así que
     * pre-cargar America/Bogota mutaría silenciosamente un dato almacenado.
     */
    const row = scheduleRow({ id: 5, timezone: null });
    installFormRoutes({ put: row });
    renderForm(row);

    expect(screen.getByTestId("schedule-timezone-select")).toHaveTextContent(
      NO_SCHEDULE_TIMEZONE_LABEL,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("PUT");
    expect(callsOf("PUT")).toHaveLength(1);
    expect(call.path).toBe("/report-schedules/5");
    expect(Object.keys(call.body as object).sort()).toEqual(CONTRACT_KEYS);
    expect(call.body).toEqual({
      reportType: "GENERAL",
      athleteId: null,
      category: null,
      cronExpression: "0 0 6 * * *",
      timezone: null,
      active: true,
    });
  });

  it("fila con `timezone: \"America/Bogota\"`: preseleccionada y el PUT la reenvía", { timeout: 20_000 }, async () => {
    const row = scheduleRow({ id: 5, timezone: "America/Bogota" });
    installFormRoutes({ put: row });
    renderForm(row);

    expect(screen.getByTestId("schedule-timezone-select")).toHaveTextContent("America/Bogota");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("schedule-submit"));

    const [call] = callsOf("PUT");
    expect(call.body).toMatchObject({ timezone: "America/Bogota" });
  });
});
