import { CATEGORIES, type Scores } from '@auditor/shared';
import { CATEGORY_LABEL } from '../lib/report.js';

const SHORT_LABEL = { ...CATEGORY_LABEL, trust: 'Confianza' } as const;

/** Pantalla P3: círculo con el puntaje y el nivel, y una barra por área. */
export function ScoreSummary({ scores }: { readonly scores: Scores }) {
  return (
    <section
      aria-labelledby="puntaje"
      className="flex flex-col gap-6 rounded-lg border border-slate-300 p-4 sm:flex-row sm:items-center"
    >
      <h2 id="puntaje" className="sr-only">
        Puntaje
      </h2>
      <div className="mx-auto flex h-32 w-32 shrink-0 flex-col items-center justify-center rounded-full border-4 border-blue-900 bg-blue-50 text-blue-950">
        <span className="text-4xl font-bold">{scores.total ?? '—'}</span>
        <span className="text-sm font-medium">
          {scores.band === null ? 'Sin datos' : `Nivel ${scores.band}`}
        </span>
      </div>
      <div className="flex-1 space-y-2">
        <ul className="space-y-2">
          {CATEGORIES.map((category) => {
            const value = scores.categories[category];
            return (
              <li key={category} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2">
                <span className="text-sm">{SHORT_LABEL[category]}</span>
                <span
                  className="h-3 rounded bg-slate-200"
                  role="meter"
                  aria-label={SHORT_LABEL[category]}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={value ?? 0}
                >
                  <span
                    className="block h-3 rounded bg-blue-700"
                    style={{ width: `${String(value ?? 0)}%` }}
                  />
                </span>
                <span className="text-right text-sm font-medium">{value ?? 'sin datos'}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-slate-700">
          Calculado sobre {scores.categoriesUsed} de {scores.categoriesTotal} áreas. Lo que no
          aplica o no pudimos evaluar no cuenta.
        </p>
      </div>
    </section>
  );
}
