import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { auditFromHome, login, watchConsole } from './support.js';

const PUBLIC_PAGES = ['/', '/privacidad', '/terminos', '/panel/ingresar', '/no-existe'];

async function axeViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

test.describe('accesibilidad y contraste (axe, WCAG 2 A y AA)', () => {
  for (const path of PUBLIC_PAGES) {
    test(`sin violaciones en ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test('sin violaciones en el informe y en el panel', async ({ page }) => {
    await auditFromHome(page, 'axe-e2e.example.com');
    expect(await axeViolations(page)).toEqual([]);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Auditorías' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe('CSP en el navegador', () => {
  test('ninguna página produce errores de consola ni violaciones de CSP', async ({ page }) => {
    const problems = watchConsole(page);
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    await auditFromHome(page, 'csp-e2e.example.com');
    expect(problems).toEqual([]);
  });
});

test.describe('móvil (375 px)', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('ninguna página necesita scroll horizontal', async ({ page }) => {
    const paths = [...PUBLIC_PAGES];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await auditFromHome(page, 'movil-e2e.example.com');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'informe').toBeLessThanOrEqual(0);
  });
});

test.describe('tiempo de respuesta de la interfaz (RNF-07, medición local)', () => {
  test('las vistas que no esperan una auditoría cargan en menos de 2 s', async ({ page }, info) => {
    const results: string[] = [];
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const ms = await page.evaluate(() => {
        const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        return Math.round(nav?.loadEventEnd ?? 0);
      });
      results.push(`${path}: ${String(ms)} ms`);
      expect(ms, path).toBeLessThan(2000);
    }
    info.annotations.push({ type: 'tiempos', description: results.join(' | ') });
    console.log(`Tiempos de carga: ${results.join(' | ')}`);
  });
});
