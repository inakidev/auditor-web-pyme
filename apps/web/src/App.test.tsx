import type { AuditView, Finding } from '@auditor/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './App.js';
import { FindingsList } from './components/FindingsList.js';

function renderAt(path: string, client = new QueryClient()): string {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('páginas', () => {
  it('la portada muestra el formulario con su etiqueta', () => {
    const html = renderAt('/');
    expect(html).toContain('<h1');
    expect(html).toContain('Auditor Web Pyme');
    expect(html).toMatch(/<label[^>]*for="url"/);
    expect(html).toContain('Revisar mi sitio');
  });

  it('el informe arranca mostrando que se está cargando', () => {
    expect(renderAt(`/informe/${'A'.repeat(43)}`)).toContain('Cargando');
  });

  it('una ruta desconocida muestra un mensaje en español', () => {
    expect(renderAt('/no-existe')).toContain('No encontramos esta página');
  });
});

describe('FindingsList', () => {
  const malicious: Finding = {
    checkId: 'SEC-07',
    category: 'security',
    status: 'fail',
    severity: 'low',
    title: '<img src=x onerror=alert(1)>',
    evidence: '<script>alert("xss")</script>',
    recommendation: 'Agregá la cabecera.',
    effort: 'low',
  };

  it('muestra la evidencia siempre escapada (nunca como HTML)', () => {
    const html = renderToStaticMarkup(<FindingsList findings={[malicious]} />);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('muestra estado, severidad y esfuerzo en español', () => {
    const html = renderToStaticMarkup(<FindingsList findings={[malicious]} />);
    expect(html).toContain('No cumple');
    expect(html).toContain('Baja');
    expect(html).toContain('Esfuerzo: bajo');
    expect(html).toContain('Seguridad');
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
  };
  const renderWith = (view: AuditView) => {
    const client = new QueryClient();
    client.setQueryData(['audit', token], view);
    return renderAt(`/informe/${token}`, client);
  };

  it.each([
    ['queued', 'está en la fila'],
    ['running', 'está en curso'],
  ] as const)('%s muestra el progreso', (status, text) => {
    expect(renderWith({ ...base, status })).toContain(text);
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

  it('done muestra el resumen y los hallazgos', () => {
    const finding: Finding = {
      checkId: 'SEC-05',
      category: 'security',
      status: 'fail',
      severity: 'medium',
      title: 'Falta la cabecera HSTS',
      evidence: null,
      recommendation: 'Agregá HSTS.',
      effort: 'low',
    };
    const html = renderWith({ ...base, status: 'done', findings: [finding] });
    expect(html).toContain('Informe de tu sitio');
    expect(html).toMatch(/No cumple: (<!-- -->)?1/);
    expect(html).toContain('Falta la cabecera HSTS');
  });
});
