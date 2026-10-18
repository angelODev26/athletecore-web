// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { AthleteResponse, ReportScheduleResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";
import { formatInstantDateTime } from "@/shared/format/dates";

import { ReportSchedulesPage } from "./report-schedules-page";
import { installReportSchedulePolyfills } from "./test-setup";
import { installApiRoutes } from "./test-utils";
import type { ApiRoute } from "./test-utils";

/*
 * Fase 6 de `integrar-reportes` (C7/C9): página de programaciones.
 *
 * - La tabla muestra la frecuencia legible del cron, el badge Activo/Pausado y
 *   `lastRunAt`/`nextRunAt` TAL CUAL del servidor (nunca recalculados).
 * - Pausar/Reanudar es un PUT COMPLETO con `active` invertido, sin abrir el formulario.
 * - Borrar exige confirmación (204).
 * - Solo ADMIN: sin ese rol no se renderiza la gestión ni se pide la lista (la ruta va
 *   además bajo `RequireRoles(["ADMIN"])` en el router).
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

function tokenWithRoles(roles: string[]): string {
  const payload = {
    sub: "staff",
    roles: roles.map((role) => `ROLE_${role}`),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.`;
}

function signInAs(roles: string[]) {
  useSessionStore.setState({
    tokens: { access: tokenWithRoles(roles) },
    expiresAt: Date.now() + 3_600_000,
  });
}

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

const ATHLETES_PAGE = {
  content: [athlete(7, "Michael Phelps")],
  last: true,
  totalElements: 1,
};

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

/** Escenario literal del spec: "Mensual, día 1, 06:00" para GENERAL JUVENIL. */
const MONTHLY_ROW = scheduleRow({
  id: 1,
  reportType: "GENERAL",
  category: "JUVENIL",
  cronExpression: "0 0 6 1 * *",
  active: true,
  lastRunAt: null,
});

const WEEKLY_ROW = scheduleRow({
  id: 2,
  reportType: "INDIVIDUAL",
  athleteId: 7,
  cronExpression: "0 30 7 * * MON",
  timezone: "America/Mexico_City",
  active: false,
  lastRunAt: "2026-10-05T12:30:00Z",
  nextRunAt: "2026-10-12T12:30:00Z",
});

/**
 * `active` NULLABLE del wire: `ReportScheduleResponse.java` declara `Boolean` (no
 * primitivo) y el scheduler solo ejecuta las filas con `active = TRUE`, así que un `null`
 * se presenta "Pausado" — nunca "Activo", nunca una ejecución prometida.
 */
const NULL_ACTIVE_ROW = scheduleRow({
  id: 4,
  reportType: "GENERAL",
  category: "MAYOR",
  cronExpression: "0 0 6 1 * *",
  active: null,
  nextRunAt: "2026-11-01T11:00:00Z",
});

const CONTRACT_KEYS = [
  "active",
  "athleteId",
  "category",
  "cronExpression",
  "reportType",
  "timezone",
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={["/reports/programaciones"]}>
      <ReportSchedulesPage />
    </MemoryRouter>,
    { wrapper },
  );
}

function schedulesRoutes(schedules: ReportScheduleResponse[]): ApiRoute[] {
  return [
    { match: /^\/athletes\?/, resolve: ATHLETES_PAGE },
    { match: /^\/report-schedules$/, resolve: schedules },
  ];
}

function callsOf(method: string): Array<{ path: string; body: unknown }> {
  return apiFetchMock.mock.calls
    .filter(([, options]) => options?.method === method)
    .map(([path, options]) => ({ path: path as string, body: options?.body }));
}

describe("ReportSchedulesPage — tabla de programaciones (C7)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    signInAs(["ADMIN"]);
  });

  it("muestra tipo, objetivo, frecuencia legible, zona, estado y fechas del servidor", async () => {
    installApiRoutes(schedulesRoutes([MONTHLY_ROW, WEEKLY_ROW]));
    renderPage();

    const monthly = await screen.findByTestId("schedule-row-1");
    expect(within(monthly).getByText("General")).toBeInTheDocument();
    expect(within(monthly).getByText("General · Juvenil")).toBeInTheDocument();
    expect(within(monthly).getByText("Mensual el día 1 a las 06:00")).toBeInTheDocument();
    expect(within(monthly).getByText("America/Bogota")).toBeInTheDocument();
    expect(within(monthly).getByTestId("schedule-state-1")).toHaveTextContent("Activo");
    // `lastRunAt` null → "—", y ninguna fecha se calcula en el cliente.
    expect(within(monthly).getByText("—")).toBeInTheDocument();
    expect(
      within(monthly).getByText(formatInstantDateTime(MONTHLY_ROW.nextRunAt as string)),
    ).toBeInTheDocument();

    const weekly = screen.getByTestId("schedule-row-2");
    // Nombre del deportista resuelto con el listado (el DTO solo trae athleteId).
    expect(within(weekly).getByText("Michael Phelps")).toBeInTheDocument();
    expect(within(weekly).getByText("Cada lunes a las 07:30")).toBeInTheDocument();
    expect(within(weekly).getByTestId("schedule-state-2")).toHaveTextContent("Pausado");
    expect(
      within(weekly).getByText(formatInstantDateTime(WEEKLY_ROW.lastRunAt as string)),
    ).toBeInTheDocument();
  });

  it("un cron fuera de los presets se muestra CRUDO (nunca descrito)", async () => {
    installApiRoutes(
      schedulesRoutes([scheduleRow({ id: 3, cronExpression: "0 0 6 * 1 MON" })]),
    );
    renderPage();

    const row = await screen.findByTestId("schedule-row-3");
    expect(within(row).getByText("0 0 6 * 1 MON")).toBeInTheDocument();
  });

  it("vacío: explica el estado y ofrece crear la primera programación", async () => {
    installApiRoutes(schedulesRoutes([]));
    renderPage();

    const empty = await screen.findByTestId("schedules-empty");
    expect(within(empty).getByText("Sin programaciones")).toBeInTheDocument();

    await userEvent.setup().click(within(empty).getByTestId("schedule-new-empty"));
    expect(await screen.findByTestId("schedule-form")).toBeInTheDocument();
    // Alta: el preset por defecto (diario a las 06:00) ya genera su cron.
    expect(screen.getByTestId("schedule-cron-preview")).toHaveValue("0 0 6 * * *");
  });

  it("error: estado con reintento que vuelve a pedir la lista", async () => {
    installApiRoutes([
      { match: /^\/athletes\?/, resolve: ATHLETES_PAGE },
      { match: /^\/report-schedules$/, resolve: () => Promise.reject(new Error("boom")) },
    ]);
    renderPage();

    const error = await screen.findByTestId("schedules-error");
    const user = userEvent.setup();
    await user.click(within(error).getByRole("button", { name: "Reintentar" }));

    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.filter(([path]) => path === "/report-schedules"),
      ).toHaveLength(2),
    );
  });

  it("el botón «Nueva programación» abre el formulario en modo alta", async () => {
    installApiRoutes(schedulesRoutes([MONTHLY_ROW]));
    renderPage();

    await screen.findByTestId("schedules-list");
    await userEvent.setup().click(screen.getByTestId("schedule-new-button"));

    expect(await screen.findByTestId("schedule-form")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("schedule-form")).getByText("Nueva programación"),
    ).toBeInTheDocument();
  });

  it("«Editar» abre el formulario pre-cargado con el preset de la fila", async () => {
    installApiRoutes(schedulesRoutes([WEEKLY_ROW]));
    renderPage();

    await userEvent.setup().click(await screen.findByTestId("schedule-edit-2"));

    expect(await screen.findByTestId("schedule-form")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-cron-preview")).toHaveValue("0 30 7 * * MON");
    expect(screen.getByTestId("schedule-weekday-select")).toHaveTextContent("Lunes");
  });
});

describe("ReportSchedulesPage — pausar/reanudar y borrar (C7)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    signInAs(["ADMIN"]);
  });

  it("«Pausar» envía el PUT COMPLETO con `active: false`", async () => {
    installApiRoutes(schedulesRoutes([MONTHLY_ROW]));
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("schedule-toggle-1"));

    const [call] = callsOf("PUT");
    expect(callsOf("PUT")).toHaveLength(1);
    expect(call.path).toBe("/report-schedules/1");
    expect(Object.keys(call.body as object).sort()).toEqual(CONTRACT_KEYS);
    expect(call.body).toEqual({
      reportType: "GENERAL",
      athleteId: null,
      category: "JUVENIL",
      cronExpression: "0 0 6 1 * *",
      timezone: "America/Bogota",
      active: false,
    });
  });

  it("«Reanudar» reenvía la fila entera con `active: true`", async () => {
    installApiRoutes(schedulesRoutes([WEEKLY_ROW]));
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("schedule-toggle-2"));

    const [call] = callsOf("PUT");
    expect(call.path).toBe("/report-schedules/2");
    expect(Object.keys(call.body as object).sort()).toEqual(CONTRACT_KEYS);
    expect(call.body).toEqual({
      reportType: "INDIVIDUAL",
      athleteId: 7,
      category: null,
      cronExpression: "0 30 7 * * MON",
      timezone: "America/Mexico_City",
      active: true,
    });
  });

  it("`active: null` se presenta «Pausado» (nunca «Activo») y el botón ofrece «Reanudar»", async () => {
    installApiRoutes(schedulesRoutes([NULL_ACTIVE_ROW]));
    renderPage();

    const row = await screen.findByTestId("schedule-row-4");
    const state = within(row).getByTestId("schedule-state-4");
    expect(state).toHaveTextContent("Pausado");
    expect(state).not.toHaveTextContent("Activo");
    // La `nextRunAt` futura que manda el servidor queda acompañada del estado: un `null`
    // no promete ejecución.
    expect(
      within(row).getByText(formatInstantDateTime(NULL_ACTIVE_ROW.nextRunAt as string)),
    ).toBeInTheDocument();

    const toggle = within(row).getByTestId("schedule-toggle-4");
    expect(toggle).toHaveTextContent("Reanudar");

    const user = userEvent.setup();
    await user.click(toggle);

    const [call] = callsOf("PUT");
    expect(callsOf("PUT")).toHaveLength(1);
    expect(call.path).toBe("/report-schedules/4");
    expect(Object.keys(call.body as object).sort()).toEqual(CONTRACT_KEYS);
    // Reanudar una fila con `null` reenvía `active: true` (nunca `null`).
    expect(call.body).toEqual({
      reportType: "GENERAL",
      athleteId: null,
      category: "MAYOR",
      cronExpression: "0 0 6 1 * *",
      timezone: "America/Bogota",
      active: true,
    });
  });

  it("borrar pide confirmación: cancelar no llama al back", async () => {
    installApiRoutes(schedulesRoutes([MONTHLY_ROW]));
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("schedule-delete-1"));
    expect(await screen.findByTestId("schedule-delete-confirm")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(callsOf("DELETE")).toHaveLength(0);
    expect(screen.getByTestId("schedule-row-1")).toBeInTheDocument();
  });

  it("borrar confirmado: DELETE (204) y la fila desaparece de la tabla", async () => {
    let schedules = [MONTHLY_ROW, WEEKLY_ROW];
    installApiRoutes([
      { match: /^\/athletes\?/, resolve: ATHLETES_PAGE },
      // La lista se relee tras invalidar la query: la ruta resuelve el estado ACTUAL.
      { match: /^\/report-schedules$/, resolve: () => Promise.resolve(schedules) },
      {
        match: /^\/report-schedules\/1$/,
        method: "DELETE",
        resolve: () => {
          schedules = schedules.filter((schedule) => schedule.id !== 1);
          return Promise.resolve(undefined);
        },
      },
    ]);
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("schedule-delete-1"));
    await user.click(await screen.findByTestId("schedule-delete-confirm-1"));

    await waitFor(() => expect(screen.queryByTestId("schedule-row-1")).not.toBeInTheDocument());
    expect(callsOf("DELETE")).toEqual([{ path: "/report-schedules/1", body: undefined }]);
    expect(screen.getByTestId("schedule-row-2")).toBeInTheDocument();
  });
});

describe("ReportSchedulesPage — solo ADMIN (C9)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
  });

  it("COACH no ve la gestión: sin tabla, sin tab y sin pedir la lista", async () => {
    signInAs(["COACH"]);
    renderPage();

    expect(await screen.findByTestId("forbidden-state")).toBeInTheDocument();
    expect(screen.queryByTestId("schedules-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schedules-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schedule-new-button")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("reports-tabs")).queryByRole("tab", { name: "Programaciones" }),
    ).not.toBeInTheDocument();
    expect(
      apiFetchMock.mock.calls.filter(([path]) => String(path).startsWith("/report-schedules")),
    ).toHaveLength(0);
  });

  it("USER tampoco: la programación no se renderiza ni se consulta", async () => {
    signInAs(["USER"]);
    renderPage();

    expect(await screen.findByTestId("forbidden-state")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
