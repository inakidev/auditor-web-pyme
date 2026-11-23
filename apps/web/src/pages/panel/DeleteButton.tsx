import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession } from '../../lib/api-client.js';
import { SESSION_KEY } from '../../lib/panel.js';

/** Borrado manual (RF-16): pide confirmación y manda el token CSRF de la sesión. */
export function DeleteButton(props: {
  readonly label: string;
  readonly confirmText: string;
  readonly onDelete: (csrfToken: string) => Promise<void>;
  readonly onDone?: () => void;
}) {
  const client = useQueryClient();
  const session = useQuery({ queryKey: SESSION_KEY, queryFn: getSession, retry: false });
  const mutation = useMutation({
    mutationFn: props.onDelete,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin'] });
      props.onDone?.();
    },
  });
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={session.data === undefined || mutation.isPending}
        onClick={() => {
          if (session.data !== undefined && window.confirm(props.confirmText)) {
            mutation.mutate(session.data.csrfToken);
          }
        }}
        className="rounded border border-red-700 px-3 py-1 text-sm font-medium text-red-800 disabled:opacity-50"
      >
        {mutation.isPending ? 'Borrando…' : props.label}
      </button>
      {mutation.isError && (
        <span role="alert" className="text-sm text-red-800">
          {mutation.error.message}
        </span>
      )}
    </span>
  );
}
