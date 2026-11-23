import { expect, type Page } from '@playwright/test';

/** Credenciales descartables de prueba (las mismas de apps/api/src/testing/support.ts). */
export const PANEL_EMAIL = 'consultor@agencia.example.test';
export const PANEL_PASSWORD = 'contraseña-descartable-de-prueba';

/** Falla la prueba ante cualquier error de consola (incluidas las violaciones de CSP). */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  // Un diálogo inesperado indicaría HTML del sitio auditado ejecutándose.
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'confirm') problems.push(`diálogo inesperado: ${dialog.message()}`);
  });
  return problems;
}

/** Pide una auditoría desde la portada y espera el informe terminado. */
export async function auditFromHome(page: Page, url: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Dirección de tu sitio').fill(url);
  await page.getByRole('button', { name: 'Auditar mi sitio' }).click();
  await expect(page).toHaveURL(/\/informe\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole('heading', { name: 'Qué conviene arreglar primero' })).toBeVisible({
    timeout: 15_000,
  });
}

export async function login(page: Page, password = PANEL_PASSWORD): Promise<void> {
  await page.goto('/panel/ingresar');
  await page.getByLabel('Correo').fill(PANEL_EMAIL);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}
