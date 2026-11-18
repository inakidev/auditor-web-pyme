// Detección heurística de idioma (es, en, pt) con palabras frecuentes y distintivas.
// Es una pista, no una certeza: los hallazgos que la usan se redactan con cautela.

const WORDS: Record<'es' | 'en' | 'pt', ReadonlySet<string>> = {
  es: new Set(
    'el la los las y del por para con una es más pero sus como está nuestro nuestra nuestros tu tus también servicios sobre desde hasta todos todas pedí turno turnos zona mejores atendemos'.split(
      ' ',
    ),
  ),
  en: new Set(
    'the and of to in is you your for with our we are this that from about services home welcome best family online clinic'.split(
      ' ',
    ),
  ),
  pt: new Set(
    'o os um uma não você são mais com do da dos das em na nas no nos ao seu sua serviços também melhores'.split(
      ' ',
    ),
  ),
};

const MIN_HITS = 2;

export type Language = keyof typeof WORDS;

/** Devuelve el idioma más probable, o null si el texto no alcanza para decidir. */
export function detectLanguage(text: string): Language | null {
  const tokens = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const scores = (Object.keys(WORDS) as Language[])
    .map((lang) => ({ lang, hits: tokens.filter((t) => WORDS[lang].has(t)).length }))
    .sort((a, b) => b.hits - a.hits);
  const [best, second] = scores as [
    { lang: Language; hits: number },
    { lang: Language; hits: number },
  ];
  if (best.hits < MIN_HITS || best.hits < second.hits * 1.5) return null;
  return best.lang;
}
