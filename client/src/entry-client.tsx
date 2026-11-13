import { hydrateRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { routes } from './routes';
import './styles/app.css';

interface HydrationPayload {
  loaderData?: Record<string, unknown>;
  errors?: Record<string, unknown>;
}

declare global {
  interface Window {
    __staticRouterHydrationData?: HydrationPayload;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('缺少 #root 容器');

const router = createBrowserRouter(routes, {
  hydrationData: window.__staticRouterHydrationData,
});

hydrateRoot(
  container,
  <AuthProvider>
    <RouterProvider router={router} />
  </AuthProvider>,
);
