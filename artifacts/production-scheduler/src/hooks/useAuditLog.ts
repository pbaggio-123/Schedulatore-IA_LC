import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { AuditEntry } from "@/types";

const AUDIT_KEY = "scheduler_audit";
const USER_KEY  = "scheduler_current_user";
const TOKEN_KEY = "scheduler_token";
const MAX_ENTRIES = 2000;

/**
 * Fire-and-forget: scrive una entry nel registro.
 * - sempre su localStorage (cache offline)
 * - se c'è un token, anche sul registro condiviso Neon (/api/audit)
 */
export function addAuditEntry(
  entry: Omit<AuditEntry, "id" | "timestamp" | "user">,
): void {
  try {
    let user = "Sistema";
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(USER_KEY) : null;
      if (raw) user = JSON.parse(raw); // useLocalStorage serializza in JSON
    } catch { /* mantiene "Sistema" */ }
    const full: AuditEntry = {
      id: `a${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      user,
      ...entry,
    };
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(AUDIT_KEY)
        : null;
    const existing: AuditEntry[] = raw ? JSON.parse(raw) : [];
    window.localStorage.setItem(
      AUDIT_KEY,
      JSON.stringify([full, ...existing].slice(0, MAX_ENTRIES)),
    );

    // registro condiviso (best-effort, non blocca la UI)
    try {
      const token = window.localStorage.getItem(TOKEN_KEY);
      if (token) {
        void fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ entry: full }),
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  } catch {
    // silently ignore storage errors
  }
}

/** React hook per leggere il registro nella pagina AuditLog. */
export function useAuditLog() {
  const [entries, setEntries] = useLocalStorage<AuditEntry[]>(AUDIT_KEY, []);
  const [currentUser, setCurrentUser] = useLocalStorage<string>(USER_KEY, "Sistema");

  // Al mount carica il registro condiviso dal server (se raggiungibile),
  // così tutti i dispositivi vedono lo stesso storico.
  useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem(TOKEN_KEY);
    fetch("/api/audit?limit=2000", {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.entries)) setEntries(d.entries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAll = () => {
    setEntries([]);
    try {
      const token = window.localStorage.getItem(TOKEN_KEY);
      if (token) {
        void fetch("/api/audit", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  };

  return { entries, clearAll, currentUser, setCurrentUser };
}
