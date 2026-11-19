import type { AuditView, Finding } from '@auditor/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './App.js';
import { FindingsList } from './components/FindingsList.js';
import { phaseProgress } from './lib/report.js';

// renderToStaticMarkup no agrega separadores de texto: se comparan cadenas planas.
const plain = (html: string) => html.replace(/<!-- -->/g, '');

function renderAt(path: string, client = new QueryClient()): string {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return plain(
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  );
}

const finding = (over: Partial<Finding>): Finding => ({
  checkId: 'SEC-05',
  category: 'security',
  status: 'fail',
  severity: 'medium',
  title: 'Falta la cabecera HSTS',
  evidence: null,
  recommendation: 'Agregá HSTS.',
  effort: 'low',
  ...over,
});

describe('P1: portada', () => {
  it('muestra el formulario con los textos del wireframe', () => {
    const html = renderAt('/');
    expect(html).toContain('Revisá tu sitio web en un minuto');
    expect(html).toMatch(/<label[^>]*for="url"/);
    expect(html).toContain('Auditar mi sitio');
    expect(html).toContain('Solo hacemos un análisis pasivo');
  });

  it('una ruta desconocida muestra un mensaje en español', () => {
    expect(renderAt('/no-existe')).toContain('No encontramos esta página');
  });
});

describe('FindingsList', () => {
  const malicious = finding({
    checkId: 'SEC-07',
    severity: 'low',
    title: '<img src=x onerror=alert(1)>',
    evidence: '<script>alert("xss")</script>',
  });

  it('muestra la evidencia siempre escapada (nunca como HTML)', () => {
    const html = renderToStaticMarkup(<FindingsList findings={[malicious]} />);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('en lo que no cumple muestra severidad y esfuerzo; en lo que cumple, no', () => {
    const html = plain(
      renderToStaticMarkup(
        <FindingsList
          findings={[malicious, finding({ checkId: 'SEC-01', status: 'pass', title: 'HTTPS ok' })]}
        />,
      ),
    );
    expect(html).toContain('No cumple');
    expect(html).toContain('Esfuerzo: bajo');
    expect(html.match(/Severidad:/g)).toHaveLength(1);
    expect(html).toContain('Seguridad');
  });

  it('explica qué significa "No evaluado"', () => {
    const html = renderToStaticMarkup(
      <FindingsList findings={[finding({ status: 'not_evaluated', title: 'Sin datos' })]} />,
    );
    expect(html).toContain('no cuenta para el puntaje');
  });
});

describe('estados del informe', () => {
  const token = 'B'.repeat(43);
  const base: AuditView = {
    status: 'queued',
    url: 'https://ejemplo.com/',
    createdAt: '2026-11-18T12:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-12-18T12:00:00.000Z',
    error: null,
    findings: [],
    scores: null,
    phase: null,
  };
  const renderWith = (view: AuditView) => {
    const client = new QueryClient();
    client.setQueryData(['audit', token], view);
    return renderAt(`/informe/${token}`, client);
  };

  it('arranca mostrando que se está cargando', () => {
    expect(renderAt(`/informe/${token}`)).toContain('Cargando');
  });

  it('P2: en la fila muestra todas las fases pendientes', () => {
    const html = renderWith(base);
    expect(html).toContain('Estamos revisando ejemplo.com');
    expect(html).toContain('0 %');
    expect(html).toContain('Podés guardar este enlace y volver más tarde');
  });

  it('P2: corriendo muestra la fase actual y el porcentaje calculado a partir de ella', () => {
    const html = renderWith({ ...base, status: 'running', phase: 'seo' });
    expect(html).toContain('Revisando SEO');
    expect(html).toContain(`${String(phaseProgress('seo'))} %`);
    expect(html).toMatch(/aria-valuenow="50"/);
  });

  it('failed muestra el motivo y el enlace para pedir otra', () => {
    const html = renderWith({
      ...base,
      status: 'failed',
      error: { code: 'TIMEOUT', message: 'El sitio tardó demasiado en responder.' },
    });
    expect(html).toContain('No pudimos revisar tu sitio');
    expect(html).toContain('tardó demasiado');
    expect(html).toContain('Pedir otra revisión');
  });

  it('P3: puntaje con nivel, cinco barras y lo que conviene arreglar primero', () => {
    const html = renderWith({
      ...base,
      status: 'done',
      findings: [
        finding({ checkId: 'SEC-03', severity: 'critical', title: 'Certificado vencido' }),
        finding({ checkId: 'SEO-06', category: 'seo', severity: 'high', title: 'Falta viewport' }),
        finding({ checkId: 'SEC-01', status: 'pass', severity: 'critical', title: 'HTTPS ok' }),
      ],
      scores: {
        total: 72,
        band: 'C',
        categories: { security: 60, seo: 80, analytics: 50, trust: null, performance: 100 },
        categoriesUsed: 4,
        categoriesTotal: 5,
      },
    });
    expect(html).toContain('72');
    expect(html).toContain('Nivel C');
    for (const area of ['Seguridad', 'SEO', 'Analítica', 'Confianza', 'Rendimiento']) {
      expect(html).toContain(area);
    }
    expect(html).toContain('sin datos');
    expect(html).toContain('Calculado sobre 4 de 5 áreas');
    expect(html).toContain('Qué conviene arreglar primero');
    expect(html.indexOf('Crítico')).toBeLessThan(html.indexOf('Alto'));
    expect(html).not.toContain('Descargar PDF');
  });
});

describe('phaseProgress', () => {
  it('va de 0 a 100 según la fase', () => {
    expect(phaseProgress(null)).toBe(0);
    expect(phaseProgress('validating')).toBe(0);
    expect(phaseProgress('scoring')).toBeGreaterThan(phaseProgress('seo'));
    expect(phaseProgress('scoring')).toBeLessThan(100);
  });
});
