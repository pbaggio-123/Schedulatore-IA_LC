/** Dynamic skill tag — stored in localStorage, fully editable from the Catalogo page. */
export type SkillTag = string;

export interface Employee {
  id: string;
  name: string;
  skills: SkillTag[];
  /** Numero matricola aziendale (importabile da CSV/Excel). */
  matricola?: string;
}

export interface CatalogPhase {
  id: string;
  name: string;
  skill: SkillTag;
  hoursPerUnit: number;
  unit: string;
  /** Colore scelto per questa fase nel calendario/Gantt (es. "#ef4444"). Se vuoto
   *  il colore viene generato automaticamente dal codice fase. */
  color?: string;
}

export interface CatalogProduct {
  id: string;
  code: string;
  name: string;
  phaseIds: string[];
}

/** Riga del registro "Conteggio ore Afan": confronto tempo preventivato (PDP)
 *  vs tempo effettivo (RTA) per commessa/fase. Campi liberi (come nel foglio
 *  di origine): niente calcolo automatico, il valore va scritto da chi compila. */
export interface AfanEntry {
  id: string;
  commessaNum: string;
  commessaName: string;
  faseCode: string;
  tempoPreventivato: string;
  tempoEffettivo: string;
  differenzaOre: string;
  totaleOre: string;
  operatore: string;
  note: string;
  sistemaSchuco: string;
  quantita: string;
  opNum: string;
}

export interface Part {
  id: string;
  name: string;
  estimatedHours: number;
  requiredSkill: SkillTag;
  assignedEmployeeIds: string[];
  line: "L1" | "L2" | "L3";
  status: "pending" | "in-progress" | "done";
  manualStartDate?: string;
  catalogPhaseId?: string;
  catalogProductId?: string;
  quantity?: number;
  /** Percentage adjustment applied on top of estimatedHours (+10 = +10%, -15 = -15%). */
  adjustment?: number;
}

export interface Lot {
  id: string;
  name: string;
  parts: Part[];
  /** Id del subitem Kissflow di origine (assente se il lotto è manuale). */
  kissflowId?: string;
  /** Stato del subitem lato Kissflow (es. "In corso"): solo informativo. */
  externalStatus?: string;
  /** Scadenza del subitem lato Kissflow (YYYY-MM-DD): solo informativa. */
  dueDate?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  name: string;
  startDate: string;
  lots: Lot[];
  color: string;
  /** Id dell'item Kissflow di origine (assente se la commessa è manuale). */
  kissflowId?: string;
  assignee?: string;
  priority?: string;
  /** Stato del workflow lato Kissflow (es. "GRAZIA"): solo informativo. */
  kissflowStatus?: string;
  requester?: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  recurring: boolean;
}

// ─── Turni di lavoro ────────────────────────────────────────────────────────────

export type ShiftType = "mattina" | "pomeriggio" | "notte" | "giornata";

export interface Shift {
  id: string;
  employeeId: string;
  date: string; // yyyy-mm-dd
  type: ShiftType;
}

export const SHIFT_TYPES: ShiftType[] = ["mattina", "pomeriggio", "notte", "giornata"];

export const SHIFT_LABELS: Record<ShiftType, string> = {
  mattina: "Mattina",
  pomeriggio: "Pomeriggio",
  notte: "Notte",
  giornata: "In giornata",
};

export const SHIFT_SHORT: Record<ShiftType, string> = {
  mattina: "M",
  pomeriggio: "P",
  notte: "N",
  giornata: "G",
};

// ore coperte da ciascun turno: giornata intera 8h, mezze giornate mattina/pomeriggio 4h, notte 8h
export const SHIFT_HOURS: Record<ShiftType, number> = {
  mattina: 4,
  pomeriggio: 4,
  notte: 8,
  giornata: 8,
};

// turno predefinito: ogni operatore è "in giornata" salvo modifica esplicita
export const DEFAULT_SHIFT: ShiftType = "giornata";

// ─── Date utilities ───────────────────────────────────────────────────────────

export function formatISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function isHoliday(date: Date, holidays: Holiday[]): boolean {
  const full = formatISODate(date);
  const mmdd = full.slice(5);
  return holidays.some(h => (h.recurring ? h.date.slice(5) === mmdd : h.date === full));
}

/** Returns true if the day is Saturday (day=6) or Sunday (day=0). */
export function isWeekend(date: Date, saturdayWorking: boolean): boolean {
  const day = date.getDay();
  if (day === 0) return true;                          // Sunday — always off
  if (day === 6 && !saturdayWorking) return true;      // Saturday — off unless enabled
  return false;
}

/** Combined check: holiday OR weekend (taking saturdayWorking into account). */
export function isNonWorkingDay(date: Date, holidays: Holiday[], saturdayWorking: boolean): boolean {
  return isHoliday(date, holidays) || isWeekend(date, saturdayWorking);
}

export function computeEffectiveHours(part: Part): number {
  const adj = part.adjustment ?? 0;
  return part.estimatedHours * (1 + adj / 100);
}

export function computePartWorkingDays(part: Part): number {
  const effective = computeEffectiveHours(part);
  const workers   = part.assignedEmployeeIds.length || 1;
  return Math.max(1, Math.ceil(effective / (8 * workers)));
}

export function computePartDurationDays(part: Part): number {
  return computePartWorkingDays(part);
}

/**
 * Advance `start` by `workingDays` working days, skipping holidays and weekends.
 * `saturdayWorking` defaults to false (Saturday = non-working).
 */
// ─── Audit Trail ──────────────────────────────────────────────────────────────

export type AuditActionType =
  | "creazione"
  | "modifica"
  | "cancellazione"
  | "cambio_stato"
  | "cambio_personale"
  | "cambio_linea"
  | "cambio_data";

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  orderId?: string;
  orderNumber?: string;
  lotId?: string;
  lotName?: string;
  partId?: string;
  partName?: string;
  actionType: AuditActionType;
  field?: string;
  previousValue?: string;
  newValue?: string;
  notes?: string;
}

export function addWorkingDays(
  start: Date,
  workingDays: number,
  holidays: Holiday[],
  saturdayWorking = false,
): Date {
  let current = new Date(start);
  let added = 0;
  while (added < workingDays) {
    current = new Date(current);
    current.setDate(current.getDate() + 1);
    if (!isNonWorkingDay(current, holidays, saturdayWorking)) added++;
  }
  return current;
}
