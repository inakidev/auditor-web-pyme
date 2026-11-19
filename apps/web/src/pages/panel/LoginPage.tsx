import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError, getCsrfToken, login } from '../../lib/api-client.js';
import { SESSION_KEY } from '../../lib/panel.js';

const FALLBACK = 'No pudimos iniciar la sesión. Probá de nuevo.';

/** Ingreso de consultores. El token del doble envío se pide justo antes de mandar. */
export function LoginPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      const { csrfToken } = await getCsrfToken();
      return login(email, password, csrfToken);
    },
    onSuccess: (session) => {
      setPassword('');
      client.setQueryData(SESSION_KEY, session);
      void navigate('/panel', { replace: true });
    },
  });

  const error = mutation.error;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-bold text-blue-950">Panel de consultores</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        className="space-y-4"
        noValidate
      >
        <div>
          <label htmlFor="email" className="block font-medium">
            Correo
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            className="mt-1 w-full rounded border border-slate-400 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="block font-medium">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            className="mt-1 w-full rounded border border-slate-400 px-3 py-2"
          />
        </div>
        {error !== null && (
          <p role="alert" className="text-red-800">
            {error instanceof ApiRequestError ? error.message : FALLBACK}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded bg-blue-800 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {mutation.isPending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
