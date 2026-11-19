import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';

export interface FilterField {
  readonly name: string;
  readonly label: string;
  readonly type: 'text' | 'date' | 'number' | 'select';
  readonly options?: readonly (readonly [value: string, label: string])[];
}

const inputClass = 'mt-1 w-full rounded border border-slate-400 px-2 py-1';

/** Formulario de filtros que escribe en la URL (y vuelve a la página 1). */
export function Filters({ fields }: { readonly fields: readonly FilterField[] }) {
  const [params, setParams] = useSearchParams();
  return (
    <form
      aria-label="Filtros"
      className="grid grid-cols-2 gap-3 md:grid-cols-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const next = new URLSearchParams();
        for (const field of fields) {
          const value = data.get(field.name);
          if (typeof value === 'string' && value.trim() !== '') next.set(field.name, value.trim());
        }
        setParams(next);
      }}
    >
      {fields.map((field) => (
        <label key={field.name} className="text-sm font-medium">
          {field.label}
          {field.type === 'select' ? (
            <select
              name={field.name}
              defaultValue={params.get(field.name) ?? ''}
              className={inputClass}
            >
              <option value="">Todos</option>
              {field.options?.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={field.name}
              type={field.type}
              defaultValue={params.get(field.name) ?? ''}
              maxLength={field.type === 'text' ? 253 : undefined}
              min={field.type === 'number' ? 0 : undefined}
              max={field.type === 'number' ? 100 : undefined}
              className={inputClass}
            />
          )}
        </label>
      ))}
      <div className="col-span-2 flex items-end md:col-span-6">
        <button type="submit" className="rounded bg-blue-800 px-4 py-1 font-semibold text-white">
          Filtrar
        </button>
      </div>
    </form>
  );
}

/** Paginación anterior/siguiente sobre el parámetro page de la URL. */
export function Pager(props: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}) {
  const [params, setParams] = useSearchParams();
  const pages = Math.max(Math.ceil(props.total / props.pageSize), 1);
  const go = (page: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  };
  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        disabled={props.page <= 1}
        onClick={() => {
          go(props.page - 1);
        }}
        className="rounded border border-slate-400 px-3 py-1 disabled:opacity-50"
      >
        Anterior
      </button>
      <span>
        Página {props.page} de {pages} ({props.total} en total)
      </span>
      <button
        type="button"
        disabled={props.page >= pages}
        onClick={() => {
          go(props.page + 1);
        }}
        className="rounded border border-slate-400 px-3 py-1 disabled:opacity-50"
      >
        Siguiente
      </button>
    </div>
  );
}

export function Table(props: {
  readonly headers: readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300">
            {props.headers.map((h) => (
              <th key={h} scope="col" className="px-2 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  );
}
