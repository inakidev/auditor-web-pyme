import { Link, Outlet, type RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage.js';
import { ReportPage } from './pages/ReportPage.js';
import { AuditDetailPage } from './pages/panel/AuditDetailPage.js';
import { AuditsPanel } from './pages/panel/AuditsPanel.js';
import { LeadsPanel } from './pages/panel/LeadsPanel.js';
import { LoginPage } from './pages/panel/LoginPage.js';
import { PanelLayout } from './pages/panel/PanelLayout.js';

function Layout({ wide = false }: { readonly wide?: boolean }) {
  const width = wide ? 'max-w-6xl' : 'max-w-3xl';
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className={`mx-auto ${width} px-4 py-3`}>
          <Link to="/" className="font-semibold">
            Auditor Web Pyme
          </Link>
        </div>
      </header>
      <main className={`mx-auto ${width} px-4 py-8`}>
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
      { path: 'panel/ingresar', element: <LoginPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/panel',
    element: <Layout wide />,
    children: [
      {
        element: <PanelLayout />,
        children: [
          { index: true, element: <AuditsPanel /> },
          { path: 'contactos', element: <LeadsPanel /> },
          { path: 'auditorias/:id', element: <AuditDetailPage /> },
        ],
      },
    ],
  },
];
