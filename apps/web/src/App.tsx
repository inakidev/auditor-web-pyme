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
      { path: '*', element: <NotFound /> },
    ],
  },
];
