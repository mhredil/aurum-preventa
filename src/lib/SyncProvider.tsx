import NetInfo from "@react-native-community/netinfo";
import { useSQLiteContext } from "expo-sqlite";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { isRevoked, OfflineError } from "./api.ts";
import { useSession } from "./session.tsx";
import { countPending, getMeta } from "./store.ts";
import { syncAll, uploadOrders } from "./sync.ts";

interface SyncState {
  syncing: boolean;
  lastSync: string | null;
  pending: number;
  message: string | null;
  error: string | null;
  /** The phone was unlinked in the portal: queued orders stay until it is linked again. */
  revoked: boolean;
  /** Changes after each sync or new order, for screens to reload their data. */
  version: number;
  sync: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { session } = useSession();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [version, setVersion] = useState(0);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    setPending(await countPending(db));
    setLastSync(await getMeta<string>(db, "last_sync_at"));
    setVersion((v) => v + 1);
  }, [db]);

  const run = useCallback(
    async (full: boolean) => {
      if (!session || busy.current) return;
      busy.current = true;
      setSyncing(true);
      setError(null);
      try {
        const { sent, failed } = full ? await syncAll(db, session) : await uploadOrders(db, session);
        const parts = [];
        if (sent) parts.push(`${sent} pedido${sent > 1 ? "s" : ""} enviado${sent > 1 ? "s" : ""}`);
        if (failed) parts.push(`${failed} con problemas`);
        if (full) parts.push("datos actualizados");
        setMessage(parts.length ? parts.join(", ") : null);
        setRevoked(false);
      } catch (cause) {
        if (isRevoked(cause)) setRevoked(true);
        setError(cause instanceof OfflineError ? "Sin conexión: los pedidos quedan guardados en el teléfono" : String((cause as Error).message));
      } finally {
        busy.current = false;
        setSyncing(false);
        await refresh();
      }
    },
    [db, session, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Queued orders go out by themselves when the signal comes back or the app is reopened.
  useEffect(() => {
    if (!session) return;
    const sendIfPending = async () => {
      if ((await countPending(db)) > 0) await run(false);
    };
    const offNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void sendIfPending();
    });
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") void sendIfPending();
    });
    return () => {
      offNet();
      appState.remove();
    };
  }, [db, session, run]);

  const value: SyncState = { syncing, lastSync, pending, message, error, revoked, version, sync: () => run(true), refresh };
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync fuera de SyncProvider");
  return value;
}
