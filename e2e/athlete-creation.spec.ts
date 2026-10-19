import type { Page } from "@playwright/test";

import { uniqueSuffix, softDeleteAthlete, type E2eApi } from "./fixtures/api";
import { expect, test } from "./fixtures/harness";
import { openApp } from "./fixtures/session";

/*
 * F2 (design.md C5): alta de deportista desde la UI real.
 * Paso 1 (obligatorios del contrato 04) → paso 2 (fecha de nacimiento) →
 * paso 3 omitido ("Omitir y terminar" navega a la ficha con `recienCreado`) →
 * ficha con el nombre único → visible en `athletes-row` de la lista.
 * El atleta lo crea el WIZARD (no la fábrica por API); el cleanup se registra
 * en CUANTO la ficha revela el id en la URL — si algo falla después (p. ej. la
 * verificación en la lista), el teardown del fixture lo borra igual (review B2).
 */

test("el wizard de alta crea un deportista que aparece en la lista", async ({ page, cleanup }) => {
  const token = await openApp(page, "ADMIN");
  const api: E2eApi = { request: page.request, token };

  const suffix = uniqueSuffix("alta");
  const firstName = `Nombre_${suffix}`;
  const lastName = `Apellido_${suffix}`;
  const fullName = `${firstName} ${lastName}`;

  await page.goto("/athletes");
  await expect(page.getByTestId("athlete-create-link")).toBeVisible();
  await page.getByTestId("athlete-create-link").click();

  // ── Paso 1: obligatorios del contrato 04 (username/email/firstName/lastName) ──
  await page.getByTestId("athlete-form-username").fill(`usr_${suffix}`);
  await page.getByTestId("athlete-form-email").fill(`${suffix}@e2e.athletecore.local`);
  await page.getByTestId("athlete-form-firstName").fill(firstName);
  await page.getByTestId("athlete-form-lastName").fill(lastName);
  await page.getByTestId("athlete-form-submit").click();

  // ── Paso 2: fecha de nacimiento (opcional, la rellenamos) ──
  await page.getByTestId("athlete-birthdate-input").fill("2005-06-15");
  await page.getByTestId("athlete-step2-continue").click();

  // ── Paso 3: perfil omitido → ficha con aviso de creado ──
  await page.getByTestId("athlete-skip-step").click();
  await expect(page.getByTestId("athlete-created-notice")).toBeVisible();
  // La ficha no tiene testid de contenedor: el nombre único es la aserción de contenido.
  await expect(page.getByRole("main")).toContainText(fullName);

  // Limpieza registrada ya: el wizard terminó y la ficha expone el id en la URL.
  const athleteId = athleteIdFromUrl(page.url());
  cleanup.add(() => softDeleteAthlete(api, athleteId));

  // ── El atleta aparece en la lista (paginando si hiciera falta) ──
  await page.goto("/athletes");
  const row = await findAthleteRow(page, fullName);
  if (row === null) {
    throw new Error(`el atleta ${fullName} no apareció en la lista de deportistas`);
  }
  await expect(row).toBeVisible();
});

/** Id numérico final del path de la ficha (`/athletes/{id}`), o falla con mensaje claro. */
function athleteIdFromUrl(url: string): number {
  const id = Number(new URL(url).pathname.split("/").pop());
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`la ficha no expone el id en la URL: "${url}"`);
  }
  return id;
}

/** Busca la fila del atleta recorriendo la paginación (tope 10 páginas). */
async function findAthleteRow(page: Page, fullName: string) {
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    // La lista es server-side paginada: esperar a que la página termine de cargar.
    await expect(page.getByTestId("athletes-loading")).toHaveCount(0);
    const candidate = page.getByTestId("athletes-row").filter({ hasText: fullName });
    if ((await candidate.count()) > 0) {
      return candidate.first();
    }
    const next = page.getByTestId("athletes-pagination-next");
    if ((await next.count()) === 0 || (await next.isDisabled())) {
      return null;
    }
    await next.click();
    await expect(page.getByTestId("athletes-loading")).toHaveCount(0);
  }
  return null;
}
