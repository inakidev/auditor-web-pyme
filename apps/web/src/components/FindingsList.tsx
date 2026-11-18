import type { Category, Finding } from '@auditor/shared';
import {
  CATEGORY_LABEL,
  EFFORT_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  sortFindings,
} from '../lib/report.js';

// Todo el texto se muestra como texto (React lo escapa). Nunca HTML del sitio auditado.

export function FindingsList({ findings }: { readonly findings: readonly Finding[] }) {
  const byCategory = new Map<Category, Finding[]>();
  for (const finding of sortFindings(findings)) {
    byCategory.set(finding.category, [...(byCategory.get(finding.category) ?? []), finding]);
  }

  return (
    <div className="space-y-8">
      {[...byCategory].map(([category, items]) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`} className="mb-3 text-xl font-semibold">
            {CATEGORY_LABEL[category]}
          </h2>
          <ul className="space-y-3">
            {items.map((finding) => (
              <li
                key={finding.checkId}
                className={`rounded-lg border p-4 ${STATUS_STYLE[finding.status]}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span>{STATUS_LABEL[finding.status]}</span>
                  <span aria-hidden="true">·</span>
                  <span>Severidad: {SEVERITY_LABEL[finding.severity]}</span>
                  <span aria-hidden="true">·</span>
                  <span>Esfuerzo: {EFFORT_LABEL[finding.effort]}</span>
                </div>
                <h3 className="text-base font-semibold">{finding.title}</h3>
                {finding.evidence !== null && (
                  <p className="mt-1 font-mono text-sm break-words">{finding.evidence}</p>
                )}
                <p className="mt-2">{finding.recommendation}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
