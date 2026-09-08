import { useState, useEffect } from "react";

// Evento custom emesso a ogni scrittura locale (lo ascolta il SyncProvider per
// fare push verso il cloud). `fromCloud` distingue le scritture applicate da una
// pull remota, che NON vanno ri-pushate.
export const LS_WRITE_EVENT = "scheduler:ls-write";
// Evento emesso quando una pull dal cloud ha aggiornato una chiave: ogni hook
// montato su quella chiave rilegge da localStorage e aggiorna lo stato React.
export const LS_CLOUD_SET_EVENT = "scheduler:ls-cloud-set";

export function emitLocalWrite(key: string, fromCloud = false) {
  window.dispatchEvent(new CustomEvent(LS_WRITE_EVENT, { detail: { key, fromCloud } }));
}

// Scrive una chiave provenendo dal cloud: aggiorna localStorage e notifica gli
// hook vivi senza marcare la scrittura come "da ri-pushare".
export function writeFromCloud(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(LS_CLOUD_SET_EVENT, { detail: { key } }));
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        emitLocalWrite(key, false);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Riallinea lo stato React quando la chiave cambia per vie esterne:
  // - pull dal cloud (LS_CLOUD_SET_EVENT)
  // - altra tab dello stesso browser (storage event)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reread = () => {
      try {
        const item = window.localStorage.getItem(key);
        setStoredValue(item ? JSON.parse(item) : initialValue);
      } catch (error) {
        console.error(error);
      }
    };

    const onCloudSet = (e: Event) => {
      if ((e as CustomEvent).detail?.key === key) reread();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) reread();
    };

    window.addEventListener(LS_CLOUD_SET_EVENT, onCloudSet as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LS_CLOUD_SET_EVENT, onCloudSet as EventListener);
      window.removeEventListener("storage", onStorage);
    };
    // initialValue volutamente escluso: è stabile per chiave in questo codebase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [storedValue, setValue] as const;
}
