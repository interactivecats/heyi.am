import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { fetchAuthStatus, startDeviceAuth } from './api';
import type { DeviceCodeInfo } from './api';

interface AuthState {
  authenticated: boolean;
  username?: string;
  loading: boolean;
  login: () => Promise<DeviceCodeInfo>;
  refresh: () => Promise<void>;
}

const noop = () => Promise.reject(new Error('AuthProvider not mounted'));

const AuthContext = createContext<AuthState>({
  authenticated: false,
  loading: true,
  login: noop as () => Promise<DeviceCodeInfo>,
  refresh: noop as () => Promise<void>,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'login' | 'refresh'>>({
    authenticated: false,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const status = await fetchAuthStatus();
      setState({
        authenticated: status.authenticated,
        username: status.username,
        loading: false,
      });
    } catch {
      setState({ authenticated: false, loading: false });
    }
  }, []);

  const login = useCallback(async () => {
    const codeInfo = await startDeviceAuth();
    return codeInfo;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ ...state, login, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
