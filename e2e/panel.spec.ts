import { expect, test } from '@playwright/test';
import { auditFromHome, login, watchConsole } from './support.js';

test.describe('del inicio de sesión al panel', () => {
  test('una contraseña incorrecta muestra un mensaje y no entra', async ({ page }) => {
    await login(page, 'incorrecta-para-e2e');
    await expect(page.getByRole('alert')).toContainText(
      'El correo o la contraseña no son correctos',
    );
    await expect(page).toHaveURL(/\/panel\/ingresar$/);
  });

  test('sin sesión, el panel manda al ingreso', async ({ page }) => {
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/panel\/ingresar$/);
  });

  test('lista, filtra, abre el detalle, borra y cierra la sesión', async ({ page }) => {
    const problems = watchConsole(page);
    await auditFromHome(page, 'panel-e2e.example.com');
    await auditFromHome(page, 'otro-panel-e2e.example.com');

    await login(page);
    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole('heading', { name: 'Auditorías' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'panel-e2e.example.com', exact: true }),
    ).toBeVisible();

    await page.getByLabel('Dominio').fill('otro-panel');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/domain=otro-panel/);
    await expect(page.getByRole('link', { name: 'otro-panel-e2e.example.com' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'panel-e2e.example.com', exact: true }),
    ).toHaveCount(0);

    await page.getByRole('link', { name: 'otro-panel-e2e.example.com' }).click();
    await expect(page.getByRole('heading', { name: 'otro-panel-e2e.example.com' })).toBeVisible();
    await expect(page.getByText('No dejó su correo.')).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Borrar auditoría' }).click();
    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole('link', { name: 'otro-panel-e2e.example.com' })).toHaveCount(0);

    // Hasta acá, consola limpia. Después de salir, /panel recibe un 401 esperado (sin sesión)
    // que Chrome anota en la consola: por eso se verifica antes.
    expect(problems).toEqual([]);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/panel\/ingresar$/);
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/panel\/ingresar$/);
  });

  test('el correo dejado con consentimiento aparece en Contactos', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Dirección de tu sitio').fill('contacto-e2e.example.com');
    await page.getByLabel('Tu correo (opcional)').fill('duenia@contacto-e2e.example.com');
    await page.getByLabel(/Acepto que me contacten con el informe/).check();
    await page.getByRole('button', { name: 'Auditar mi sitio' }).click();
    await expect(page).toHaveURL(/\/informe\//);

    await login(page);
    await page.getByRole('link', { name: 'Contactos' }).click();
    await expect(page.getByRole('cell', { name: 'duenia@contacto-e2e.example.com' })).toBeVisible();
  });
});
