import { AUDIT_PHASES, type AuditView } from '@auditor/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { FindingsList, PriorityList } from '../components/FindingsList.js';
import { Logo } from '../components/Logo.js';
import { ScoreSummary } from '../components/ScoreSummary.js';
import { getAudit } from '../lib/api-client.js';
import { pollInterval, retryDelay, shouldRetry } from '../lib/polling.js';
import { PHASE_LABEL, phaseProgress, widthClass } from '../lib/report.js';

const NEW_AUDIT_LINK = (
  <Link
    to="/"
    className="font-medium text-blue-600 hover:underline focus-visible:underline print:hidden"
  >
    Pedir otra revisión
  </Link>
);

const domainOf = (url: string) => new URL(url).hostname;

/** Pantalla P2: progreso por fases. */
function Progress({ audit }: { readonly audit: AuditView }) {
  const current = audit.status === 'running' ? audit.phase : null;
  const currentIndex = current === null ? -1 : AUDIT_PHASES.indexOf(current);
  const percent = phaseProgress(current);
  return (
    <div aria-live="polite" className="space-y-4">
      <h1 className="text-2xl font-bold text-blue-950">Estamos revisando {domainOf(audit.url)}</h1>
      <div>
        <div
          className="h-4 rounded bg-slate-200"
          role="progressbar"
          aria-label="Progreso de la revisión"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={`h-4 rounded bg-blue-700 ${widthClass(percent)}`} />
        </div>
        <p className="mt-1 text-right text-sm font-medium">{percent} %</p>
      </div>
      <ul className="space-y-2">
        {AUDIT_PHASES.map((phase, index) => {
          const state =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';
          return (
            <li key={phase} className={state === 'pending' ? 'text-slate-600' : 'text-slate-900'}>
              <span aria-hidden="true" className="inline-block w-6">
                {state === 'done' ? '✔' : state === 'current' ? '…' : '○'}
              </span>
              {PHASE_LABEL[phase]}
              <span className="sr-only">
                {state === 'done'
                  ? ' (listo)'
                  : state === 'current'
                    ? ' (en curso)'
                    : ' (pendiente)'}
              </span>
            </li>
          );
        })}
      </ul>
      {audit.status === 'queued' && <p>Tu revisión está en la fila y empieza en unos segundos.</p>}
      <p className="text-sm text-slate-700">Podés guardar este enlace y volver más tarde.</p>
    </div>
  );
}

/**
 * Al imprimir (botón o Ctrl+P) se abren todas las secciones para que el PDF tenga todos los
 * hallazgos, y al terminar vuelven como estaban.
 */
function useOpenDetailsWhilePrinting(): void {
  useEffect(() => {
    let closed: HTMLDetailsElement[] = [];
    const before = () => {
      closed = [...document.querySelectorAll('details')].filter((d) => !d.open);
      for (const details of closed) details.open = true;
    };
    const after = () => {
      for (const details of closed) details.open = false;
      closed = [];
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'long',
    timeStyle: 'short',
  });

export function ReportPage() {
  useOpenDetailsWhilePrinting();
  const { token = '' } = useParams();
  const query = useQuery<AuditView>({
    queryKey: ['audit', token],
    queryFn: () => getAudit(token),
    refetchInterval: (q) => (q.state.status === 'error' ? false : pollInterval(q.state.data)),
    retry: shouldRetry,
    retryDelay,
  });

  if (query.isPending) {
    return <p aria-live="polite">Cargando el informe…</p>;
  }

  if (query.isError) {
    return (
      <div role="alert" className="space-y-3">
        <p>{query.error.message}</p>
        {NEW_AUDIT_LINK}
      </div>
    );
  }

  const audit = query.data;
  if (audit.status === 'queued' || audit.status === 'running') {
    return <Progress audit={audit} />;
  }

  if (audit.status === 'failed') {
    return (
      <div role="alert" className="space-y-3">
        <h1 className="text-2xl font-bold">No pudimos revisar tu sitio</h1>
        <p className="break-words">{audit.url}</p>
        <p>{audit.error?.message}</p>
        {NEW_AUDIT_LINK}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado del PDF (RF-10): logo, fecha y URL. Solo se ve al imprimir. */}
      <div className="hidden items-center gap-3 border-b border-slate-300 pb-3 print:flex">
        <Logo className="h-10 w-10 text-blue-950" />
        <div>
          <p className="text-lg font-semibold text-blue-950">Auditor Web Pyme</p>
          <p className="text-sm">Informe del sitio {audit.url}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-blue-950">Informe de {domainOf(audit.url)}</h1>
          <p className="text-sm text-slate-700">
            Revisado el {formatDateTime(audit.finishedAt ?? audit.createdAt)}.
          </p>
          <p className="break-all text-sm text-slate-700">Dirección revisada: {audit.url}</p>
          <p className="text-sm text-slate-700 print:hidden">
            Este enlace vence el {new Date(audit.expiresAt).toLocaleDateString('es-AR')}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
          className="rounded-lg border border-blue-800 px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50 print:hidden"
        >
          Descargar PDF
        </button>
      </div>
      {audit.scores !== null && <ScoreSummary scores={audit.scores} />}
      <PriorityList findings={audit.findings} />
      <section aria-labelledby="detalle" className="space-y-3">
        <h2 id="detalle" className="text-xl font-semibold text-blue-950">
          Detalle por área
        </h2>
        <FindingsList findings={audit.findings} />
      </section>
      {NEW_AUDIT_LINK}
    </div>
  );
}
