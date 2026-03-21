import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { fetchAuthStatus } from './api';

interface AuthState {
  authenticated: boolean;
  username?: string;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  authenticated: false,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    loading: true,
  });

  useEffect(() => {
    fetchAuthStatus()
      .then((status) => {
        setState({
          authenticated: status.authenticated,
          username: status.username,
          loading: false,
        });
      })
      .catch(() => {
        setState({ authenticated: false, loading: false });
      });
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  );
}
