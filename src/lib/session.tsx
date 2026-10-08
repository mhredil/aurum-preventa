import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** The phone's link to one Aurum server (QR of Distribución → Preventa móvil). */
export interface Session {
  server: string; // https://.../api/v1
  token: string;
  deviceId: string;
  userName: string;
  sellerName: string;
  companyName: string;
}

const KEY = "aurum.session";

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  save: (session: Session) => Promise<void>;
  clear: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((raw) => setSession(raw ? (JSON.parse(raw) as Session) : null))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (value: Session) => {
    await SecureStore.setItemAsync(KEY, JSON.stringify(value));
    setSession(value);
  }, []);

  const clear = useCallback(async () => {
    await SecureStore.deleteItemAsync(KEY);
    setSession(null);
  }, []);

  return <SessionContext.Provider value={{ session, loading, save, clear }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession fuera de SessionProvider");
  return value;
}
