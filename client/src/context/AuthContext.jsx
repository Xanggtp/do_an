import { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/auth/me')
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
    setUser(data.user);
    return data.user;
  };

  const register = async (details) => {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(details) });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const updateProfile = async (details) => {
    const data = await api('/api/user/profile', { method: 'PATCH', body: JSON.stringify(details) });
    setUser(data.user);
    return data.user;
  };

  const changePassword = (details) => api('/api/auth/change-password', { method: 'POST', body: JSON.stringify(details) });

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
