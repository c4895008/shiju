import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page status-page">
        <p className="meta-line">正在确认登录状态…</p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (admin && user.role !== 9) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
