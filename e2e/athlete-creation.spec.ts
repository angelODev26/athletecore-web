import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { CleanupRegistry, uniqueSuffix, type E2eApi } from "./fixtures/api";
import { API_ORIGIN, API_PREFIX, openApp } from "./fixtures/session";

/*
 * F2 (design.md C5): alta de deportista desde la UI real.
 * Paso 1 (obligatorios del contrato 04) → paso 2 (fecha de nacimiento) →
 * paso 3 omitido ("Omitir y terminar" navega a la ficha con `recienCreado`) →
 * ficha con el nombre único → visible en `athletes-row` de la lista.
 * El atleta lo crea el WIZARD (no la fábrica por API); el cleanup lo busca por
 * username único en el listado paginado y lo borra (soft delete, best-effort).
 */

test("el wizard de alta crea un deportista que aparece en la lista", async ({ page }) => {
  const token = await openApp(page, "ADMIN");
  const api: E2eApi = { request: page.request, token };
  const cleanup = new CleanupRegistry();

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

  // ── El atleta aparece en la lista (paginando si hiciera falta) ──
  await page.goto("/athletes");
  const row = await findAthleteRow(page, fullName);
  if (row === null) {
    throw new Error(`el atleta ${fullName} no apareció en la lista de deportistas`);
  }
  await expect(row).toBeVisible();

  await registerAthleteCleanup(api, suffix, cleanup);
  await cleanup.run();
});

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

/**
 * Limpieza best-effort del atleta creado por UI: recorre el listado paginado por
 * API buscando el username único y registra su soft delete (204).
 */
async function registerAthleteCleanup(api: E2eApi, suffix: string, cleanup: CleanupRegistry): Promise<void> {
  const username = `usr_${suffix}`;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const response = await api.request.get(
      `${API_ORIGIN}${API_PREFIX}/athletes?page=${pageNumber}&size=50&sort=lastName,asc`,
      { headers: { Authorization: `Bearer ${api.token}` } },
    );
    if (!response.ok()) {
      return;
    }
    const body = (await response.json()) as {
      content?: Array<{ id: number; username: string }>;
      last?: boolean;
    };
    for (const athlete of body.content ?? []) {
      if (athlete.username === username) {
        cleanup.add(() =>
          api.request.delete(`${API_ORIGIN}${API_PREFIX}/athletes/${athlete.id}`, {
            headers: { Authorization: `Bearer ${api.token}` },
          }),
        );
        return;
      }
    }
    if (body.last ?? true) {
      return;
    }
  }
}
