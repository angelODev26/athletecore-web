import type { Page } from "@playwright/test";

/*
 * Helpers de interacción con la UI real compartidos por los specs.
 * Los selects de Radix montan su listbox en un portal: hay que abrir el trigger
 * por testid y elegir la opción por su etiqueta visible.
 */
export async function selectRadixOption(
  page: Page,
  triggerTestId: string,
  optionLabel: string,
): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole("option", { name: optionLabel }).click();
}
