import { Link, Outlet, type RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage.js';
import { ReportPage } from './pages/ReportPage.js';
import { PrivacyPage } from './pages/legal/PrivacyPage.js';
import { TermsPage } from './pages/legal/TermsPage.js';
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
      <footer className="border-t border-slate-200">
        <nav
          aria-label="Textos legales"
          className={`mx-auto flex ${width} gap-4 px-4 py-4 text-sm text-slate-700`}
        >
          <Link to="/terminos" className="underline">
            Términos de uso
          </Link>
          <Link to="/privacidad" className="underline">
            Aviso de privacidad
          </Link>
        </nav>
      </footer>
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
      { path: 'terminos', element: <TermsPage /> },
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
