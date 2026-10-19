import {
  createAthlete,
  createPlanWithCycleAndSession,
  softDeleteAthlete,
  softDeletePlan,
  softDeleteSession,
  type E2eApi,
} from "./fixtures/api";
import { expect, test } from "./fixtures/harness";
import { openApp } from "./fixtures/session";

/*
 * F3 (design.md C5): pase de lista real con upsert contra la API.
 * Plan+meso+micro+sesión y DOS atletas se crean VÍA API (rápido, ya cubierto en
 * unit); en `/training/sessions/:id` se marca a uno PRESENTE y a otro AUSENTE y
 * tras RECARGAR la página ambos estados persisten (verifica el upsert, no el render).
 */

test("las marcas de asistencia persisten tras recargar la página", async ({ page, cleanup }) => {
  const token = await openApp(page, "ADMIN");
  const api: E2eApi = { request: page.request, token };

  const athletePresent = await createAthlete(api, "asis-pres");
  const athleteAbsent = await createAthlete(api, "asis-aus");
  cleanup.add(() => softDeleteAthlete(api, athletePresent.id));
  cleanup.add(() => softDeleteAthlete(api, athleteAbsent.id));

  const tree = await createPlanWithCycleAndSession(api, "asis");
  cleanup.add(() => softDeleteSession(api, tree.session.id));
  cleanup.add(() => softDeletePlan(api, tree.plan.id));

  // ── Marcar desde la UI ──
  await page.goto(`/training/sessions/${tree.session.id}`);
  await expect(page.getByTestId("attendance-grid")).toBeVisible();

  await page.getByTestId(`attendance-PRESENTE-${athletePresent.id}`).click();
  await page.getByTestId(`attendance-AUSENTE-${athleteAbsent.id}`).click();

  // Los overrides locales se retiran cuando el detalle re-sincroniza con la API:
  // la etiqueta del servidor ("Presente"/"Ausente") confirma el guardado real.
  const presentRow = page.getByTestId(`attendance-row-${athletePresent.id}`);
  const absentRow = page.getByTestId(`attendance-row-${athleteAbsent.id}`);
  await expect(presentRow).toContainText("Presente");
  await expect(absentRow).toContainText("Ausente");

  // ── Recargar: los estados vienen del detalle del servidor (upsert real) ──
  await page.reload();
  await expect(page.getByTestId("attendance-grid")).toBeVisible();
  await expect(page.getByTestId(`attendance-row-${athletePresent.id}`)).toContainText("Presente");
  await expect(page.getByTestId(`attendance-row-${athleteAbsent.id}`)).toContainText("Ausente");
});
