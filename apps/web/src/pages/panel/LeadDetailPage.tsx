import { LEAD_STATUSES, MAX_NOTE_LENGTH, type LeadStatus } from '@auditor/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  addLeadNote,
  deleteAdminLead,
  getAdminLead,
  getSession,
  updateLeadStatus,
} from '../../lib/api-client.js';
import { LEAD_STATUS_LABEL, SESSION_KEY, formatDate, leadDetailKey } from '../../lib/panel.js';
import { DeleteButton } from './DeleteButton.js';

/** Seguimiento de un contacto (RF-14): estado, notas e historial con fecha y usuario. */
export function LeadDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useQuery({ queryKey: SESSION_KEY, queryFn: getSession, retry: false });
  const query = useQuery({ queryKey: leadDetailKey(id), queryFn: () => getAdminLead(id) });
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [note, setNote] = useState('');

  const onSaved = (detail: Awaited<ReturnType<typeof getAdminLead>>) => {
    client.setQueryData(leadDetailKey(id), detail);
    void client.invalidateQueries({ queryKey: ['admin', 'leads'] });
  };
  const statusMutation = useMutation({
    mutationFn: (next: LeadStatus) =>
      updateLeadStatus(Number(id), next, session.data?.csrfToken ?? ''),
    onSuccess: (detail) => {
      setStatus('');
      onSaved(detail);
    },
  });
  const noteMutation = useMutation({
    mutationFn: (text: string) => addLeadNote(Number(id), text, session.data?.csrfToken ?? ''),
    onSuccess: (detail) => {
      setNote('');
      onSaved(detail);
    },
  });

  if (query.isPending) return <p>Cargando…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-red-800">
        {query.error.message}
      </p>
    );
  }

  const { lead, events } = query.data;
  const selected = status === '' ? lead.status : status;
  return (
    <div className="space-y-6">
      <Link
        to="/panel/contactos"
        className="text-sm font-medium text-blue-600 hover:underline focus-visible:underline"
      >
        Volver a los contactos
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="break-all text-2xl font-bold text-blue-950">{lead.email}</h1>
          <p className="text-sm text-slate-700">
            {lead.domain} · aceptó el {formatDate(lead.consentAt)} (texto {lead.consentTextVersion})
          </p>
          {lead.lastAuditId !== null && (
            <Link
              to={`/panel/auditorias/${String(lead.lastAuditId)}`}
              className="text-sm font-medium text-blue-600 hover:underline focus-visible:underline"
            >
              Ver el informe
            </Link>
          )}
        </div>
        <DeleteButton
          label="Borrar contacto"
          confirmText={`¿Borrar el contacto ${lead.email}? No se puede deshacer.`}
          onDelete={(csrf) => deleteAdminLead(lead.id, csrf)}
          onDone={() => {
            void navigate('/panel/contactos', { replace: true });
          }}
        />
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          statusMutation.mutate(selected);
        }}
      >
        <label className="text-sm font-medium">
          Estado
          <select
            value={selected}
            onChange={(e) => {
              setStatus(e.target.value as LeadStatus);
            }}
            className="mt-1 block rounded border border-slate-400 px-2 py-1"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={selected === lead.status || statusMutation.isPending}
          className="rounded bg-blue-800 px-4 py-1 font-semibold text-white disabled:opacity-50"
        >
          Guardar estado
        </button>
        {statusMutation.isError && (
          <p role="alert" className="text-sm text-red-800">
            {statusMutation.error.message}
          </p>
        )}
      </form>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (note.trim() !== '') noteMutation.mutate(note);
        }}
      >
        <label htmlFor="nota" className="block text-sm font-medium">
          Nueva nota
        </label>
        <textarea
          id="nota"
          value={note}
          maxLength={MAX_NOTE_LENGTH}
          rows={3}
          onChange={(e) => {
            setNote(e.target.value);
          }}
          className="w-full rounded border border-slate-400 px-2 py-1"
        />
        <button
          type="submit"
          disabled={note.trim() === '' || noteMutation.isPending}
          className="rounded bg-blue-800 px-4 py-1 font-semibold text-white disabled:opacity-50"
        >
          Agregar nota
        </button>
        {noteMutation.isError && (
          <p role="alert" className="text-sm text-red-800">
            {noteMutation.error.message}
          </p>
        )}
      </form>

      <section aria-labelledby="historial" className="space-y-2">
        <h2 id="historial" className="text-lg font-semibold">
          Historial
        </h2>
        {events.length === 0 ? (
          <p className="text-slate-700">Todavía no hay cambios ni notas.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded border border-slate-300 p-3">
                <p className="text-sm text-slate-700">
                  {formatDate(e.createdAt)} · {e.userEmail}
                </p>
                {e.type === 'status' && e.status !== null ? (
                  <p>Cambió el estado a {LEAD_STATUS_LABEL[e.status]}.</p>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{e.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
