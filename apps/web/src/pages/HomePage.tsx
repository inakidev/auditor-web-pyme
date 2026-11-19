import { CONSENT_TEXT, MAX_EMAIL_LENGTH, MAX_URL_LENGTH } from '@auditor/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { createAudit } from '../lib/api-client.js';

export function HomePage() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () => createAudit(url, { email, consent }),
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
          mutation.mutate();
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
        <label htmlFor="email" className="block font-medium">
          Tu correo (opcional)
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@empresa.com"
          maxLength={MAX_EMAIL_LENGTH}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          className="w-full rounded-lg border border-slate-400 px-4 py-3 text-lg focus:outline-2 focus:outline-blue-700"
        />
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
            }}
            className="mt-1 h-5 w-5"
          />
          <span>
            {CONSENT_TEXT}. Ver el{' '}
            <Link to="/privacidad" className="text-blue-800 underline">
              aviso de privacidad
            </Link>
            .
          </span>
        </label>
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
