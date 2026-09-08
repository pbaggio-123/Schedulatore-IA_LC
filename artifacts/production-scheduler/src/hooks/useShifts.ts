import { useLocalStorage } from "./useLocalStorage";
import { Shift } from "@/types";

const SHIFTS_KEY = "scheduler_shifts_ialc";

/** Turni di lavoro — condivisi via cloud sync (vedi SYNCED_KEYS in SyncProvider). */
export function useShifts() {
  const [shifts, setShifts] = useLocalStorage<Shift[]>(SHIFTS_KEY, []);
  return { shifts, setShifts };
}
