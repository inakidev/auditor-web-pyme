import { CATEGORIES, type Scores } from '@auditor/shared';
import { CATEGORY_LABEL } from '../lib/report.js';

/** Puntaje global y por categoría (versión mínima; el diseño completo llega en H8). */
export function ScoreSummary({ scores }: { readonly scores: Scores }) {
  return (
    <section aria-labelledby="puntaje" className="rounded-lg border border-slate-300 p-4">
      <h2 id="puntaje" className="text-lg font-semibold">
        Puntaje general:{' '}
        {scores.total === null
          ? 'sin datos'
          : `${String(scores.total)} de 100 (${scores.band ?? ''})`}
      </h2>
      <p className="text-sm text-slate-700">
        Calculado sobre {scores.categoriesUsed} de {scores.categoriesTotal} áreas. Los controles que
        no aplican o no pudimos evaluar no cuentan.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {CATEGORIES.map((category) => (
          <li key={category}>
            {CATEGORY_LABEL[category]}:{' '}
            <strong>{scores.categories[category] ?? 'sin datos'}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
