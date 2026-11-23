import { LEAD_STATUSES } from '@auditor/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { deleteAdminLead, listAdminLeads, toQueryString } from '../../lib/api-client.js';
import { LEAD_STATUS_LABEL, filtersFrom, formatDate, leadsKey } from '../../lib/panel.js';
import { DeleteButton } from './DeleteButton.js';
import { Filters, Pager, Table, type FilterField } from './Filters.js';

const FIELDS: readonly FilterField[] = [
  { name: 'domain', label: 'Dominio', type: 'text' },
  { name: 'from', label: 'Desde', type: 'date' },
  { name: 'to', label: 'Hasta', type: 'date' },
  {
    name: 'status',
    label: 'Estado',
    type: 'select',
    options: LEAD_STATUSES.map((s) => [s, LEAD_STATUS_LABEL[s]] as const),
  },
];
const NAMES = [...FIELDS.map((f) => f.name), 'page'];

/** Contactos que dejaron su correo con consentimiento expreso (RF-11, RF-12). */
export function LeadsPanel() {
  const [params] = useSearchParams();
  const filters = filtersFrom(params, NAMES);
  const query = useQuery({
    queryKey: leadsKey(toQueryString(filters)),
    queryFn: () => listAdminLeads(filters),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-blue-950">Contactos</h1>
      <Filters fields={FIELDS} />
      {query.isPending && <p>Cargando…</p>}
      {query.isError && (
        <p role="alert" className="text-red-800">
          {query.error.message}
        </p>
      )}
      {query.isSuccess && (
        <>
          <Table
            headers={[
              'Fecha',
              'Correo',
              'Dominio',
              'Estado',
              'Consentimiento',
              'Informe',
              'Acciones',
            ]}
          >
            {query.data.items.map((l) => (
              <tr key={l.id} className="border-b border-slate-200">
                <td className="px-2 py-2">{formatDate(l.createdAt)}</td>
                <td className="px-2 py-2">
                  <Link
                    to={`/panel/contactos/${String(l.id)}`}
                    className="font-medium text-blue-600 hover:underline focus-visible:underline"
                  >
                    {l.email}
                  </Link>
                </td>
                <td className="px-2 py-2">{l.domain}</td>
                <td className="px-2 py-2">{LEAD_STATUS_LABEL[l.status]}</td>
                <td className="px-2 py-2">
                  {formatDate(l.consentAt)} (texto {l.consentTextVersion})
                </td>
                <td className="px-2 py-2">
                  {l.lastAuditId === null ? (
                    '—'
                  ) : (
                    <Link
                      to={`/panel/auditorias/${String(l.lastAuditId)}`}
                      className="font-medium text-blue-600 hover:underline focus-visible:underline"
                    >
                      Ver informe
                    </Link>
                  )}
                </td>
                <td className="px-2 py-2">
                  <DeleteButton
                    label="Borrar"
                    confirmText={`¿Borrar el contacto ${l.email}? No se puede deshacer.`}
                    onDelete={(csrf) => deleteAdminLead(l.id, csrf)}
                  />
                </td>
              </tr>
            ))}
          </Table>
          {query.data.items.length === 0 && <p>No hay contactos con esos filtros.</p>}
          <Pager page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} />
        </>
      )}
    </div>
  );
}
