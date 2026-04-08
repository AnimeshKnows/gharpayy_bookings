import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface AuthTeammate {
  id: number;
  name: string;
  phone: string;
  role: "superadmin" | "zone_admin" | "agent";
  zoneId: number | null;
  zoneName: string | null;
  zoneSlug: string | null;
  zoneUpiId: string | null;
  zoneAdminPhone: string | null;
}

interface AuthContextValue {
  teammate: AuthTeammate | null;
  token: string | null;
  isLoading: boolean;
  setupNeeded: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  setup: (name: string, phone: string, pin: string) => Promise<void>;
  logout: () => void;
  isSuperAdmin: boolean;
  isZoneAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "ghp_token";
const TEAMMATE_KEY = "ghp_teammate";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teammate, setTeammate] = useState<AuthTeammate | null>(() => {
    try {
      const raw = localStorage.getItem(TEAMMATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
    checkSetup();
  }, []);

  async function checkSetup() {
    try {
      const res = await fetch("/api/auth/setup-needed");
      const data = await res.json();
      setSetupNeeded(data.setupNeeded);
    } catch {
      setSetupNeeded(false);
    } finally {
      setIsLoading(false);
    }
  }

  function persist(t: string, tm: AuthTeammate) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(TEAMMATE_KEY, JSON.stringify(tm));
    setToken(t);
    setTeammate(tm);
    setSetupNeeded(false);
  }

  async function login(phone: string, pin: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, pin }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Login failed");
    }
    const { token: t, teammate: tm } = await res.json();
    persist(t, tm);
  }

  async function setup(name: string, phone: string, pin: string) {
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, pin }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Setup failed");
    }
    const { token: t, teammate: tm } = await res.json();
    persist(t, tm);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TEAMMATE_KEY);
    setToken(null);
    setTeammate(null);
  }

  return (
    <AuthContext.Provider
      value={{
        teammate,
        token,
        isLoading,
        setupNeeded,
        login,
        setup,
        logout,
        isSuperAdmin: teammate?.role === "superadmin",
        isZoneAdmin: teammate?.role === "zone_admin" || teammate?.role === "superadmin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
