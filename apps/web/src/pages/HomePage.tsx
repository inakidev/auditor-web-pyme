import { MAX_URL_LENGTH } from '@auditor/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { createAudit } from '../lib/api-client.js';

export function HomePage() {
  const [url, setUrl] = useState('');
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: createAudit,
    onSuccess: ({ token }) => {
      void navigate(`/informe/${token}`);
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-blue-950">Revisá tu sitio web en un minuto</h1>
        <p className="text-lg">
          Seguridad, SEO, medición y confianza, en un informe claro y en español.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(url);
        }}
        className="space-y-3"
        noValidate
      >
        <label htmlFor="url" className="block font-medium">
          Dirección de tu sitio
        </label>
        <input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="ejemplo.com"
          maxLength={MAX_URL_LENGTH}
          required
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
          }}
          aria-describedby={mutation.isError ? 'url-error' : undefined}
          className="w-full rounded-lg border border-slate-400 px-4 py-3 text-lg focus:outline-2 focus:outline-blue-700"
        />
        {mutation.isError && (
          <p id="url-error" role="alert" className="text-red-800">
            {mutation.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-blue-800 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-900 disabled:opacity-60 sm:w-auto"
        >
          {mutation.isPending ? 'Enviando…' : 'Auditar mi sitio'}
        </button>
      </form>

      <p className="text-sm text-slate-700">
        Solo hacemos un análisis pasivo: miramos tu sitio como lo haría un navegador, sin pruebas de
        intrusión y sin guardar el contenido de tus páginas.
      </p>
    </div>
  );
}
