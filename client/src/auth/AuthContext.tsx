import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, apiGet, apiPost, clearSession, getToken, setToken } from '../api/client';
import type { User } from '../api/types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (input: { username: string; password: string; nickname?: string }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  updateUser: (next: User) => void;
  replaceSession: (token: string, next: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiGet<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onLogout = () => setUser(null);
    window.addEventListener('shiju:logout', onLogout);
    return () => window.removeEventListener('shiju:logout', onLogout);
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiPost<{ token: string; user: User }>('/auth/login', { username, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (input: { username: string; password: string; nickname?: string }) => {
      const data = await apiPost<{ token: string; user: User }>('/auth/register', {
        ...input,
        agree_terms: true,
      });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((next: User) => setUser(next), []);

  const replaceSession = useCallback((token: string, next: User) => {
    setToken(token);
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, updateUser, replaceSession }),
    [user, loading, login, register, logout, refresh, updateUser, replaceSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return value;
}
