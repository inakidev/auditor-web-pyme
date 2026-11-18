import type { AuditView } from '@auditor/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { FindingsList } from '../components/FindingsList.js';
import { ScoreSummary } from '../components/ScoreSummary.js';
import { getAudit } from '../lib/api-client.js';
import { pollInterval, retryDelay, shouldRetry } from '../lib/polling.js';
import { countByStatus } from '../lib/report.js';

const NEW_AUDIT_LINK = (
  <Link to="/" className="font-medium text-blue-800 underline">
    Pedir otra revisión
  </Link>
);

export function ReportPage() {
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
    return (
      <div aria-live="polite" className="space-y-2">
        <h1 className="text-2xl font-bold">Estamos revisando tu sitio</h1>
        <p className="break-words">{audit.url}</p>
        <p>
          {audit.status === 'queued'
            ? 'Tu revisión está en la fila y empieza en unos segundos.'
            : 'La revisión está en curso. Suele tardar menos de un minuto.'}
        </p>
      </div>
    );
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

  const counts = countByStatus(audit.findings);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Informe de tu sitio</h1>
        <p className="break-words">{audit.url}</p>
        <p className="text-sm text-slate-700">
          Este enlace vence el {new Date(audit.expiresAt).toLocaleDateString('es-AR')}.
        </p>
      </div>
      <ul className="flex flex-wrap gap-3 text-sm font-medium">
        <li className="rounded bg-red-100 px-3 py-1 text-red-900">No cumple: {counts.fail}</li>
        <li className="rounded bg-amber-100 px-3 py-1 text-amber-900">
          Advertencias: {counts.warn}
        </li>
        <li className="rounded bg-green-100 px-3 py-1 text-green-900">Cumple: {counts.pass}</li>
      </ul>
      {audit.scores !== null && <ScoreSummary scores={audit.scores} />}
      <FindingsList findings={audit.findings} />
      {NEW_AUDIT_LINK}
    </div>
  );
}
