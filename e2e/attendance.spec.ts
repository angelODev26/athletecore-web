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
  // Orden de registro padre→hijo: el teardown inverso borra primero la sesión.
  cleanup.add(() => softDeletePlan(api, tree.plan.id));
  cleanup.add(() => softDeleteSession(api, tree.session.id));

  // ── Marcar desde la UI ──
  await page.goto(`/training/sessions/${tree.session.id}`);
  await expect(page.getByTestId("attendance-grid")).toBeVisible();

  await page.getByTestId(`attendance-PRESENTE-${athletePresent.id}`).click();
  await page.getByTestId(`attendance-AUSENTE-${athleteAbsent.id}`).click();

  // `aria-pressed` solo es `true` para el estado REAL de la fila: el texto de la
  // fila contiene las etiquetas de los TRES botones y nunca distingue el estado.
  const presentButton = page.getByTestId(`attendance-PRESENTE-${athletePresent.id}`);
  const absentButton = page.getByTestId(`attendance-AUSENTE-${athleteAbsent.id}`);
  await expect(presentButton).toHaveAttribute("aria-pressed", "true");
  await expect(absentButton).toHaveAttribute("aria-pressed", "true");

  // ── Recargar: los estados vienen del detalle del servidor (upsert real) ──
  await page.reload();
  await expect(page.getByTestId("attendance-grid")).toBeVisible();
  await expect(presentButton).toHaveAttribute("aria-pressed", "true");
  await expect(absentButton).toHaveAttribute("aria-pressed", "true");
  // El estado es excluyente: el botón contrario de cada fila queda sin pulsar.
  await expect(page.getByTestId(`attendance-AUSENTE-${athletePresent.id}`)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId(`attendance-PRESENTE-${athleteAbsent.id}`)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId(`attendance-unmarked-${athletePresent.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`attendance-unmarked-${athleteAbsent.id}`)).toHaveCount(0);
});
