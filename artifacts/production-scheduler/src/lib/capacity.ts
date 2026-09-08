import {
  Employee, Holiday, Shift,
  computeEffectiveHours, SHIFT_HOURS, DEFAULT_SHIFT, isNonWorkingDay, formatISODate,
} from "@/types";
import { ScheduledPart } from "./schedule";

// Carico/saturazione per persona e suggerimento di assegnazione.
// Tutto derivato dalle fasi schedulate (stesse date di Gantt/overlap).

const HOURS_PER_DAY = 8;

export interface EmployeeLoad {
  employee: Employee;
  assignedHours: number; // ore effettive a suo carico (quota divisa tra gli assegnati)
  partCount: number;
  spanDays: number; // giorni calendario coperti dalle sue fasi attive
  capacityHours: number; // ore lavorabili nella finestra (giorni lavorativi * ore/turno)
  availableHoursPerDay: number; // ore medie/giorno lavorabili date dai turni (8 = giornata piena)
  saturation: number; // assignedHours / capacityHours (0..>1)
}

// Opzioni per calcolare la capacità sulle ORE REALI dei turni. Se `shifts` non è
// passato, si usa la giornata piena (8h) per tutti, come prima.
export interface CapacityOptions {
  shifts?: Shift[];
  holidays?: Holiday[];
  saturdayWorking?: boolean;
}

// Ore medie lavorabili al giorno per una persona nella finestra [min..max], dai
// turni: giorno con turno salvato = ore di quel turno; giorno lavorativo senza
// record = default «in giornata» (8h); giorno non lavorativo = 0 (escluso dalla
// media). Stessa logica di Turni.tsx. Senza turni → 8h piene.
function avgDailyShiftHours(
  empId: string, min: Date, max: Date,
  shiftMap: Map<string, Shift["type"]>, holidays: Holiday[], saturdayWorking: boolean,
): number {
  let total = 0, days = 0;
  const d = new Date(min);
  while (d <= max) {
    if (!isNonWorkingDay(d, holidays, saturdayWorking)) {
      const t = shiftMap.get(`${empId}|${formatISODate(d)}`) ?? DEFAULT_SHIFT;
      total += SHIFT_HOURS[t];
      days += 1;
    }
    d.setDate(d.getDate() + 1);
  }
  return days > 0 ? total / days : HOURS_PER_DAY;
}

export function computeEmployeeLoads(
  parts: ScheduledPart[],
  employees: Employee[],
  opts?: CapacityOptions,
): EmployeeLoad[] {
  const map = new Map<string, { hours: number; count: number; min?: Date; max?: Date; workDays: number }>();

  for (const p of parts) {
    if (p.status === "done") continue; // le fasi chiuse non pesano
    const workers = p.assignedEmployeeIds.length || 1;
    const quota = computeEffectiveHours(p) / workers;
    for (const id of p.assignedEmployeeIds) {
      const cur = map.get(id) ?? { hours: 0, count: 0, workDays: 0 };
      cur.hours += quota;
      cur.count += 1;
      cur.workDays += p.workingDays;
      cur.min = !cur.min || p.startDate < cur.min ? p.startDate : cur.min;
      cur.max = !cur.max || p.endDate > cur.max ? p.endDate : cur.max;
      map.set(id, cur);
    }
  }

  // Indice turni per (dipendente|data) → tipo, solo se passati i turni.
  const useShiftHours = Array.isArray(opts?.shifts);
  const shiftMap = new Map<string, Shift["type"]>();
  if (useShiftHours) for (const s of opts!.shifts!) shiftMap.set(`${s.employeeId}|${s.date}`, s.type);
  const holidays = opts?.holidays ?? [];
  const saturdayWorking = opts?.saturdayWorking ?? false;

  return employees
    .map((e) => {
      const m = map.get(e.id);
      const spanDays = m?.min && m?.max ? Math.round((m.max.getTime() - m.min.getTime()) / 86400000) : 0;
      const availableHoursPerDay =
        useShiftHours && m?.min && m?.max
          ? avgDailyShiftHours(e.id, m.min, m.max, shiftMap, holidays, saturdayWorking)
          : HOURS_PER_DAY;
      const capacityHours = (m?.workDays ?? 0) * availableHoursPerDay;
      const assignedHours = m?.hours ?? 0;
      const saturation = capacityHours > 0 ? assignedHours / capacityHours : 0;
      return {
        employee: e,
        assignedHours,
        partCount: m?.count ?? 0,
        spanDays,
        capacityHours,
        availableHoursPerDay,
        saturation,
      };
    })
    .sort((a, b) => b.assignedHours - a.assignedHours);
}

export interface Suggestion {
  employee: Employee;
  assignedHours: number;
  hasSkill: boolean;
}

/**
 * Suggerisce i dipendenti per una fase: prima chi ha la skill richiesta, in
 * ordine di minor carico attuale. Esclude chi è già assegnato.
 */
export function suggestEmployees(
  requiredSkill: string,
  employees: Employee[],
  loads: EmployeeLoad[],
  excludeIds: string[] = [],
): Suggestion[] {
  const loadById = new Map(loads.map((l) => [l.employee.id, l.assignedHours]));
  return employees
    .filter((e) => !excludeIds.includes(e.id))
    .map((e) => ({
      employee: e,
      assignedHours: loadById.get(e.id) ?? 0,
      hasSkill: e.skills.includes(requiredSkill),
    }))
    .sort((a, b) => {
      if (a.hasSkill !== b.hasSkill) return a.hasSkill ? -1 : 1; // skill prima
      return a.assignedHours - b.assignedHours; // poi meno carico
    });
}
