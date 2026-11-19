import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router';
import { getSession, logout } from '../../lib/api-client.js';
import { SESSION_KEY, needsLogin } from '../../lib/panel.js';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1 font-medium ${isActive ? 'bg-blue-800 text-white' : 'text-blue-800 underline'}`;

/** Todo lo que está bajo /panel exige sesión: sin ella vuelve al ingreso. */
export function PanelLayout() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const session = useQuery({ queryKey: SESSION_KEY, queryFn: getSession, retry: false });
  const exit = useMutation({
    mutationFn: (csrfToken: string) => logout(csrfToken),
    onSettled: () => {
      client.clear();
      void navigate('/panel/ingresar', { replace: true });
    },
  });

  if (session.isPending) return <p>Cargando…</p>;
  if (session.isError) {
    if (needsLogin(session.error)) return <Navigate to="/panel/ingresar" replace />;
    return (
      <p role="alert" className="text-red-800">
        {session.error.message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Secciones del panel" className="flex gap-2">
          <NavLink to="/panel" end className={tabClass}>
            Auditorías
          </NavLink>
          <NavLink to="/panel/contactos" className={tabClass}>
            Contactos
          </NavLink>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>{session.data.email}</span>
          <button
            type="button"
            onClick={() => {
              exit.mutate(session.data.csrfToken);
            }}
            className="rounded border border-slate-400 px-3 py-1"
          >
            Salir
          </button>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
