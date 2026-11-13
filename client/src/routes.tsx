import type { RouteObject } from 'react-router-dom';
import { useRouteError } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { HomePage } from './pages/Home';
import { QuotePage } from './pages/Quote';
import { WorkPage } from './pages/Work';
import { ThemePage } from './pages/Theme';
import { ThemesPage } from './pages/Themes';
import { SearchPage } from './pages/Search';
import { NotebookPage } from './pages/Notebook';
import { FriendsPage } from './pages/Friends';
import { SettingsPage } from './pages/Settings';
import { WritePage } from './pages/Write';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { NotFoundPage } from './pages/Status';
import { AdminPage } from './pages/admin/Admin';
import { AdminReviewPage } from './pages/admin/AdminReview';
import {
  homeLoader,
  quoteLoader,
  searchLoader,
  settingsLoader,
  themeLoader,
  themesLoader,
  workLoader,
} from './loaders';

function RootError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : '页面加载失败';
  return (
    <div className="page status-page">
      <p className="status-code">500</p>
      <h1>页面暂时打不开</h1>
      <p className="status-desc">{message}</p>
      <a className="text-link" href="/">
        回首页
      </a>
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    id: 'root',
    path: '/',
    element: <Layout />,
    errorElement: <RootError />,
    children: [
      { id: 'home', index: true, element: <HomePage />, loader: homeLoader },
      { id: 'quote', path: 'q/:slug', element: <QuotePage />, loader: quoteLoader },
      { id: 'work', path: 'movie/:slug', element: <WorkPage />, loader: workLoader },
      { id: 'themes', path: 'themes', element: <ThemesPage />, loader: themesLoader },
      { id: 'theme', path: 'theme/:slug', element: <ThemePage />, loader: themeLoader },
      { id: 'search', path: 'search', element: <SearchPage />, loader: searchLoader },
      {
        id: 'notebook',
        path: 'notebook',
        element: (
          <RequireAuth>
            <NotebookPage />
          </RequireAuth>
        ),
      },
      {
        id: 'friends',
        path: 'friends',
        element: (
          <RequireAuth>
            <FriendsPage />
          </RequireAuth>
        ),
      },
      {
        id: 'settings',
        path: 'settings',
        element: (
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        ),
        loader: settingsLoader,
      },
      {
        id: 'write',
        path: 'q/:slug/write',
        element: (
          <RequireAuth>
            <WritePage />
          </RequireAuth>
        ),
      },
      { id: 'login', path: 'auth/login', element: <LoginPage /> },
      { id: 'register', path: 'auth/register', element: <RegisterPage /> },
      {
        id: 'admin',
        path: 'admin',
        element: (
          <RequireAuth admin>
            <AdminPage />
          </RequireAuth>
        ),
      },
      {
        id: 'admin-review',
        path: 'admin/review/:id',
        element: (
          <RequireAuth admin>
            <AdminReviewPage />
          </RequireAuth>
        ),
      },
      { id: 'notfound', path: '*', element: <NotFoundPage /> },
    ],
  },
];
