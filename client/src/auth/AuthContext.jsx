import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // participant
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, a] = await Promise.allSettled([api.get('/auth/me'), api.get('/admin/me')]);
    setUser(p.status === 'fulfilled' ? p.value.data.user : null);
    setAdmin(a.status === 'fulfilled' ? a.value.data.admin : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // --- participant ---
  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  };
  const signup = async (name, email, password) => {
    const { data } = await api.post('/auth/signup', { name, email, password });
    setUser(data.user);
    return data.user;
  };
  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  // --- admin ---
  const adminLogin = async (email, password) => {
    const { data } = await api.post('/admin/login', { email, password });
    setAdmin(data.admin);
    return data.admin;
  };
  const adminLogout = async () => {
    await api.post('/admin/logout');
    setAdmin(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, admin, loading, refresh, login, signup, logout, adminLogin, adminLogout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
