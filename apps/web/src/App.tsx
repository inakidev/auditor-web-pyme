import { Link, Outlet, type RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage.js';
import { ReportPage } from './pages/ReportPage.js';

function Layout() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <Link to="/" className="font-semibold">
            Auditor Web Pyme
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

/** Borrador: el aviso real se publica en H15, antes de exponer el sistema. */
function PrivacyPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Aviso de privacidad</h1>
      <p>
        El aviso de privacidad está en preparación. Mientras tanto, no dejes tu correo: esta versión
        es solo de prueba.
      </p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">No encontramos esta página</h1>
      <Link to="/" className="font-medium text-blue-800 underline">
        Volver al inicio
      </Link>
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'informe/:token', element: <ReportPage /> },
      { path: 'privacidad', element: <PrivacyPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
