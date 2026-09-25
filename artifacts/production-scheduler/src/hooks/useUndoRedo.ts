import { useCallback, useRef, useSyncExternalStore } from "react";
import { getUndoRedoStore } from "./undoRedoStore";
import { emitLocalWrite, LS_CLOUD_SET_EVENT } from "./useLocalStorage";

function readCurrent<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Applica il valore risultante da annulla/ripeti: scrive su localStorage, lo
// marca da ripushare in cloud come una modifica normale, e notifica TUTTE le
// istanze del hook montate su questa chiave (non solo quella il cui pulsante è
// stato premuto) a rileggere subito — stesso canale del pull dal cloud. Serve
// perché Commesse/Pannello/dettaglio commessa leggono "orders" ciascuno con la
// propria istanza di useSchedulerData: senza questo, annullare dal Pannello una
// modifica fatta nel Gantt (o viceversa) resterebbe non visibile finché non
// arriva il prossimo giro di sync.
function broadcastUndoRedoValue<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
  emitLocalWrite(key, false);
  window.dispatchEvent(new CustomEvent(LS_CLOUD_SET_EVENT, { detail: { key } }));
}

/**
 * Aggiunge annulla/ripeti a uno stato già persistito con useLocalStorage.
 * `historyKey` deve essere la stessa chiave usata per lo storage così lo
 * storico è condiviso fra tutte le pagine che leggono/scrivono quel dato.
 */
export function useUndoRedo<T>(
  historyKey: string,
  value: T,
  setValue: (v: T | ((prev: T) => T)) => void,
) {
  const store = getUndoRedoStore<T>(historyKey);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  // Valore corrente noto a QUESTA istanza: usato solo per registrare il "prima"
  // di una modifica fatta da questa stessa istanza (sempre aggiornato, mai stale
  // per un'operazione che parte da qui). Annulla/ripeti invece leggono sempre lo
  // stato vero da localStorage (vedi sopra), perché possono partire da una
  // pagina diversa da chi ha fatto la modifica.
  const valueRef = useRef(value);
  valueRef.current = value;

  const setValueTracked = useCallback((v: T | ((prev: T) => T)) => {
    store.record(valueRef.current);
    setValue(v);
  }, [store, setValue]);

  const undo = useCallback(() => {
    const current = readCurrent(historyKey, valueRef.current);
    const prev = store.undo(current);
    if (prev !== undefined) broadcastUndoRedoValue(historyKey, prev);
  }, [store, historyKey]);

  const redo = useCallback(() => {
    const current = readCurrent(historyKey, valueRef.current);
    const next = store.redo(current);
    if (next !== undefined) broadcastUndoRedoValue(historyKey, next);
  }, [store, historyKey]);

  return {
    setValue: setValueTracked,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
