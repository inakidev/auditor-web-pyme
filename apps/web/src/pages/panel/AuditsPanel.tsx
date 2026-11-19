import { AUDIT_STATUSES } from '@auditor/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { listAdminAudits, toQueryString } from '../../lib/api-client.js';
import { AUDIT_STATUS_LABEL, auditsKey, filtersFrom, formatDate } from '../../lib/panel.js';
import { Filters, Pager, Table, type FilterField } from './Filters.js';

const FIELDS: readonly FilterField[] = [
  { name: 'domain', label: 'Dominio', type: 'text' },
  { name: 'from', label: 'Desde', type: 'date' },
  { name: 'to', label: 'Hasta', type: 'date' },
  { name: 'minScore', label: 'Puntaje mín.', type: 'number' },
  { name: 'maxScore', label: 'Puntaje máx.', type: 'number' },
  {
    name: 'status',
    label: 'Estado',
    type: 'select',
    options: AUDIT_STATUSES.map((s) => [s, AUDIT_STATUS_LABEL[s]] as const),
  },
];
const NAMES = [...FIELDS.map((f) => f.name), 'page'];

/** Pantalla P4: auditorías con filtros por dominio, fecha, puntaje y estado (RF-12). */
export function AuditsPanel() {
  const [params] = useSearchParams();
  const filters = filtersFrom(params, NAMES);
  const query = useQuery({
    queryKey: auditsKey(toQueryString(filters)),
    queryFn: () => listAdminAudits(filters),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-blue-950">Auditorías</h1>
      <Filters fields={FIELDS} />
      {query.isPending && <p>Cargando…</p>}
      {query.isError && (
        <p role="alert" className="text-red-800">
          {query.error.message}
        </p>
      )}
      {query.isSuccess && (
        <>
          <Table headers={['Fecha', 'Dominio', 'Estado', 'Puntaje', 'Contacto']}>
            {query.data.items.map((a) => (
              <tr key={a.id} className="border-b border-slate-200">
                <td className="px-2 py-2">{formatDate(a.createdAt)}</td>
                <td className="px-2 py-2">
                  <Link
                    to={`/panel/auditorias/${String(a.id)}`}
                    className="font-medium text-blue-800 underline"
                  >
                    {a.domain}
                  </Link>
                </td>
                <td className="px-2 py-2">{AUDIT_STATUS_LABEL[a.status]}</td>
                <td className="px-2 py-2">
                  {a.scoreTotal === null
                    ? '—'
                    : `${String(a.scoreTotal)} (Nivel ${a.scoreBand ?? '—'})`}
                </td>
                <td className="px-2 py-2">{a.hasLead ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </Table>
          {query.data.items.length === 0 && <p>No hay auditorías con esos filtros.</p>}
          <Pager page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} />
        </>
      )}
    </div>
  );
}
