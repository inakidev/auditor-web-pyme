import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { FindingsList, PriorityList } from '../../components/FindingsList.js';
import { ScoreSummary } from '../../components/ScoreSummary.js';
import { deleteAdminAudit, deleteAdminLead, getAdminAudit } from '../../lib/api-client.js';
import { AUDIT_STATUS_LABEL, auditDetailKey, formatDate } from '../../lib/panel.js';
import { DeleteButton } from './DeleteButton.js';

/** Detalle de una auditoría para el consultor: el informe y, si lo hay, el contacto. */
export function AuditDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: auditDetailKey(id), queryFn: () => getAdminAudit(id) });

  if (query.isPending) return <p>Cargando…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-red-800">
        {query.error.message}
      </p>
    );
  }

  const { audit, lead, domain } = query.data;
  const auditId = query.data.id;
  return (
    <div className="space-y-6">
      <Link
        to="/panel"
        className="text-sm font-medium text-blue-600 hover:underline focus-visible:underline"
      >
        Volver a las auditorías
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-950">{domain}</h1>
          <p className="text-sm text-slate-700">
            {AUDIT_STATUS_LABEL[audit.status]} · pedida el {formatDate(audit.createdAt)}
          </p>
        </div>
        <DeleteButton
          label="Borrar auditoría"
          confirmText={`¿Borrar la auditoría de ${domain}? No se puede deshacer.`}
          onDelete={(csrf) => deleteAdminAudit(auditId, csrf)}
          onDone={() => {
            void navigate('/panel', { replace: true });
          }}
        />
      </div>
      <section aria-labelledby="contacto" className="rounded border border-slate-300 p-4">
        <h2 id="contacto" className="font-semibold">
          Contacto
        </h2>
        {lead === null ? (
          <p>No dejó su correo.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              {lead.email} · aceptó el {formatDate(lead.consentAt)} (texto {lead.consentTextVersion}
              )
            </p>
            <DeleteButton
              label="Borrar contacto"
              confirmText={`¿Borrar el contacto ${lead.email}? No se puede deshacer.`}
              onDelete={(csrf) => deleteAdminLead(lead.id, csrf)}
            />
          </div>
        )}
      </section>
      {audit.error !== null && <p className="text-red-800">{audit.error.message}</p>}
      {audit.scores !== null && <ScoreSummary scores={audit.scores} />}
      {audit.status === 'done' && (
        <>
          <PriorityList findings={audit.findings} />
          <FindingsList findings={audit.findings} />
        </>
      )}
    </div>
  );
}
