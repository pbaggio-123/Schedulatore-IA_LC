import { createContext, useContext, useEffect, useRef, useState } from "react";
import { LS_WRITE_EVENT, writeFromCloud } from "@/hooks/useLocalStorage";
import { toast } from "@/hooks/use-toast";

// Chiavi dati condivise tra i dispositivi della demo. Theme/sessione/account/
// audit restano locali al singolo browser e NON vengono sincronizzati.
const SYNCED_KEYS = [
  "scheduler_employees_ialc",
  "scheduler_orders_ialc",
  "scheduler_holidays",
  "scheduler_catalog_phases_ialc",
  "scheduler_catalog_products_ialc",
  "scheduler_saturday_working",
  "scheduler_skills_ialc",
  "scheduler_shifts_ialc",
  "scheduler_afan_ialc",
] as const;

const DOC_ID = "default";
const POLL_MS = 5000;
const PUSH_DEBOUNCE_MS = 800;
const REV_KEY = "scheduler_cloud_rev_ialc";
// Flag "modifiche locali non ancora salvate sul cloud". Impostato a ogni scrittura
// locale, azzerato solo dopo un push riuscito. Protegge i dati alla riapertura:
// finché è attivo, il locale NON viene sovrascritto dal server.
const DIRTY_KEY = "scheduler_dirty_ialc";
// "Base" = ultimo bundle sincronizzato col server. Il delta da pushare è la
// differenza tra il locale corrente e questa base. Locale al browser, non sync.
const BASE_KEY = "scheduler_sync_base_ialc";

export type SyncStatus = "idle" | "saving" | "synced" | "offline";

export interface SyncState {
  status: SyncStatus;
  lastUpdatedBy: string | null;
  lastUpdatedAt: string | null;
}

const SyncContext = createContext<SyncState>({
  status: "idle",
  lastUpdatedBy: null,
  lastUpdatedAt: null,
});

export function useSyncState(): SyncState {
  return useContext(SyncContext);
}

type CloudResponse = {
  rev: number;
  doc: Record<string, unknown> | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

function readBundle(): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) {
    const raw = window.localStorage.getItem(key);
    if (raw != null) {
      try {
        doc[key] = JSON.parse(raw);
      } catch {
        /* chiave corrotta: la salto */
      }
    }
  }
  return doc;
}

function applyBundle(doc: Record<string, unknown>) {
  for (const key of SYNCED_KEYS) {
    if (key in doc) writeFromCloud(key, doc[key]);
  }
}

function readBase(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(BASE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Allinea la base alla verità sincronizzata corrente (= bundle locale dopo aver
// applicato il server). Da chiamare dopo ogni applyBundle e dopo ogni push OK.
function snapshotBase() {
  try {
    window.localStorage.setItem(BASE_KEY, JSON.stringify(readBundle()));
  } catch {
    /* quota / storage non disponibile: ignoro */
  }
}

// Schema di nesting: per ogni chiave-array, quali campi sono a loro volta array
// di record con `id` da fondere ricorsivamente. {} = record foglia (nessun array
// figlio id). orders → lots → parts permette il merge fino alla singola parte.
type NestSchema = { [childField: string]: NestSchema };
const MERGE_SCHEMA: Record<string, NestSchema> = {
  scheduler_orders_ialc: { lots: { parts: {} } },
  scheduler_employees_ialc: {},
  scheduler_holidays: {},
  scheduler_catalog_phases_ialc: {},
  scheduler_catalog_products_ialc: {},
  scheduler_shifts_ialc: {},
  scheduler_afan_ialc: {},
};

type PatchEntry = {
  id: unknown;
  full?: any;                                // record nuovo (intero)
  fields?: Record<string, unknown>;          // soli campi scalari cambiati
  children?: Record<string, MergeNode>;      // merge ricorsivo su array figli
};
type MergeNode = { upserts: PatchEntry[]; deletes: unknown[] };
type Delta = Record<
  string,
  { op: "replace"; value: unknown } | ({ op: "patch" } & MergeNode)
>;

// Diff di un singolo record (base vs local) dato lo schema dei suoi array figli.
// Ritorna solo i campi scalari cambiati + i merge ricorsivi dei figli, o null se
// identico. Granularità: due utenti che cambiano campi/figli DIVERSI non collidono.
function diffRecord(base: any, local: any, schema: NestSchema): Omit<PatchEntry, "id"> | null {
  const childFields = Object.keys(schema);
  const fields: Record<string, unknown> = {};
  const scalarKeys = new Set<string>([...Object.keys(base ?? {}), ...Object.keys(local ?? {})]);
  for (const f of childFields) scalarKeys.delete(f);
  for (const k of scalarKeys) {
    if (JSON.stringify(base?.[k]) !== JSON.stringify(local?.[k])) fields[k] = local?.[k];
  }
  const children: Record<string, MergeNode> = {};
  for (const cf of childFields) {
    const node = diffArray(base?.[cf], local?.[cf], schema[cf]);
    if (node) children[cf] = node;
  }
  const out: Omit<PatchEntry, "id"> = {};
  if (Object.keys(fields).length) out.fields = fields;
  if (Object.keys(children).length) out.children = children;
  return out.fields || out.children ? out : null;
}

// Diff di un array di record per `id` → MergeNode (upsert/delete) o null.
function diffArray(base: unknown, local: unknown, schema: NestSchema): MergeNode | null {
  const bArr = Array.isArray(base) ? (base as any[]) : [];
  const lArr = Array.isArray(local) ? (local as any[]) : [];
  const bMap = new Map(bArr.map((r) => [r?.id, r]));
  const upserts: PatchEntry[] = [];
  for (const rec of lArr) {
    if (rec?.id == null) continue;
    if (!bMap.has(rec.id)) {
      upserts.push({ id: rec.id, full: rec });     // record nuovo
    } else {
      const p = diffRecord(bMap.get(rec.id), rec, schema);
      if (p) upserts.push({ id: rec.id, ...p });    // record modificato (patch)
    }
  }
  const lIds = new Set(lArr.map((r) => r?.id));
  const deletes = bArr.map((r) => r?.id).filter((id) => id != null && !lIds.has(id));
  if (!upserts.length && !deletes.length) return null;
  return { upserts, deletes };
}

// Differenza locale↔base. Chiavi-array di record → patch ricorsivo per id (merge
// fino al livello foglia indicato dallo schema). Altre chiavi → replace se cambia.
function computeDelta(base: Record<string, unknown>, local: Record<string, unknown>): Delta {
  const delta: Delta = {};
  for (const key of SYNCED_KEYS) {
    if (MERGE_SCHEMA[key]) {
      const node = diffArray(base[key], local[key], MERGE_SCHEMA[key]);
      if (node) delta[key] = { op: "patch", upserts: node.upserts, deletes: node.deletes };
    } else {
      const l = local[key];
      if (l !== undefined && JSON.stringify(l) !== JSON.stringify(base[key])) {
        delta[key] = { op: "replace", value: l };
      }
    }
  }
  return delta;
}

function currentUser(): string | null {
  try {
    const raw = window.localStorage.getItem("scheduler_current_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Monta una sincronizzazione leggera last-write-wins su /api/state:
 * - pull ogni 5s; se la revisione remota è più recente, applica il documento
 * - push (debounced) a ogni scrittura locale sulle chiavi condivise
 * Espone lo stato (status + chi/quando) via context per la UI (SyncBadge).
 * `rev` sopprime l'eco del proprio push. In dev senza /api fallisce in silenzio.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const localRev = useRef<number>(0);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialDone = useRef<boolean>(false);
  const [state, setState] = useState<SyncState>({
    status: "idle",
    lastUpdatedBy: null,
    lastUpdatedAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    localRev.current = Number(window.localStorage.getItem(REV_KEY) ?? 0) || 0;

    const setRev = (rev: number) => {
      localRev.current = rev;
      window.localStorage.setItem(REV_KEY, String(rev));
    };

    const authHeaders = (): Record<string, string> => {
      const token = window.localStorage.getItem("scheduler_token");
      return token ? { Authorization: `Bearer ${token}` } : {};
    };

    async function pull(): Promise<void> {
      try {
        // Modifiche locali non ancora salvate: invece di subire il server, (ri)prova
        // a pushare il delta pendente — così un push fallito (offline/contesa) viene
        // ritentato a ogni ciclo, e il pull non sovrascrive il locale non salvato.
        if (window.localStorage.getItem(DIRTY_KEY) === "1") {
          void push();
          return;
        }
        const res = await fetch(`/api/state?id=${DOC_ID}`, { cache: "no-store", headers: authHeaders() });
        if (!res.ok) {
          console.error(`[sync] pull /api/state -> ${res.status}`);
          if (!cancelled) setState((s) => ({ ...s, status: "offline" }));
          return;
        }
        const data: CloudResponse = await res.json();
        if (cancelled) return;
        if (data.rev > localRev.current && data.doc) {
          applyBundle(data.doc);
          snapshotBase();
          setRev(data.rev);
          setState({
            status: "synced",
            lastUpdatedBy: data.updatedBy ?? null,
            lastUpdatedAt: data.updatedAt ?? null,
          });
          // Notifica solo le modifiche arrivate DOPO il sync iniziale e fatte
          // da un altro utente (non l'eco del nostro stesso push).
          if (initialDone.current && data.updatedBy && data.updatedBy !== currentUser()) {
            toast({
              title: "Dati aggiornati",
              description: `Modifiche da ${data.updatedBy}`,
            });
          }
        } else if (state.status === "offline") {
          setState((s) => ({ ...s, status: "synced" }));
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, status: "offline" }));
      }
    }

    // Push come DELTA (merge per-record): inviamo solo i record cambiati rispetto
    // alla base. Il server li fonde sullo stato corrente e ci restituisce il doc
    // risultante (che include eventuali modifiche di altri utenti). Niente 409:
    // record diversi non collidono; sullo stesso record vince l'ultimo upsert.
    async function push(): Promise<void> {
      const local = readBundle();
      // Non pushare mai con bundle locale vuoto (browser senza dati / partial).
      if (Object.keys(local).length === 0) return;
      const delta = computeDelta(readBase(), local);
      if (Object.keys(delta).length === 0) {
        // Niente di nuovo da salvare: la base è già allineata.
        window.localStorage.removeItem(DIRTY_KEY);
        return;
      }
      if (!cancelled) setState((s) => ({ ...s, status: "saving" }));
      try {
        const token = window.localStorage.getItem("scheduler_token");
        const res = await fetch(`/api/state?id=${DOC_ID}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ id: DOC_ID, delta, updatedBy: currentUser() }),
        });
        if (!res.ok) {
          // Offline o contesa transitoria (503): teniamo il flag dirty, il prossimo
          // ciclo di pull ritenterà il push automaticamente.
          console.error(`[sync] push /api/state -> ${res.status}`);
          if (!cancelled) setState((s) => ({ ...s, status: "offline" }));
          return;
        }
        const data: { rev: number; doc?: Record<string, unknown>; updatedAt?: string } = await res.json();
        if (cancelled) return;
        // Assorbi il doc fuso (può contenere modifiche altrui) e riallinea la base.
        if (data.doc) applyBundle(data.doc);
        snapshotBase();
        setRev(data.rev);
        window.localStorage.removeItem(DIRTY_KEY); // push riuscito: niente più modifiche pendenti
        setState({
          status: "synced",
          lastUpdatedBy: currentUser(),
          lastUpdatedAt: data.updatedAt ?? null,
        });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, status: "offline" }));
      }
    }

    // Sync iniziale: se il server ha già un documento più recente lo applico,
    // altrimenti pubblico lo stato locale corrente (dati demo o modifiche).
    // Richiede token (le letture sono protette): rieseguita dopo il login.
    async function initialSync(): Promise<void> {
      try {
        // Se il locale ha modifiche non ancora salvate (dirty), NON farle
        // sovrascrivere dal server alla riapertura: pushale (rebase sulla rev
        // del server → vincono). Questa era la causa della perdita dati.
        const localBundle = readBundle();
        if (window.localStorage.getItem(DIRTY_KEY) === "1" && Object.keys(localBundle).length > 0) {
          await push();
          return;
        }
        const res = await fetch(`/api/state?id=${DOC_ID}`, { cache: "no-store", headers: authHeaders() });
        if (res.ok) {
          const data: CloudResponse = await res.json();
          if (!cancelled) {
            if (data.rev > 0 && data.doc) {
              applyBundle(data.doc);
              snapshotBase();
              setRev(data.rev);
              setState({
                status: "synced",
                lastUpdatedBy: data.updatedBy ?? null,
                lastUpdatedAt: data.updatedAt ?? null,
              });
            } else if (Object.keys(localBundle).length > 0) {
              // Server vuoto e locale con dati reali: pubblica il locale.
              await push();
            }
          }
        } else if (!cancelled) {
          console.error(`[sync] initialSync /api/state -> ${res.status}`);
          setState((s) => ({ ...s, status: "offline" }));
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, status: "offline" }));
      } finally {
        initialDone.current = true;
      }
    }
    void initialSync();

    // dopo il login arriva il token → ripeti la sync (le letture sono protette)
    const onToken = () => { void initialSync(); };
    window.addEventListener("scheduler:token", onToken);

    const onLocalWrite = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key: string; fromCloud: boolean };
      if (detail?.fromCloud) return;
      if (!SYNCED_KEYS.includes(detail?.key as (typeof SYNCED_KEYS)[number])) return;
      // Marca subito le modifiche come non salvate: se l'utente chiude prima del
      // push, alla riapertura saranno protette (vedi initialSync/pull).
      window.localStorage.setItem(DIRTY_KEY, "1");
      setState((s) => ({ ...s, status: "saving" }));
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => push(), PUSH_DEBOUNCE_MS);
    };

    window.addEventListener(LS_WRITE_EVENT, onLocalWrite as EventListener);
    const interval = setInterval(pull, POLL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener(LS_WRITE_EVENT, onLocalWrite as EventListener);
      window.removeEventListener("scheduler:token", onToken);
      clearInterval(interval);
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <SyncContext.Provider value={state}>{children}</SyncContext.Provider>;
}
