// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api";
import type { ReportDetailResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";
import { formatInstantDateTime } from "@/shared/format/dates";

import { ReportDetailPage } from "./report-detail-page";
import { installApiRoutes } from "./test-utils";

/*
 * Fase 5 de `integrar-reportes`: detalle del reporte (`/reports/:reportId`), descarga por
 * Blob (C6) y borrado con confirmación (soft delete 204).
 *
 * La descarga se prueba con el módulo `@/lib/api` mockeado: `apiFetchBlob` es la
 * frontera (su pipeline real — Bearer, Content-Type, ErrorResponse — ya está cubierta en
 * `reports-api.test.tsx`). Aquí se verifica lo que hace la UI con el resultado: Blob URL,
 * `<a download>`, revocación inmediata y mensaje seguro ante error, sin abrir nunca un
 * blob cuando la petición falla.
 */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn(), apiFetchBlob: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);
const apiFetchBlobMock = vi.mocked(apiFetchBlob);

const createObjectURL = vi.fn((_blob: Blob) => "blob:athletecore-download");
const revokeObjectURL = vi.fn();

let clickedDownload: string | null = null;
let clickSpy: ReturnType<typeof vi.spyOn> | null = null;

afterEach(() => {
  cleanup();
  clickSpy?.mockRestore();
  clickSpy = null;
});

/** jsdom no implementa Blob URLs: se stubean y se aseveran (create/revoke). */
beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
});

function signInAs(roles: string[]) {
  const payload = {
    sub: "staff",
    roles: roles.map((role) => `ROLE_${role}`),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encoded = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  useSessionStore.setState({
    tokens: { access: `.${encoded}.` },
    expiresAt: Date.now() + 3_600_000,
  });
}

const EXPORT = {
  id: 3,
  reportId: 9,
  format: "PDF",
  fileName: "reporte-9.pdf",
  fileSizeBytes: 48213,
  contentType: "application/pdf",
  createdAt: "2026-09-01T10:00:05Z",
};

function reportDetail(
  overrides: Partial<ReportDetailResponse> & { id: number },
): ReportDetailResponse {
  return {
    reportType: "INDIVIDUAL",
    athleteId: 7,
    category: null,
    year: 2026,
    month: 3,
    title: "Informe marzo",
    status: "GENERATED",
    errorMessage: null,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:01Z",
    exports: [EXPORT],
    ...overrides,
  };
}

function apiError(status: number, message: string): ApiError {
  return new ApiError(status, { status, error: "", message });
}

function renderPage(path = "/reports/9") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports/:reportId" element={<ReportDetailPage />} />
        <Route path="/reports" element={<div data-testid="reports-library-mock" />} />
        <Route path="/reports/equipo" element={<div data-testid="reports-team-mock" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

function installDetailRoutes(detail: ReportDetailResponse = reportDetail({ id: 9 })) {
  installApiRoutes([
    { match: /^\/reports\/9$/, method: "DELETE", resolve: undefined },
    { match: /^\/reports\/9$/, resolve: detail },
  ]);
}

function captureAnchorClick() {
  clickedDownload = null;
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownload = this.getAttribute("download");
    });
}

/**
 * Valor de un `MetaItem`: el formateo de fechas es a nivel de minuto, así que varias
 * filas pueden compartir texto ("01/09/2026, 10:00"). Se lee el valor desde su etiqueta
 * para no depender de unicidad de la fecha.
 */
function metaValue(page: HTMLElement, label: string): string {
  const node = within(page).getByText(label);
  return node.nextElementSibling?.textContent ?? "";
}

describe("ReportDetailPage — metadata y archivos (C5, C11)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchBlobMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("muestra la metadata completa, la tabla de exports y la descarga disponible", async () => {
    signInAs(["USER"]);
    installDetailRoutes();

    renderPage();

    const page = await screen.findByTestId("report-detail-page");
    expect(within(page).getByTestId("reports-tabs")).toBeInTheDocument();
    expect(within(page).getByText("Informe marzo")).toBeInTheDocument();
    // "Generado" también es la cabecera de la tabla de exports: se afirma sobre el badge.
    const statusBadge = within(page).getByTestId("report-status-badge");
    expect(statusBadge).toHaveTextContent("Generado");
    expect(statusBadge).toHaveAttribute("data-status", "GENERATED");
    expect(metaValue(page, "Tipo")).toBe("Individual");
    expect(metaValue(page, "Objetivo")).toBe("Atleta #7");
    expect(metaValue(page, "Período")).toBe("Marzo 2026");
    expect(metaValue(page, "Creado")).toBe(formatInstantDateTime("2026-09-01T10:00:00Z"));
    expect(metaValue(page, "Actualizado")).toBe(formatInstantDateTime("2026-09-01T10:00:01Z"));

    const exportsTable = within(page).getByTestId("report-exports-table");
    const exportRow = within(exportsTable).getByTestId("report-export-3");
    expect(within(exportRow).getByText("reporte-9.pdf")).toBeInTheDocument();
    expect(within(exportRow).getByText("PDF")).toBeInTheDocument();
    expect(within(exportRow).getByText("47,1 KB")).toBeInTheDocument();
    expect(
      within(exportRow).getByText(formatInstantDateTime("2026-09-01T10:00:05Z")),
    ).toBeInTheDocument();

    expect(within(page).getByTestId("report-download-button")).toBeEnabled();
    expect(
      within(page).getByText("Descarga el PDF del último archivo generado."),
    ).toBeInTheDocument();
  });

  it("reporte FAILED: errorMessage visible y descarga deshabilitada con el motivo", async () => {
    signInAs(["ADMIN"]);
    installDetailRoutes(
      reportDetail({
        id: 9,
        status: "FAILED",
        errorMessage: "El deportista no tiene chequeos registrados",
      }),
    );

    renderPage();

    const page = await screen.findByTestId("report-detail-page");
    expect(within(page).getByText("Fallido")).toBeInTheDocument();
    const banner = within(page).getByTestId("report-detail-generation-error");
    expect(
      within(banner).getByText("El deportista no tiene chequeos registrados"),
    ).toBeInTheDocument();

    expect(within(page).getByTestId("report-download-button")).toBeDisabled();
    expect(
      within(page).getByText("El PDF está disponible cuando el estado del reporte es «Generado»."),
    ).toBeInTheDocument();
  });

  it("GENERATED sin exports: descarga deshabilitada y explica por qué", async () => {
    signInAs(["ADMIN"]);
    installDetailRoutes(reportDetail({ id: 9, exports: [] }));

    renderPage();

    const page = await screen.findByTestId("report-detail-page");
    expect(within(page).getByTestId("report-download-button")).toBeDisabled();
    expect(
      within(page).getByText("Este reporte todavía no tiene archivos generados."),
    ).toBeInTheDocument();
    expect(within(page).getByTestId("report-exports-empty")).toBeInTheDocument();
    expect(within(page).queryByTestId("report-exports-table")).not.toBeInTheDocument();
  });

  it("404 del reporte: estado dedicado con vuelta a la biblioteca", async () => {
    signInAs(["ADMIN"]);
    installApiRoutes([
      { match: /^\/reports\/9$/, resolve: () => Promise.reject(apiError(404, "Reporte no encontrado")) },
    ]);

    renderPage();

    const notFound = await screen.findByTestId("report-not-found");
    expect(within(notFound).getByText("Reporte no encontrado")).toBeInTheDocument();
    expect(within(notFound).getByRole("link", { name: "Volver a la biblioteca" })).toHaveAttribute(
      "href",
      "/reports",
    );
  });

  it("id no numérico: estado «no encontrado» sin llamar al back", async () => {
    signInAs(["ADMIN"]);
    installDetailRoutes();

    renderPage("/reports/abc");

    expect(await screen.findByTestId("report-not-found")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe("ReportDetailPage — descarga por Blob (C6)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchBlobMock.mockReset();
    localStorage.clear();
    signInAs(["ADMIN"]);
    captureAnchorClick();
  });

  it("descarga el PDF con el nombre del Content-Disposition y libera la Blob URL", async () => {
    installDetailRoutes();
    const blob = new Blob(["%PDF-1.4 contenido"], { type: "application/pdf" });
    apiFetchBlobMock.mockResolvedValue({ blob, fileName: "export-9-2026-09.pdf" });

    renderPage();
    const button = await screen.findByTestId("report-download-button");

    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(1));
    expect(apiFetchBlobMock).toHaveBeenCalledWith("/reports/9/export");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickedDownload).toBe("export-9-2026-09.pdf");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:athletecore-download");
    expect(screen.queryByTestId("report-download-error")).not.toBeInTheDocument();
  });

  it("sin Content-Disposition usa el fallback reporte-{id}.pdf", async () => {
    installDetailRoutes();
    apiFetchBlobMock.mockResolvedValue({
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      fileName: null,
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("report-download-button"));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(1));
    expect(clickedDownload).toBe("reporte-9.pdf");
  });

  it("404 del export: mensaje seguro y ningún blob abierto", async () => {
    installDetailRoutes();
    apiFetchBlobMock.mockRejectedValue(apiError(404, "Reporte no encontrado"));

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("report-download-button"));

    const error = await screen.findByTestId("report-download-error");
    expect(error).toHaveAttribute("role", "alert");
    expect(within(error).getByText("El reporte no tiene un PDF descargable.")).toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(clickedDownload).toBeNull();
  });

  it("error de red desconocido: mensaje genérico, sin texto crudo ni blob", async () => {
    installDetailRoutes();
    apiFetchBlobMock.mockRejectedValue(new Error("network down"));

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("report-download-button"));

    const error = await screen.findByTestId("report-download-error");
    expect(within(error).getByText("No se pudo descargar el PDF. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(within(error).queryByText("network down")).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe("ReportDetailPage — borrado con confirmación (C9)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchBlobMock.mockReset();
    localStorage.clear();
    useSessionStore.setState({ tokens: null, expiresAt: null });
  });

  it("ADMIN cancela: no llama al back y el reporte queda intacto", async () => {
    signInAs(["ADMIN"]);
    installDetailRoutes();

    renderPage();
    await screen.findByTestId("report-detail-page");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("report-delete-button"));
    expect(await screen.findByTestId("report-delete-confirm")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByTestId("report-delete-confirm")).not.toBeInTheDocument());
    expect(apiFetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
    expect(screen.getByTestId("report-detail-page")).toBeInTheDocument();
  });

  it("ADMIN confirma: DELETE y vuelve a la biblioteca", async () => {
    signInAs(["ADMIN"]);
    installDetailRoutes();

    renderPage();
    await screen.findByTestId("report-detail-page");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("report-delete-button"));
    await user.click(within(await screen.findByTestId("report-delete-confirm")).getByRole("button", { name: "Borrar reporte" }));

    expect(await screen.findByTestId("reports-library-mock")).toBeInTheDocument();
    expect(apiFetchMock.mock.calls.some(([path, options]) => path === "/reports/9" && options?.method === "DELETE")).toBe(true);
  });

  it("DELETE 500: el diálogo permanece abierto con el mensaje seguro, sin texto crudo", async () => {
    signInAs(["ADMIN"]);
    installApiRoutes([
      {
        match: /^\/reports\/9$/,
        method: "DELETE",
        resolve: () => Promise.reject(apiError(500, "Internal Server Error")),
      },
      { match: /^\/reports\/9$/, resolve: reportDetail({ id: 9 }) },
    ]);

    renderPage();
    await screen.findByTestId("report-detail-page");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("report-delete-button"));
    await user.click(
      within(await screen.findByTestId("report-delete-confirm")).getByRole("button", {
        name: "Borrar reporte",
      }),
    );

    const error = await screen.findByTestId("report-delete-error");
    expect(error).toHaveAttribute("role", "alert");
    // Mensaje seguro del diccionario compartido; nunca el texto crudo del back.
    expect(
      within(error).getByText("Los datos no son válidos. Revisa los campos e inténtalo de nuevo."),
    ).toBeInTheDocument();
    expect(within(error).queryByText("Internal Server Error")).not.toBeInTheDocument();
    // El diálogo NO se cerró ni se navegó a la biblioteca: el usuario puede reintentar.
    expect(screen.getByTestId("report-delete-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("report-detail-page")).toBeInTheDocument();
    expect(screen.queryByTestId("reports-library-mock")).not.toBeInTheDocument();
  });

  it("DELETE falla sin ser ApiError (red caída): fallback seguro dentro del diálogo", async () => {
    signInAs(["ADMIN"]);
    installApiRoutes([
      {
        match: /^\/reports\/9$/,
        method: "DELETE",
        resolve: () => Promise.reject(new TypeError("network down")),
      },
      { match: /^\/reports\/9$/, resolve: reportDetail({ id: 9 }) },
    ]);

    renderPage();
    await screen.findByTestId("report-detail-page");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("report-delete-button"));
    await user.click(
      within(await screen.findByTestId("report-delete-confirm")).getByRole("button", {
        name: "Borrar reporte",
      }),
    );

    const error = await screen.findByTestId("report-delete-error");
    expect(within(error).getByText("No se pudo borrar el reporte. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(within(error).queryByText("network down")).not.toBeInTheDocument();
    expect(screen.getByTestId("report-delete-confirm")).toBeInTheDocument();
  });

  it("DELETE 404: cierra el diálogo y vuelve a la biblioteca (comportamiento actual)", async () => {
    signInAs(["ADMIN"]);
    installApiRoutes([
      {
        match: /^\/reports\/9$/,
        method: "DELETE",
        resolve: () => Promise.reject(apiError(404, "Reporte no encontrado")),
      },
      { match: /^\/reports\/9$/, resolve: reportDetail({ id: 9 }) },
    ]);

    renderPage();
    await screen.findByTestId("report-detail-page");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("report-delete-button"));
    await user.click(
      within(await screen.findByTestId("report-delete-confirm")).getByRole("button", {
        name: "Borrar reporte",
      }),
    );

    expect(await screen.findByTestId("reports-library-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("report-delete-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-delete-error")).not.toBeInTheDocument();
  });

  it("cancelar tras un error y reabrir el diálogo arranca sin el mensaje anterior", async () => {
    signInAs(["ADMIN"]);
    installApiRoutes([
      {
        match: /^\/reports\/9$/,
        method: "DELETE",
        resolve: () => Promise.reject(apiError(500, "Internal Server Error")),
      },
      { match: /^\/reports\/9$/, resolve: reportDetail({ id: 9 }) },
    ]);

    renderPage();
    await screen.findByTestId("report-detail-page");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("report-delete-button"));
    const dialog = await screen.findByTestId("report-delete-confirm");
    await user.click(within(dialog).getByRole("button", { name: "Borrar reporte" }));
    await screen.findByTestId("report-delete-error");

    // Cancelar cierra el diálogo con el error dentro.
    await user.click(
      within(screen.getByTestId("report-delete-confirm")).getByRole("button", { name: "Cancelar" }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("report-delete-confirm")).not.toBeInTheDocument(),
    );

    // Reabrir arranca limpio: el error del intento anterior no sobrevive.
    await user.click(screen.getByTestId("report-delete-button"));
    const reopened = await screen.findByTestId("report-delete-confirm");
    expect(within(reopened).queryByTestId("report-delete-error")).not.toBeInTheDocument();
  });

  it("USER: sin botón de borrar (la descarga sigue disponible)", async () => {
    signInAs(["USER"]);
    installDetailRoutes();

    renderPage();
    await screen.findByTestId("report-detail-page");

    const page = screen.getByTestId("report-detail-page");
    expect(within(page).queryByTestId("report-delete-button")).not.toBeInTheDocument();
    expect(within(page).queryByRole("button", { name: /borrar/i })).not.toBeInTheDocument();
    expect(within(page).getByTestId("report-download-button")).toBeInTheDocument();
  });
});
