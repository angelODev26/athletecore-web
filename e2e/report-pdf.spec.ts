import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test } from "./fixtures/harness";

import {
  addCheckupTime,
  createAthlete,
  createCheckup,
  deleteReportsForAthlete,
  deleteReservedReferenceTriple,
  ensureReferenceTriple,
  softDeleteAthlete,
  softDeleteCheckup,
  type E2eApi,
} from "./fixtures/api";
import { openApp } from "./fixtures/session";
import { selectRadixOption } from "./fixtures/ui";

/*
 * F5 (design.md C5): generación síncrona de reporte INDIVIDUAL y descarga real.
 * GENERATED: submit → detalle con badge Generado → descarga (magic number `%PDF`,
 * filename que identifica el reporte). HOY el back no expone `Content-Disposition`
 * en CORS, así que la UI usa su fallback `reporte-{id}.pdf`; el nombre del servidor
 * (`reporte-individual-{id}.pdf`) queda tras el prerrequisito T12 (doc 09) y el
 * spec acepta ambos para no romper cuando el back lo cumpla.
 * FALLO de ensamblado: la 500 real del back deja el dialog abierto con
 * `report-form-error` y el mensaje SEGURO de validación (desviación 6.2: el
 * `report-generation-error` con `errorMessage` del servidor no es producible
 * contra el back actual — cubierto por los tests unit del módulo).
 */

test("reporte INDIVIDUAL se genera, navega a detalle y descarga un PDF real", async ({ page, cleanup }) => {
  const token = await openApp(page, "ADMIN");
  const api: E2eApi = { request: page.request, token };

  // Atleta CON datos: chequeo + tiempo por API (la generación individual los necesita).
  const athlete = await createAthlete(api, "pdf-con-datos");
  cleanup.add(() => softDeleteAthlete(api, athlete.id));
  const now = new Date();
  const checkup = await createCheckup(api, athlete.id, now.getFullYear(), now.getMonth() + 1, "INFANTIL");
  cleanup.add(() => softDeleteCheckup(api, checkup.id));
  await addCheckupTime(api, checkup.id, "MARIPOSA", 999, 61.5);
  // Cleanup del triple ANTES de crearlo: si `ensureReferenceTriple` falla a mitad,
  // el teardown barre igualmente la combinación reservada (idempotente).
  cleanup.add(() => deleteReservedReferenceTriple(api));
  await ensureReferenceTriple(api);
  // El reporte lo crea la UI: barrer por atleta antes de enviar cubre el fallo
  // entre la 201 y el detalle (idempotente; 404 tolerado).
  cleanup.add(() => deleteReportsForAthlete(api, athlete.id));

  const title = `Reporte E2E ${Date.now()}`;

  // ── Generación desde la biblioteca ──
  await page.goto("/reports");
  await expect(page.getByTestId("reports-library-page")).toBeVisible();
  await page.getByTestId("report-new-button").click();
  await expect(page.getByTestId("report-form")).toBeVisible();

  await selectRadixOption(page, "report-type-select", "Individual");
  await selectRadixOption(page, "report-athlete-select", athlete.fullName);
  await page.getByTestId("report-title-input").fill(title);
  // Re-asegurado justo antes del ensamblado: otra sesión pudo borrarlo durante el test.
  await ensureReferenceTriple(api);
  await page.getByTestId("report-submit").click();

  // La 201 llega GENERATED: el dialog se cierra y navega al detalle con badge Generado.
  await expect(page.getByTestId("report-detail-page")).toBeVisible();
  await expect(page.getByTestId("report-status-badge")).toHaveText("Generado");
  await expect(page.getByTestId("report-detail-page")).toContainText(title);

  const reportId = Number(new URL(page.url()).pathname.split("/").pop());
  if (!Number.isInteger(reportId) || reportId <= 0) {
    throw new Error(`el detalle no expone el id del reporte en la URL: "${page.url()}"`);
  }

  // ── Descarga real: filename discriminativo + magic number %PDF + tamaño > 0 ──
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("report-download-button").click();
  const download = await downloadPromise;

  const suggestedName = download.suggestedFilename();
  // HOY el front usa su fallback (`reporte-{id}.pdf`) porque el back no expone
  // `Content-Disposition` en CORS (T12); se acepta también el nombre del servidor
  // para cuando ese prerrequisito se cumpla. En ambos casos el id es el del reporte.
  expect(
    suggestedName === `reporte-individual-${reportId}.pdf` || suggestedName === `reporte-${reportId}.pdf`,
    `el filename debe identificar este reporte (servidor o fallback de la UI): "${suggestedName}"`,
  ).toBe(true);

  const filePath = join(tmpdir(), suggestedName);
  await download.saveAs(filePath); // materializa el binario en tmp
  const bytes = await readFile(filePath);
  await unlink(filePath);
  expect(bytes.length, "el PDF descargado no puede estar vacío").toBeGreaterThan(0);
  expect(bytes.subarray(0, 4).toString("latin1"), "todo PDF empieza con el magic number %PDF").toBe("%PDF");
});

test("reporte INDIVIDUAL con referencia incompleta: el dialog permanece con mensaje seguro", async ({ page, cleanup }) => {
  const token = await openApp(page, "ADMIN");
  const api: E2eApi = { request: page.request, token };

  /*
   * DESVIACIÓN 6.2 documentada (gana el código del back, ver tasks.md): el
   * "201 FAILED + errorMessage" del diseño NO es producible contra el backend
   * real. El fallo de ensamblado determinista es un tiempo cuyo (style, distance)
   * no tiene triple completo en la tabla nacional — pero la excepción cruza
   * proxies @Transactional anidados (rollback-only) y el back responde 500.
   * Lo asertable contra el backend real HOY: el dialog permanece abierto y la UI
   * muestra un mensaje seguro (SAFE_FALLBACK_VALIDATION), nunca el texto crudo.
   * Distancia 999999: imposible que otra sesión la siembre (la reservada E2E es 999).
   */
  const athlete = await createAthlete(api, "pdf-fallido");
  cleanup.add(() => softDeleteAthlete(api, athlete.id));
  const now = new Date();
  const checkup = await createCheckup(api, athlete.id, now.getFullYear(), now.getMonth() + 1, "INFANTIL");
  cleanup.add(() => softDeleteCheckup(api, checkup.id));
  await addCheckupTime(api, checkup.id, "MARIPOSA", 999999, 61.5);
  // Si el back llegara a responder 201 FAILED (T11), el sweep borra el reporte igual.
  cleanup.add(() => deleteReportsForAthlete(api, athlete.id));

  await page.goto("/reports");
  await expect(page.getByTestId("reports-library-page")).toBeVisible();
  await page.getByTestId("report-new-button").click();
  await expect(page.getByTestId("report-form")).toBeVisible();

  await selectRadixOption(page, "report-type-select", "Individual");
  await selectRadixOption(page, "report-athlete-select", athlete.fullName);
  await page.getByTestId("report-title-input").fill(`Reporte E2E fallido ${Date.now()}`);
  await page.getByTestId("report-submit").click();

  // El error del servidor (500) NO cierra el dialog y se redacta con mensaje seguro.
  const formError = page.getByTestId("report-form-error");
  await expect(formError).toBeVisible();
  await expect(formError).toContainText("Los datos no son válidos. Revisa los campos e inténtalo de nuevo.");
  // El texto crudo del back jamás se filtra al usuario.
  await expect(formError).not.toContainText("UnexpectedRollbackException");
});
