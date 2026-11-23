import type { Category, Finding } from '@auditor/shared';
import {
  CATEGORY_LABEL,
  EFFORT_LABEL,
  SEVERITY_BADGE,
  SEVERITY_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  isActionable,
  isPending,
  priorityFindings,
  sortFindings,
} from '../lib/report.js';

// Todo el texto se muestra como texto (React lo escapa). Nunca HTML del sitio auditado.

/** Pantalla P3: lo que conviene arreglar primero. */
export function PriorityList({ findings }: { readonly findings: readonly Finding[] }) {
  const top = priorityFindings(findings);
  return (
    <section aria-labelledby="prioridades" className="space-y-3">
      <h2 id="prioridades" className="text-xl font-semibold text-blue-950">
        Qué conviene arreglar primero
      </h2>
      {top.length === 0 ? (
        <p>No encontramos problemas importantes. ¡Bien!</p>
      ) : (
        <ol className="space-y-2">
          {top.map((finding) => (
            <li key={finding.checkId} className="flex items-start gap-3">
              <span
                className={`w-20 shrink-0 rounded px-2 py-1 text-center text-sm font-semibold ${SEVERITY_BADGE[finding.severity].className}`}
              >
                {SEVERITY_BADGE[finding.severity].label}
              </span>
              <span>{finding.title}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FindingItem({ finding }: { readonly finding: Finding }) {
  return (
    <li className={`rounded-lg border p-4 ${STATUS_STYLE[finding.status]}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{STATUS_LABEL[finding.status]}</span>
        {isActionable(finding) && (
          <>
            <span aria-hidden="true">·</span>
            <span>Prioridad: {SEVERITY_LABEL[finding.severity]}</span>
            <span aria-hidden="true">·</span>
            <span>Esfuerzo: {EFFORT_LABEL[finding.effort]}</span>
          </>
        )}
      </div>
      <h4 className="text-base font-semibold">{finding.title}</h4>
      {finding.evidence !== null && (
        <p className="mt-1 font-mono text-sm break-words">{finding.evidence}</p>
      )}
      {finding.status === 'not_evaluated' && (
        <p className="mt-1 text-sm">
          No pudimos completar este control, así que no cuenta para el puntaje.
        </p>
      )}
      <p className="mt-2">{finding.recommendation}</p>
      {finding.guide?.startsWith('https://') === true && (
        <a
          href={finding.guide}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block font-medium text-blue-700 hover:underline focus-visible:underline"
        >
          Ver una guía paso a paso{finding.guide.includes('/en-US/') ? ' (en inglés)' : ''}
        </a>
      )}
    </li>
  );
}

/** Detalle por área: plegable, abierto si hay algo para resolver. */
export function FindingsList({ findings }: { readonly findings: readonly Finding[] }) {
  const byCategory = new Map<Category, Finding[]>();
  for (const finding of sortFindings(findings)) {
    byCategory.set(finding.category, [...(byCategory.get(finding.category) ?? []), finding]);
  }

  return (
    <div className="space-y-4">
      {[...byCategory].map(([category, items]) => {
        const pending = items.filter(isPending).length;
        const toFix = items.filter(isActionable);
        const fine = items.filter((f) => !isActionable(f));
        return (
          <details
            key={category}
            open={pending > 0}
            className="rounded-lg border border-slate-300 p-3"
          >
            <summary className="cursor-pointer text-lg font-semibold">
              <h3 className="inline">{CATEGORY_LABEL[category]}</h3>{' '}
              <span className="text-sm font-normal text-slate-700">
                ({pending === 0 ? 'todo en orden' : `${String(pending)} para revisar`})
              </span>
            </summary>
            {toFix.length > 0 && (
              <ul className="mt-3 space-y-3">
                {toFix.map((finding) => (
                  <FindingItem key={finding.checkId} finding={finding} />
                ))}
              </ul>
            )}
            {/* Lo que cumple o no aplica va plegado: así el informe no se hace eterno. */}
            {fine.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer font-medium text-slate-700">
                  Lo que ya está bien o no aplica ({fine.length})
                </summary>
                <ul className="mt-3 space-y-3">
                  {fine.map((finding) => (
                    <FindingItem key={finding.checkId} finding={finding} />
                  ))}
                </ul>
              </details>
            )}
          </details>
        );
      })}
    </div>
  );
}
