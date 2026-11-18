// Parser de robots.txt (RFC 9309) sin dependencias. El matcher es iterativo: sin regex ni
// backtracking exponencial. Los límites acotan el costo ante archivos hostiles.

export const MAX_ROBOTS_RULES = 500;
export const MAX_PATTERN_LENGTH = 512;
const MAX_ROBOTS_CHARS = 512 * 1024;
const MAX_SITEMAPS = 20;

interface Rule {
  readonly allow: boolean;
  readonly pattern: string;
}

interface Group {
  readonly agents: string[];
  readonly rules: Rule[];
}

export interface ParsedRobots {
  readonly groups: readonly Group[];
  readonly sitemaps: readonly string[];
  readonly ruleCount: number;
  /** true si el grupo * bloquea el sitio (por ejemplo, Disallow: /). */
  readonly blocksAll: boolean;
}

export function parseRobots(text: string): ParsedRobots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  let ruleCount = 0;

  for (const rawLine of text.slice(0, MAX_ROBOTS_CHARS).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (current === null || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') {
      if (sitemaps.length < MAX_SITEMAPS && value !== '') sitemaps.push(value);
      continue;
    }
    if ((key === 'allow' || key === 'disallow') && current !== null) {
      // "Disallow:" vacío no restringe nada; patrones enormes se descartan.
      if (value === '' || value.length > MAX_PATTERN_LENGTH || ruleCount >= MAX_ROBOTS_RULES)
        continue;
      current.rules.push({ allow: key === 'allow', pattern: value });
      ruleCount += 1;
    }
  }

  const robots = { groups, sitemaps, ruleCount, blocksAll: false };
  // Bloquea todo si no deja pasar ni la portada ni una ruta interna cualquiera.
  const blocksAll =
    !isPathAllowed(robots, '*', '/') || !isPathAllowed(robots, '*', '/__auditor-probe__');
  return { ...robots, blocksAll };
}

/** Grupo del User-Agent más específico; si no hay, el de *; si tampoco, ninguno. */
function rulesFor(robots: Pick<ParsedRobots, 'groups'>, userAgent: string): Rule[] {
  // Se compara el token de producto exacto, sin versión (RFC 9309).
  const token = userAgent.toLowerCase().split('/')[0] ?? '';
  const specific = robots.groups.filter((g) => g.agents.some((a) => a !== '*' && a === token));
  const chosen =
    specific.length > 0 ? specific : robots.groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

/** Gana la regla que coincide con el patrón más largo; ante empate, allow. */
export function isPathAllowed(
  robots: Pick<ParsedRobots, 'groups'>,
  userAgent: string,
  path: string,
): boolean {
  let best: Rule | null = null;
  for (const rule of rulesFor(robots, userAgent)) {
    if (!matchesPattern(rule.pattern, path)) continue;
    if (
      best === null ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best === null || best.allow;
}

/**
 * Coincidencia de prefijo con comodín `*` y ancla final `$`. Algoritmo de dos punteros con un
 * único punto de retroceso: O(largo del patrón × largo de la ruta) en el peor caso.
 */
export function matchesPattern(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const p = anchored ? pattern.slice(0, -1) : pattern;
  let pi = 0;
  let si = 0;
  let starP = -1;
  let starS = 0;
  while (si < path.length) {
    if (pi === p.length && !anchored) return true;
    if (pi < p.length && p[pi] === '*') {
      starP = pi;
      starS = si;
      pi += 1;
    } else if (pi < p.length && p[pi] === path[si]) {
      pi += 1;
      si += 1;
    } else if (starP !== -1) {
      pi = starP + 1;
      starS += 1;
      si = starS;
    } else {
      return false;
    }
  }
  while (pi < p.length && p[pi] === '*') pi += 1;
  return pi === p.length;
}
