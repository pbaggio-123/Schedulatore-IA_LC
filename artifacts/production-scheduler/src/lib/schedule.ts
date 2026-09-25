import {
  Order, Part, Holiday, Employee, CatalogPhase,
  addWorkingDays, computePartWorkingDays, computeEffectiveHours, isNonWorkingDay,
} from "@/types";

export const DAY_HOURS = 8;

// Fasi che occupano SEMPRE giornate intere (non si impacchettano con altre nello
// stesso giorno né condividono lo slot): assemblaggio/cianfrinatura/applicazione.
const FULL_DAY_CODES = new Set(["34K", "34J", "35B"]);
function isFullDayPhase(name: string): boolean {
  return FULL_DAY_CODES.has(phaseCodeOf(name));
}

// Ore di linea consumate dalla fase = ore effettive / addetti (in parallelo).
function lineHoursOf(part: Part): number {
  const workers = part.assignedEmployeeIds.length || 1;
  return computeEffectiveHours(part) / workers;
}

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}
function nextWorkingDay(d: Date, holidays: Holiday[], saturdayWorking: boolean): Date {
  return addWorkingDays(startOfDay(d), 1, holidays, saturdayWorking);
}
// Primo giorno lavorativo a partire da `d` (incluso). Se una fase venisse
// posizionata su sabato/domenica/festivo (es. drag manuale su un weekend), la
// barra del Gantt avrebbe segmenti vuoti e SPARIREBBE: la ancoriamo qui al
// primo giorno utile così resta sempre visibile.
function firstWorkingDay(d: Date, holidays: Holiday[], saturdayWorking: boolean): Date {
  let c = startOfDay(d);
  while (isNonWorkingDay(c, holidays, saturdayWorking)) {
    c = new Date(c); c.setDate(c.getDate() + 1);
  }
  return c;
}

// Calcolo dello scheduling effettivo delle fasi (stesso algoritmo del Gantt):
// sequenza naturale per lotto + accodamento automatico per linea.
// Estratto in modulo condiviso così Gantt e rilevamento sovrapposizioni
// vedono le stesse date.

export interface ScheduledPart extends Part {
  startDate: Date;
  endDate: Date;
  workingDays: number;
  calendarDays: number;
  orderId: string;
  orderName: string;
  lotName: string;
  lotId: string;
  color: string;
  orderStartDate: Date;
  lotIndex: number;
  partIndex: number;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ── Colore per CODICE FASE ──────────────────────────────────────────────────
// Nel calendario/Gantt il colore identifica il TIPO di fase (32A, 32D, 34J…),
// non la commessa: così la stessa lavorazione ha sempre lo stesso colore.
// Il codice è il token prima del " - " nel nome ("32A - TAGLIO…" → "32A").

export function phaseCodeOf(name: string): string {
  const head = (name ?? "").split(/\s*[-–—]\s*/)[0].trim();
  return (head || (name ?? "").trim()).toUpperCase();
}

export function phaseColor(name: string): string {
  const code = phaseCodeOf(name);
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  // hue distribuita, S/L fissi per colori leggibili e distinti tra loro
  return `hsl(${h % 360}, 62%, 52%)`;
}

// ── N° lista di spedizione dal nome del lotto ───────────────────────────────
// Convenzione dei nomi lotto: "252140A2 - 653 - PMU CW09" → codice lotto,
// N° lista di spedizione (1-4 cifre, a volte "XXX" se non ancora assegnata),
// descrizione. Riconosciuto automaticamente, nessun campo da compilare a mano.
export function shippingListOf(lotName: string): string | null {
  const parts = (lotName ?? "").split(/\s*-\s*/);
  if (parts.length < 3 || !parts[1]) return null;
  return parts[1];
}

// ── Fasi esenti dall'accodamento di linea (Catalogo → "Può sovrapporsi") ────
export function overlapAllowedCodesOf(catalogPhases: CatalogPhase[]): Set<string> {
  return new Set(catalogPhases.filter(p => p.canOverlap).map(p => phaseCodeOf(p.name)));
}

export function computeScheduledParts(
  orders: Order[],
  holidays: Holiday[],
  saturdayWorking: boolean,
  // Colore scelto manualmente per CODICE fase (es. {"32A":"#ff0000"}). Se presente
  // vince sul colore automatico. Lo passa il Gantt leggendo i colori del catalogo.
  phaseColors?: Record<string, string>,
  // Codici fase (Catalogo → "Può sovrapporsi") esenti dall'accodamento di linea:
  // restano alla loro data naturale anche se un'altra fase della stessa linea ci
  // si sovrappone, e non spostano in avanti le fasi successive.
  overlapAllowedCodes?: Set<string>,
): ScheduledPart[] {
  const colorOf = (name: string) =>
    phaseColors?.[phaseCodeOf(name)] || phaseColor(name);
  const rawParts: ScheduledPart[] = [];
  orders.forEach(order => {
    const orderStart = new Date(order.startDate + "T00:00:00");
    if (isNaN(orderStart.getTime())) return;
    order.lots.forEach((lot, lotIndex) => {
      lot.parts.forEach((part, partIndex) => {
        // Inizio "naturale" = data manuale (drag) se presente, altrimenti inizio
        // commessa. L'ordinamento intra-lotto è preservato da lotIndex/partIndex;
        // l'accodamento reale lo fa il clock di linea sotto (a ORE, non a giorni).
        const naturalStart = startOfDay(part.manualStartDate
          ? new Date(part.manualStartDate + "T00:00:00")
          : orderStart);
        rawParts.push({
          ...part,
          startDate: naturalStart, endDate: naturalStart,
          workingDays: computePartWorkingDays(part), calendarDays: 0,
          orderId: order.id, orderName: order.name,
          lotName: lot.name, lotId: lot.id,
          color: colorOf(part.name), orderStartDate: orderStart,
          lotIndex, partIndex,
        });
      });
    });
  });

  rawParts.sort((a, b) => {
    const sd = a.startDate.getTime() - b.startDate.getTime();
    if (sd !== 0) return sd;
    const od = a.orderStartDate.getTime() - b.orderStartDate.getTime();
    if (od !== 0) return od;
    if (a.lotIndex !== b.lotIndex) return a.lotIndex - b.lotIndex;
    return a.partIndex - b.partIndex;
  });

  // Accodamento per linea a granularità ORARIA: ogni linea lavora DAY_HOURS/giorno
  // e impacchetta più fasi corte nello stesso giorno (una fase da 1h non brucia
  // più un giorno intero). Il clock tiene {giorno, ore già usate nel giorno}.
  // Eccezione: le fasi FULL_DAY_CODES (34K/34J/35B) partono sempre a inizio
  // giornata e occupano giornate intere, senza condividere lo slot.
  const lineClock: Record<string, { date: Date; used: number } | null> = { L1: null, L2: null, L3: null };

  return rawParts.map(p => {
    // Fase esente: resta alla sua data naturale, ignora e non altera il clock
    // di linea (può sovrapporsi ad altre fasi sulla stessa linea).
    const exempt = overlapAllowedCodes?.has(phaseCodeOf(p.name)) ?? false;
    const clock = exempt ? null : lineClock[p.line];
    // Floor: la linea non può iniziare prima dell'inizio naturale della fase.
    let date: Date, used: number;
    if (!clock || clock.date < p.startDate) {
      date = startOfDay(p.startDate); used = 0;
    } else {
      date = clock.date; used = clock.used;
    }
    // Ancora SEMPRE a un giorno lavorativo: una fase su weekend/festivo avrebbe
    // segmenti vuoti e sparirebbe dal Gantt (bug "la fase scompare dopo il drag").
    const snapped = firstWorkingDay(date, holidays, saturdayWorking);
    if (snapped.getTime() !== date.getTime()) { date = snapped; used = 0; }

    const hours = lineHoursOf(p);

    if (isFullDayPhase(p.name)) {
      if (used > 0) { date = nextWorkingDay(date, holidays, saturdayWorking); used = 0; }
      const days = Math.max(1, Math.ceil(hours / DAY_HOURS));
      const endDate = addWorkingDays(date, days, holidays, saturdayWorking);
      // la prossima fase riparte da un giorno pulito
      if (!exempt) lineClock[p.line] = { date: endDate, used: 0 };
      return { ...p, startDate: date, endDate, calendarDays: daysBetween(date, endDate) };
    }

    // Fase normale: parte dalla posizione corrente (anche a metà giornata).
    const touchedDays = Math.max(1, Math.ceil((used + hours) / DAY_HOURS) - Math.floor(used / DAY_HOURS));
    const endDate = addWorkingDays(date, touchedDays, holidays, saturdayWorking);

    if (!exempt) {
      // Avanza il clock di `hours` ore lavorative.
      const total = used + hours;
      const advance = Math.floor(total / DAY_HOURS);
      const newUsed = total % DAY_HOURS;
      let newDate = date;
      for (let k = 0; k < advance; k++) newDate = nextWorkingDay(newDate, holidays, saturdayWorking);
      lineClock[p.line] = { date: newDate, used: newUsed };
    }

    return { ...p, startDate: date, endDate, calendarDays: daysBetween(date, endDate) };
  });
}

// ── Sovrapposizioni di persona ────────────────────────────────────────────────

export interface EmployeeOverlap {
  employeeId: string;
  employeeName: string;
  a: ScheduledPart;
  b: ScheduledPart;
  overlapStart: Date;
  overlapEnd: Date;
}

/**
 * Trova le coppie di fasi NON completate che condividono una persona e si
 * sovrappongono nel tempo. L'alert è informativo: la sovrapposizione resta
 * consentita.
 */
export function findEmployeeOverlaps(
  parts: ScheduledPart[],
  employees: Employee[],
): EmployeeOverlap[] {
  const overlaps: EmployeeOverlap[] = [];
  const byEmployee = new Map<string, ScheduledPart[]>();

  parts.forEach(p => {
    if (p.status === "done") return; // fasi chiuse non impegnano la persona
    p.assignedEmployeeIds.forEach(id => {
      const list = byEmployee.get(id) ?? [];
      list.push(p);
      byEmployee.set(id, list);
    });
  });

  byEmployee.forEach((list, employeeId) => {
    const employeeName = employees.find(e => e.id === employeeId)?.name ?? employeeId;
    const sorted = [...list].sort((x, y) => x.startDate.getTime() - y.startDate.getTime());
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j];
        if (b.startDate >= a.endDate) break; // ordinati: niente altro può sovrapporsi ad a
        overlaps.push({
          employeeId, employeeName, a, b,
          overlapStart: b.startDate,
          overlapEnd: a.endDate < b.endDate ? a.endDate : b.endDate,
        });
      }
    }
  });

  return overlaps;
}

/** Insieme degli id-fase coinvolti in almeno una sovrapposizione (per i badge Gantt). */
export function overlappingPartIds(overlaps: EmployeeOverlap[]): Set<string> {
  const s = new Set<string>();
  overlaps.forEach(o => { s.add(o.a.id); s.add(o.b.id); });
  return s;
}
