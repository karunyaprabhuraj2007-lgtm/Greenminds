import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, get, loadTokens, saveTokens, setOnAuthLost } from "./api";
import type { Me } from "./types";

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (capability: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    saveTokens(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnAuthLost(() => setUser(null));
    if (!loadTokens()) {
      setLoading(false);
      return;
    }
    get<Me>("/api/auth/me")
      .then(setUser)
      .catch(() => saveTokens(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new ApiError(0, "unreachable", "Cannot reach the GreenMinds server. Check that the backend is running.");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // No error envelope means the request never reached the API (proxy error, backend down).
      const fallback = `Cannot reach the GreenMinds API (HTTP ${res.status}). Check that the backend container is running and healthy.`;
      throw new ApiError(res.status, body?.error?.code ?? "unreachable", body?.error?.message ?? fallback);
    }
    saveTokens({ access_token: body.access_token, refresh_token: body.refresh_token });
    setUser(await get<Me>("/api/auth/me"));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      logout,
      can: (capability: string) => !!user?.capabilities.includes(capability),
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
