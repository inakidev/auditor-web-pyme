import { describe, expect, it } from 'vitest';
import {
  MAX_PATTERN_LENGTH,
  MAX_ROBOTS_RULES,
  isPathAllowed,
  matchesPattern,
  parseRobots,
} from '../../src/crawl/robots.js';

const UA = 'AuditorWebPyme';

describe('matchesPattern (RFC 9309, iterativo)', () => {
  it.each([
    ['/', '/cualquier/cosa', true],
    ['/admin', '/admin/panel', true],
    ['/admin', '/administrar', true],
    ['/admin$', '/admin', true],
    ['/admin$', '/admin/', false],
    ['/*.pdf$', '/docs/guia.pdf', true],
    ['/*.pdf$', '/docs/guia.pdf?x=1', false],
    ['/a*b*c', '/axxbyyc/z', true],
    ['/a*b*c', '/axxbyy', false],
    ['*', '/x', true],
    ['/privado', '/publico', false],
  ])('%s vs %s → %s', (pattern, path, expected) => {
    expect(matchesPattern(pattern, path)).toBe(expected);
  });

  it('resuelve un patrón patológico en tiempo acotado (sin backtracking exponencial)', () => {
    const pattern = `/${'*a'.repeat(200)}b`;
    const path = `/${'a'.repeat(2000)}`;
    const started = performance.now();
    expect(matchesPattern(pattern, path)).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('parseRobots e isPathAllowed', () => {
  const robots = parseRobots(
    [
      '# comentario',
      'User-agent: *',
      'Disallow: /privado',
      'Allow: /privado/publico',
      'Disallow:',
      '',
      'User-agent: AuditorWebPyme',
      'User-agent: OtroBot',
      'Disallow: /solo-para-nosotros',
      '',
      'Sitemap: https://ejemplo.com/sitemap.xml',
      'Sitemap: https://cdn.otro.com/mapa.xml',
    ].join('\n'),
  );

  it('usa el grupo más específico para nuestro User-Agent', () => {
    expect(isPathAllowed(robots, UA, '/solo-para-nosotros')).toBe(false);
    expect(isPathAllowed(robots, UA, '/privado')).toBe(true);
  });

  it('con el grupo *, gana la regla más larga y, ante empate, allow', () => {
    expect(isPathAllowed(robots, 'Cualquiera', '/privado/x')).toBe(false);
    expect(isPathAllowed(robots, 'Cualquiera', '/privado/publico/x')).toBe(true);
    const tie = parseRobots('User-agent: *\nDisallow: /x\nAllow: /x');
    expect(isPathAllowed(tie, UA, '/x')).toBe(true);
  });

  it('junta los sitemaps declarados', () => {
    expect(robots.sitemaps).toEqual([
      'https://ejemplo.com/sitemap.xml',
      'https://cdn.otro.com/mapa.xml',
    ]);
  });

  it('detecta cuando se bloquea todo el sitio', () => {
    expect(parseRobots('User-agent: *\nDisallow: /').blocksAll).toBe(true);
    expect(parseRobots('User-agent: *\nDisallow: /\nAllow: /$').blocksAll).toBe(true);
    expect(robots.blocksAll).toBe(false);
  });

  it('sin grupos que apliquen, permite todo', () => {
    expect(isPathAllowed(parseRobots(''), UA, '/x')).toBe(true);
  });

  it('respeta los límites de reglas y de largo de patrón', () => {
    const many = [
      'User-agent: *',
      ...Array.from({ length: MAX_ROBOTS_RULES + 50 }, (_, i) => `Disallow: /r${String(i)}`),
    ];
    const parsed = parseRobots(many.join('\n'));
    expect(parsed.ruleCount).toBe(MAX_ROBOTS_RULES);
    const long = parseRobots(`User-agent: *\nDisallow: /${'a'.repeat(MAX_PATTERN_LENGTH + 10)}`);
    expect(long.ruleCount).toBe(0);
  });
});
