import { expect, test } from "./fixtures/harness";

import { loginAs } from "./fixtures/session";

/*
 * F1 (design.md C5): login real contra la API.
 * (a) credenciales válidas → dashboard; (b) inválidas → "Credenciales inválidas"
 * (mismo mensaje para usuario inexistente y password errónea — anti-enumeración,
 * doc 03 §2); (c) visibilidad del nav por rol (USER sin Entrenamientos/Tabla nacional).
 */

test("admin.demo inicia sesión desde el formulario y llega al dashboard", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("login-page")).toBeVisible();

  await page.getByLabel("Usuario").fill("admin.demo");
  await page.getByLabel("Contraseña").fill("secret123");
  await page.getByTestId("login-submit").click();

  await expect(page.getByTestId("dashboard-page")).toBeVisible();
});

test("credenciales inválidas muestran el mensaje seguro anti-enumeración", async ({ page }) => {
  await page.goto("/login");

  // Caso 1: password errónea de un usuario existente.
  await page.getByLabel("Usuario").fill("admin.demo");
  await page.getByLabel("Contraseña").fill("contraseña-errónea");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toContainText("Credenciales inválidas");

  // Caso 2: usuario inexistente — el MENSAJE debe ser idéntico (no se distingue).
  await page.getByLabel("Usuario").fill("usuario-que-no-existe-e2e");
  await page.getByLabel("Contraseña").fill("lo-que-sea");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toContainText("Credenciales inválidas");

  // Sigue en /login: sin sesión no hay dashboard.
  await expect(page).toHaveURL(/\/login$/);
});

test("el nav de USER no muestra Entrenamientos ni Tabla nacional", async ({ page }) => {
  await loginAs(page, "USER");

  const nav = page.getByRole("navigation");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Entrenamientos" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Tabla nacional" })).toHaveCount(0);
});

test("el nav de ADMIN muestra Entrenamientos y Tabla nacional", async ({ page }) => {
  await loginAs(page, "ADMIN");

  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Entrenamientos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Tabla nacional" })).toBeVisible();
});
