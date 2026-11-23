import type { ReactNode } from 'react';
import { LEGAL_UPDATED } from '../../lib/legal.js';

/** Marco común de las páginas legales: aviso de demo y fecha de actualización. */
export function LegalLayout(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <article className="space-y-5 leading-relaxed">
      <h1 className="text-2xl font-bold text-blue-950">{props.title}</h1>
      <p role="note" className="rounded border border-amber-600 bg-amber-50 p-3 text-amber-950">
        <strong>Esto es una demo.</strong> La base de datos se borra cada vez que el servicio se
        reinicia. Te pedimos que no cargues datos personales reales.
      </p>
      <p className="text-sm text-slate-700">Última actualización: {LEGAL_UPDATED}</p>
      {props.children}
    </article>
  );
}

export function Section(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{props.title}</h2>
      {props.children}
    </section>
  );
}
