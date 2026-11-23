import { expect, test } from '@playwright/test';
import { auditFromHome, watchConsole } from './support.js';

test.describe('de la URL al informe', () => {
  test('pide una auditoría, muestra el progreso y el informe completo', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    await expect(page.getByText('Esto es una demo.')).toBeVisible();
    await page.getByLabel('Dirección de tu sitio').fill('informe-e2e.example.com');
    await page.getByRole('button', { name: 'Auditar mi sitio' }).click();

    await expect(
      page.getByRole('heading', { name: /Estamos revisando informe-e2e\.example\.com/ }),
    ).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Progreso de la revisión' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Qué conviene arreglar primero' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Nivel [A-E]/).first()).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Seguridad' })).toBeVisible();
    // Lo crítico va primero.
    const critico = page.getByText('El certificado vence pronto').first();
    const medio = page.getByText('El título es muy largo').first();
    expect((await critico.boundingBox())?.y ?? 0).toBeLessThan((await medio.boundingBox())?.y ?? 0);
    // La guía abre aparte y sin compartir el origen.
    const guia = page.getByRole('link', { name: /guía/i }).first();
    await expect(guia).toHaveAttribute('rel', /noopener/);
    await expect(guia).toHaveAttribute('rel', /noreferrer/);
    expect(problems).toEqual([]);
  });

  test('la evidencia maliciosa del sitio auditado se muestra como texto y no se ejecuta', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await auditFromHome(page, 'xss-e2e.example.com');
    await page.getByText('El título es muy largo').last().click();
    await expect(
      page.getByText('<script>window.__xss = true</script>', { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss),
    ).toBeUndefined();
    expect(problems).toEqual([]);
  });
});

test.describe('errores claros', () => {
  test('una dirección que no es un sitio público muestra el motivo', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Dirección de tu sitio').fill('localhost');
    await page.getByRole('button', { name: 'Auditar mi sitio' }).click();
    await expect(page.getByRole('alert')).toContainText('no es un sitio público');
  });

  test('el mismo sitio dos veces seguidas avisa que hay que esperar', async ({ page }) => {
    await auditFromHome(page, 'cooldown-e2e.example.com');
    await page.goto('/');
    await page.getByLabel('Dirección de tu sitio').fill('cooldown-e2e.example.com');
    await page.getByRole('button', { name: 'Auditar mi sitio' }).click();
    await expect(page.getByRole('alert')).toContainText('se acaba de revisar');
  });
});
