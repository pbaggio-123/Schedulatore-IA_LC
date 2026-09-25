// Storico annulla/ripeti in memoria, condiviso fra tutte le pagine che editano
// la stessa chiave (es. Commesse e Pannello condividono lo storico di "orders":
// annullare una modifica fatta dal Pannello si vede anche tornando su Commesse).
// Vive solo per la durata della scheda del browser: un reload azzera lo storico,
// come ci si aspetta da un annulla/ripeti locale (non è collegato alla sync cloud).

type Listener = () => void;

interface HistoryState<T> {
  past: T[];
  future: T[];
}

const EMPTY_STATE: HistoryState<never> = { past: [], future: [] };

class UndoRedoStore<T> {
  private state: HistoryState<T> = EMPTY_STATE;
  private listeners = new Set<Listener>();
  private readonly limit: number;

  constructor(limit = 50) {
    this.limit = limit;
  }

  getSnapshot = (): HistoryState<T> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private emit() {
    this.listeners.forEach(l => l());
  }

  /** Registra `prevValue` come punto a cui tornare, PRIMA di applicare una modifica. */
  record(prevValue: T) {
    this.state = { past: [...this.state.past, prevValue].slice(-this.limit), future: [] };
    this.emit();
  }

  undo(currentValue: T): T | undefined {
    const { past, future } = this.state;
    if (past.length === 0) return undefined;
    const prev = past[past.length - 1];
    this.state = { past: past.slice(0, -1), future: [currentValue, ...future].slice(0, this.limit) };
    this.emit();
    return prev;
  }

  redo(currentValue: T): T | undefined {
    const { past, future } = this.state;
    if (future.length === 0) return undefined;
    const next = future[0];
    this.state = { past: [...past, currentValue].slice(-this.limit), future: future.slice(1) };
    this.emit();
    return next;
  }
}

const stores = new Map<string, UndoRedoStore<unknown>>();

export function getUndoRedoStore<T>(key: string): UndoRedoStore<T> {
  let s = stores.get(key);
  if (!s) { s = new UndoRedoStore<T>(); stores.set(key, s); }
  return s as UndoRedoStore<T>;
}
