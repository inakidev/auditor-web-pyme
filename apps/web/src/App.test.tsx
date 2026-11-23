import type {
  AdminAuditDetail,
  AdminAuditItem,
  AdminLeadDetail,
  AdminLeadItem,
  AuditView,
  Finding,
  Page,
  PublicConfig,
} from '@auditor/shared';
import { AUDIT_RETENTION_DAYS, LEAD_RETENTION_DAYS } from '@auditor/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './App.js';
import { FindingsList } from './components/FindingsList.js';
import { ApiRequestError } from './lib/api-client.js';
import {
  SESSION_KEY,
  auditDetailKey,
  auditsKey,
  leadDetailKey,
  leadsKey,
  needsLogin,
} from './lib/panel.js';
import { phaseProgress } from './lib/report.js';
import { PUBLIC_CONFIG_KEY } from './pages/HomePage.js';

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
  guide: null,
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

  it('con la captura habilitada ofrece el correo opcional con la casilla y el aviso de privacidad', () => {
    const client = new QueryClient();
    client.setQueryData(PUBLIC_CONFIG_KEY, { contactCapture: true, demoNotice: true });
    const html = renderAt('/', client);
    expect(html).toMatch(/<input[^>]*type="email"/);
    expect(html).toContain('Tu correo (opcional)');
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
    expect(html).toContain('Acepto que me contacten con el informe');
    expect(html).toContain('href="/privacidad"');
  });

  it('el aviso de privacidad ya no dice "en preparación"', () => {
    expect(renderAt('/privacidad')).not.toContain('en preparación');
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
    expect(html.match(/Prioridad:/g)).toHaveLength(1);
    expect(html).toContain('Seguridad');
  });

  it('enlaza la guía en una pestaña nueva sin compartir el origen', () => {
    const html = renderToStaticMarkup(
      <FindingsList
        findings={[finding({ guide: 'https://developer.mozilla.org/es/docs/Web/HTTP/CSP' })]}
      />,
    );
    expect(html).toContain('href="https://developer.mozilla.org/es/docs/Web/HTTP/CSP"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it('avisa cuando la guía está en inglés', () => {
    const html = plain(
      renderToStaticMarkup(
        <FindingsList
          findings={[
            finding({
              guide: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Compression',
            }),
          ]}
        />,
      ),
    );
    expect(html).toContain('Ver una guía paso a paso (en inglés)');
  });

  it('no enlaza guías que no sean https', () => {
    const html = renderToStaticMarkup(
      <FindingsList findings={[finding({ guide: 'javascript:alert(1)' })]} />,
    );
    expect(html).not.toContain('javascript:');
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
    expect(html.indexOf('Crítica')).toBeLessThan(html.indexOf('Alta'));
    // RF-10: botón de PDF y encabezado de impresión con logo, fecha y URL.
    expect(html).toContain('Descargar PDF');
    expect(html).toContain('aria-label="Logo de Auditor Web Pyme"');
    expect(html).toContain('Informe del sitio https://ejemplo.com/');
    expect(html).toContain('Revisado el');
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

describe('P4: panel de consultores', () => {
  const session = { email: 'consultor@agencia.example.test', csrfToken: 's' };
  const withSession = () => {
    const client = new QueryClient();
    client.setQueryData(SESSION_KEY, session);
    return client;
  };
  const page = <T,>(items: T[]): Page<T> => ({ items, total: items.length, page: 1, pageSize: 20 });

  it('el ingreso pide correo y contraseña con autocompletado correcto', () => {
    const html = renderAt('/panel/ingresar');
    expect(html).toContain('Panel de consultores');
    expect(html).toMatch(
      /<input[^>]*type="email"[^>]*autoComplete="username"|autocomplete="username"/,
    );
    expect(html).toMatch(/<input[^>]*type="password"/);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain('Ingresar');
  });

  it('sin datos de sesión todavía muestra que está cargando (nunca el contenido)', () => {
    const html = renderAt('/panel');
    expect(html).toContain('Cargando');
    expect(html).not.toContain('Auditorías');
  });

  it('un 401 manda de vuelta al ingreso', () => {
    expect(needsLogin(new ApiRequestError(401, 'UNAUTHENTICATED', 'x'))).toBe(true);
    expect(needsLogin(new ApiRequestError(500, 'INTERNAL_ERROR', 'x'))).toBe(false);
    expect(needsLogin(new Error('x'))).toBe(false);
  });

  it('lista las auditorías con filtros, puntaje, contacto y paginación', () => {
    const client = withSession();
    const item: AdminAuditItem = {
      id: 7,
      url: 'https://uno.example.com/',
      domain: 'uno.example.com',
      status: 'done',
      createdAt: '2026-11-18T12:00:00.000Z',
      scoreTotal: 72,
      scoreBand: 'C',
      hasLead: true,
    };
    client.setQueryData(auditsKey(''), page([item]));
    const html = renderAt('/panel', client);
    expect(html).toContain(session.email);
    expect(html).toContain('Salir');
    for (const label of ['Dominio', 'Desde', 'Hasta', 'Puntaje mín.', 'Puntaje máx.', 'Estado']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('href="/panel/auditorias/7"');
    expect(html).toContain('72 (Nivel C)');
    expect(html).toContain('Terminada');
    expect(html).toContain('Página 1 de 1 (1 en total)');
  });

  it('lista los contactos con su consentimiento y el enlace al informe', () => {
    const client = withSession();
    const lead: AdminLeadItem = {
      id: 1,
      email: 'dueno@uno.example.com',
      domain: 'uno.example.com',
      status: 'new',
      consentAt: '2026-11-18T12:00:00.000Z',
      consentTextVersion: '2026-11-18',
      createdAt: '2026-11-18T12:00:00.000Z',
      lastAuditId: 7,
    };
    client.setQueryData(leadsKey(''), page([lead]));
    const html = renderAt('/panel/contactos', client);
    expect(html).toContain('dueno@uno.example.com');
    expect(html).toContain('Nuevo');
    expect(html).toContain('texto 2026-11-18');
    expect(html).toContain('href="/panel/auditorias/7"');
  });

  it('el detalle muestra el contacto y el informe escapado', () => {
    const client = withSession();
    const detail: AdminAuditDetail = {
      id: 7,
      domain: 'uno.example.com',
      audit: {
        status: 'done',
        url: 'https://uno.example.com/',
        createdAt: '2026-11-18T12:00:00.000Z',
        finishedAt: '2026-11-18T12:00:09.000Z',
        expiresAt: '2026-12-18T12:00:00.000Z',
        error: null,
        findings: [finding({ evidence: '<script>alert(1)</script>' })],
        scores: {
          total: 72,
          band: 'C',
          categories: { security: 60, seo: 80, analytics: 50, trust: null, performance: 100 },
          categoriesUsed: 4,
          categoriesTotal: 5,
        },
        phase: null,
      },
      lead: {
        id: 1,
        email: 'dueno@uno.example.com',
        consentAt: '2026-11-18T12:00:00.000Z',
        consentTextVersion: '2026-11-18',
      },
    };
    client.setQueryData(auditDetailKey('7'), detail);
    const html = renderAt('/panel/auditorias/7', client);
    expect(html).toContain('uno.example.com');
    expect(html).toContain('dueno@uno.example.com');
    expect(html).toContain('Nivel C');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('CSP: sin estilos inline', () => {
  it('las barras de progreso y de puntaje usan clases, no el atributo style', () => {
    const token = 'C'.repeat(43);
    const client = new QueryClient();
    client.setQueryData(['audit', token], {
      status: 'done',
      url: 'https://ejemplo.com/',
      createdAt: '2026-11-18T12:00:00.000Z',
      finishedAt: '2026-11-18T12:00:09.000Z',
      expiresAt: '2026-12-18T12:00:00.000Z',
      error: null,
      findings: [],
      scores: {
        total: 72,
        band: 'C',
        categories: { security: 60, seo: 80, analytics: 50, trust: null, performance: 100 },
        categoriesUsed: 4,
        categoriesTotal: 5,
      },
      phase: null,
    } satisfies AuditView);
    const html = renderAt(`/informe/${token}`, client);
    expect(html).not.toMatch(/style="/);
    expect(html).toContain('w-[60%]');
    const running = new QueryClient();
    running.setQueryData(['audit', token], {
      status: 'running',
      url: 'https://ejemplo.com/',
      createdAt: '2026-11-18T12:00:00.000Z',
      finishedAt: null,
      expiresAt: '2026-12-18T12:00:00.000Z',
      error: null,
      findings: [],
      scores: null,
      phase: 'seo',
    } satisfies AuditView);
    expect(renderAt(`/informe/${token}`, running)).not.toMatch(/style="/);
  });
});

describe('portada según la configuración del despliegue', () => {
  const withConfig = (config: PublicConfig) => {
    const client = new QueryClient();
    client.setQueryData(PUBLIC_CONFIG_KEY, config);
    return renderAt('/', client);
  };

  it('muestra el aviso de demo', () => {
    const html = withConfig({ contactCapture: false, demoNotice: true });
    expect(html).toContain('Esto es una demo');
    expect(html).toContain('no se conservan entre reinicios');
    expect(html).toContain('hasta un minuto');
  });

  it('con la captura apagada no ofrece dejar el correo', () => {
    const html = withConfig({ contactCapture: false, demoNotice: false });
    expect(html).not.toMatch(/type="email"/);
    expect(html).not.toContain('Esto es una demo');
  });

  it('mientras no sabe la configuración tampoco lo ofrece (falla cerrado)', () => {
    expect(renderAt('/')).not.toMatch(/type="email"/);
  });

  it('remite a los términos y pide declarar la titularidad', () => {
    const html = withConfig({ contactCapture: true, demoNotice: true });
    expect(html).toContain('href="/terminos"');
    expect(html).toContain('el sitio es tuyo o que tenés autorización');
  });
});

describe('textos legales', () => {
  it('el aviso de privacidad cubre lo pedido y coincide con las constantes de retención', () => {
    const html = renderAt('/privacidad');
    for (const text of [
      'Esto es una demo',
      'Última actualización',
      'Iñaki Nicolás Antonena',
      'iantonena@alumnos.kennedy.edu.ar',
      'Ley 25.326',
      'AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA',
      'fuera de la Argentina',
      'Render',
      'no cargues datos personales reales',
      'acceso a tus datos, que los corrijamos o que los borremos',
      'huella irreversible',
      'no usa cookies',
      'la base de datos se borra cada vez que el servicio se reinicia',
      `a los ${String(AUDIT_RETENTION_DAYS)} días`,
      `${String(LEAD_RETENTION_DAYS)} días después de la última revisión`,
    ]) {
      expect(html).toContain(text);
    }
  });

  it('los términos cubren titularidad, análisis pasivo, sin garantías y exclusión de sitios', () => {
    const html = renderAt('/terminos');
    for (const text of [
      'Esto es una demo',
      'sos titular del sitio o que tenés autorización',
      'No es una prueba de intrusión',
      'tal cual',
      'no querés que lo revisemos',
      'medianoche (hora de Buenos Aires)',
      'iantonena@alumnos.kennedy.edu.ar',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('el pie enlaza los dos textos desde cualquier página', () => {
    const html = renderAt('/');
    expect(html).toContain('href="/terminos"');
    expect(html).toContain('href="/privacidad"');
  });

  it('el detalle del panel ofrece borrar la auditoría y el contacto', () => {
    const client = new QueryClient();
    client.setQueryData(SESSION_KEY, { email: 'c@agencia.example.test', csrfToken: 's' });
    client.setQueryData(auditDetailKey('7'), {
      id: 7,
      domain: 'uno.example.com',
      audit: {
        status: 'failed',
        url: 'https://uno.example.com/',
        createdAt: '2026-11-18T12:00:00.000Z',
        finishedAt: null,
        expiresAt: '2026-12-18T12:00:00.000Z',
        error: { code: 'TIMEOUT', message: 'Tardó demasiado.' },
        findings: [],
        scores: null,
        phase: null,
      },
      lead: {
        id: 3,
        email: 'd@uno.example.com',
        consentAt: '2026-11-18T12:00:00.000Z',
        consentTextVersion: 'v',
      },
    } satisfies AdminAuditDetail);
    const html = renderAt('/panel/auditorias/7', client);
    expect(html).toContain('Borrar auditoría');
    expect(html).toContain('Borrar contacto');
  });
});

describe('seguimiento de contactos (RF-14)', () => {
  it('el detalle muestra estado, formulario de notas e historial escapado', () => {
    const client = new QueryClient();
    client.setQueryData(SESSION_KEY, { email: 'c@agencia.example.test', csrfToken: 's' });
    client.setQueryData(leadDetailKey('3'), {
      lead: {
        id: 3,
        email: 'd@uno.example.com',
        domain: 'uno.example.com',
        status: 'contacted',
        consentAt: '2026-11-18T12:00:00.000Z',
        consentTextVersion: 'v',
        createdAt: '2026-11-18T12:00:00.000Z',
        lastAuditId: 7,
      },
      events: [
        {
          id: 2,
          type: 'note',
          status: null,
          note: '<b>pidió presupuesto</b>',
          createdAt: '2026-11-19T12:00:00.000Z',
          userEmail: 'c@agencia.example.test',
        },
        {
          id: 1,
          type: 'status',
          status: 'contacted',
          note: null,
          createdAt: '2026-11-18T13:00:00.000Z',
          userEmail: 'c@agencia.example.test',
        },
      ],
    } satisfies AdminLeadDetail);
    const html = renderAt('/panel/contactos/3', client);
    expect(html).toContain('d@uno.example.com');
    expect(html).toContain('Guardar estado');
    expect(html).toContain('Agregar nota');
    expect(html).toContain('Cambió el estado a Contactado.');
    expect(html).toContain('&lt;b&gt;pidió presupuesto&lt;/b&gt;');
    expect(html).not.toContain('<b>pidió');
    expect(html).toContain('href="/panel/auditorias/7"');
  });

  it('el aviso de privacidad menciona las notas del consultor', () => {
    expect(renderAt('/privacidad')).toContain('anotar lo que hablaron');
  });
});
