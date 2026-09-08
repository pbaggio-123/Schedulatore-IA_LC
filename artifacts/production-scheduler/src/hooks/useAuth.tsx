import { createContext, useContext, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

// ─── Tier / Account ───────────────────────────────────────────────────────────
// DEMO: account e password vivono in localStorage in chiaro. In produzione la
// verifica va fatta lato server (vedi reference/antigravity-backend).

export type Tier = 1 | 2 | 3 | 4;

export const TIER_LABELS: Record<Tier, string> = {
  1: "Visualizzatore",
  2: "Operatore",
  3: "Pianificatore",
  4: "Amministratore",
};

export interface Account {
  id: string;
  username: string;
  password: string; // demo: in chiaro, palesemente finta
  displayName: string;
  tier: Tier;
}

export const DEMO_ACCOUNTS: Account[] = [
  { id: "u1", username: "demo-viewer",    password: "demo-viewer",    displayName: "Vera Visiona (demo)",    tier: 1 },
  { id: "u2", username: "demo-operatore", password: "demo-operatore", displayName: "Oreste Operai (demo)",   tier: 2 },
  { id: "u3", username: "demo-planner",   password: "demo-planner",   displayName: "Pia Pianifica (demo)",   tier: 3 },
  { id: "u4", username: "demo-admin",     password: "demo-admin",     displayName: "Ada Amministra (demo)",  tier: 4 },
];

// ─── Capability → tier minimo ────────────────────────────────────────────────

export type Capability =
  | "exportCsv"          // 1: lettura
  | "updatePhaseStatus"  // 2
  | "movePhases"         // 2: date nel Gantt
  | "assignPerson"       // 2
  | "manageShifts"       // 2: turni di lavoro
  | "crudOrders"         // 3: commesse/lotti/fasi
  | "manageCatalog"      // 3
  | "manageEmployees"    // 3
  | "manageHolidays"     // 3
  | "importData"         // 3
  | "viewAudit"          // 3
  | "clearAudit"         // 4
  | "manageUsers";       // 4

const MIN_TIER: Record<Capability, Tier> = {
  exportCsv: 1,
  updatePhaseStatus: 2,
  movePhases: 2,
  assignPerson: 2,
  manageShifts: 2,
  crudOrders: 3,
  manageCatalog: 3,
  manageEmployees: 3,
  manageHolidays: 3,
  importData: 3,
  viewAudit: 3,
  clearAudit: 4,
  manageUsers: 4,
};

// ─── Context ─────────────────────────────────────────────────────────────────

const ACCOUNTS_KEY = "scheduler_accounts";
const SESSION_KEY  = "scheduler_session";
const AUDIT_USER_KEY = "scheduler_current_user"; // letto da useAuditLog
const TOKEN_KEY = "scheduler_token"; // token HMAC per autorizzare le scritture sync

// Best-effort: chiede al server un token firmato per le credenziali demo.
// Se /api non c'è (dev) o offline, la sync resterà in sola lettura.
async function fetchSyncToken(username: string, password: string) {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.token) {
        window.localStorage.setItem(TOKEN_KEY, data.token);
        // sblocca le letture protette: SyncProvider/audit rifanno la sync
        window.dispatchEvent(new CustomEvent("scheduler:token"));
      }
    }
  } catch {
    /* dev/offline: nessun token */
  }
}

interface AuthContextValue {
  user: Account | null;
  accounts: Account[];
  setAccounts: (a: Account[] | ((prev: Account[]) => Account[])) => void;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  can: (cap: Capability) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useLocalStorage<Account[]>(ACCOUNTS_KEY, DEMO_ACCOUNTS);
  const [sessionId, setSessionId] = useLocalStorage<string | null>(SESSION_KEY, null);

  const user = accounts.find(a => a.id === sessionId) ?? null;

  // tiene allineato il nome utente usato dal registro modifiche
  useEffect(() => {
    try {
      if (user) window.localStorage.setItem(AUDIT_USER_KEY, JSON.stringify(user.displayName));
      else window.localStorage.removeItem(AUDIT_USER_KEY);
    } catch { /* ignore */ }
  }, [user]);

  // Sessione ripristinata da localStorage al reload: `login` NON viene chiamato,
  // quindi il token NON sarebbe rinnovato e, una volta scaduto, il client andrebbe
  // offline in silenzio (modifiche solo locali, non condivise). Rinnoviamo qui il
  // token a ogni avvio finché c'è una sessione attiva.
  useEffect(() => {
    if (user) void fetchSyncToken(user.username, user.password);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = (username: string, password: string) => {
    const found = accounts.find(a => a.username === username && a.password === password);
    if (!found) return false;
    setSessionId(found.id);
    void fetchSyncToken(username, password); // autorizza le scritture sync
    return true;
  };

  const logout = () => {
    setSessionId(null);
    try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  };

  const can = (cap: Capability) => !!user && user.tier >= MIN_TIER[cap];

  return (
    <AuthContext.Provider value={{ user, accounts, setAccounts, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro AuthProvider");
  return ctx;
}
