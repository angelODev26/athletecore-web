import {
  addCheckupTime,
  createAthlete,
  deleteReservedReferenceTriple,
  ensureReferenceTriple,
  fetchCheckupComparison,
  fetchCheckupDetail,
  softDeleteAthlete,
  softDeleteCheckup,
  type E2eApi,
} from "./fixtures/api";
import { expect, test, type Page } from "./fixtures/harness";
import { openApp } from "./fixtures/session";

/*
 * F4 (design.md C5): registro de chequeo + tiempo `mm:ss.fff` + comparación contra
 * el triple de referencia RESERVADO (MARIPOSA/999/INFANTIL). Regla dura (5.2): el
 * front nunca formatea — el `timeFormatted`, el `trialTimeFormatted`, los
 * `referenceTimeFormatted` y los deltas `absoluteDiffFormatted` que se asertan en
 * el DOM son EXACTAMENTE los que devuelve la API.
 */

const MONTH_NAME = "Marzo";

test("el tiempo del servidor se renderiza exacto en chequeo y comparación", async ({ page, cleanup }) => {
  const token = await openApp(page, "ADMIN");
  const api: E2eApi = { request: page.request, token };

  const athlete = await createAthlete(api, "chequeo");
  cleanup.add(() => softDeleteAthlete(api, athlete.id));
  // Triple reservado completo ANTES de comparar (re-asegurado por si otra sesión lo mutó).
  await ensureReferenceTriple(api);
  cleanup.add(() => deleteReservedReferenceTriple(api));

  // ── Alta del chequeo desde la UI ──
  await page.goto(`/athletes/${athlete.id}/chequeos`);
  await expect(page.getByTestId("athlete-checkups-page")).toBeVisible();
  await page.getByTestId("checkup-new-button").click();
  await expect(page.getByTestId("checkup-form-dialog")).toBeVisible();

  await selectRadixOption(page, "checkup-form-month", MONTH_NAME);
  await page.getByTestId("checkup-form-year").fill(String(new Date().getFullYear()));
  await selectRadixOption(page, "checkup-form-category", "Infantil");
  await page.getByTestId("checkup-form-submit").click();
  await expect(page.getByTestId("checkup-form-dialog")).toBeHidden();

  // Fila nueva en la lista; el id llega del testid del botón "Abrir" (sin suposiciones).
  const row = page.getByTestId("checkups-list").getByRole("row").filter({ hasText: MONTH_NAME });
  await expect(row).toHaveCount(1);
  const openButton = row.getByTestId(/^checkup-open-/);
  const openTestId = await openButton.getAttribute("data-testid");
  const checkupId = Number(openTestId?.replace("checkup-open-", ""));
  // Limpieza registrada ya: el chequeo existe y su id es conocido (review B2).
  cleanup.add(() => softDeleteCheckup(api, checkupId));

  // ── Detalle: añadir el tiempo MARIPOSA / 999 en `mm:ss.fff` ──
  await openButton.click();
  await expect(page.getByTestId("checkup-detail-page")).toBeVisible();
  await page.getByTestId("time-new-button").click();
  await expect(page.getByTestId("time-form-dialog")).toBeVisible();

  await selectRadixOption(page, "time-style-select", "Mariposa");
  await page.getByTestId("time-distance-input").fill("999");
  await page.getByTestId("time-input").fill("01:01.500");
  await page.getByTestId("time-submit-button").click();
  await expect(page.getByTestId("time-form-dialog")).toBeHidden();

  // Regla dura: el `timeFormatted` del servidor, EXACTO en la tabla de tiempos.
  const detail = await fetchCheckupDetail(api, checkupId);
  expect(detail.times).toHaveLength(1);
  await expect(page.getByTestId("checkup-times-table")).toContainText(detail.times[0].timeFormatted);

  // ── Comparación lazy contra el triple reservado ──
  await page.getByTestId("comparison-button").click();
  await expect(page.getByTestId("comparison-panel")).toBeVisible();

  const comparisons = await fetchCheckupComparison(api, checkupId);
  expect(comparisons).toHaveLength(1);
  const comparison = comparisons[0];
  await expect(page.getByTestId("comparison-panel")).toContainText(comparison.trialTimeFormatted);
  for (const position of comparison.positions) {
    const row = page
      .getByTestId("comparison-panel")
      .getByRole("row")
      .filter({ hasText: position.referenceTimeFormatted });
    await expect(row.filter({ hasText: position.absoluteDiffFormatted })).toHaveCount(1);
  }
});

/** Abre un Radix Select por testid y elige la opción por su etiqueta visible. */
async function selectRadixOption(page: Page, triggerTestId: string, optionLabel: string): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole("option", { name: optionLabel }).click();
}
