import { useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useShifts } from "@/hooks/useShifts";
import { useAuth } from "@/hooks/useAuth";
import { addAuditEntry } from "@/hooks/useAuditLog";
import {
  ShiftType, SHIFT_TYPES, SHIFT_SHORT, SHIFT_LABELS, SHIFT_HOURS, DEFAULT_SHIFT,
  formatISODate, isNonWorkingDay,
} from "@/types";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";

function mondayOf(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = (r.getDay() + 6) % 7; // 0 = lunedì
  r.setDate(r.getDate() - day);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const TYPE_COLOR: Record<ShiftType, string> = {
  mattina: "bg-sky-500 text-white border-sky-500",
  pomeriggio: "bg-amber-500 text-white border-amber-500",
  notte: "bg-indigo-500 text-white border-indigo-500",
  giornata: "bg-emerald-500 text-white border-emerald-500",
};

export default function Turni() {
  const { employees, holidays, saturdayWorking } = useSchedulerData();
  const { shifts, setShifts } = useShifts();
  const { can } = useAuth();
  const canEdit = can("manageShifts");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekDs = useMemo(() => days.map(formatISODate), [days]);

  // turno esplicitamente salvato per (dipendente, giorno), se esiste
  const explicit = (empId: string, ds: string) =>
    shifts.find((s) => s.employeeId === empId && s.date === ds);

  // turno effettivo: quello salvato oppure il default «in giornata» nei giorni lavorativi
  const effectiveType = (empId: string, ds: string, working: boolean): ShiftType | null => {
    const rec = explicit(empId, ds);
    if (rec) return rec.type;
    return working ? DEFAULT_SHIFT : null;
  };

  const weekHours = (empId: string) =>
    weekDs.reduce((sum, ds, i) => {
      if (isNonWorkingDay(days[i], holidays, saturdayWorking)) return sum;
      const t = effectiveType(empId, ds, true);
      return sum + (t ? SHIFT_HOURS[t] : 0);
    }, 0);

  // selezione singola: imposta il turno del giorno; «in giornata» = default (nessun record salvato)
  const setType = (empId: string, empName: string, ds: string, type: ShiftType) => {
    if (!canEdit) return;
    const current = effectiveType(empId, ds, true) ?? DEFAULT_SHIFT;
    if (type === current) return; // già selezionato, niente da fare
    const without = shifts.filter((s) => !(s.employeeId === empId && s.date === ds));
    if (type === DEFAULT_SHIFT) {
      // ritorno al default: rimuovo il record esplicito
      setShifts(without);
    } else {
      const id = `sh${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      setShifts([...without, { id, employeeId: empId, date: ds, type }]);
    }
    addAuditEntry({
      actionType: "cambio_personale", field: "Turno",
      previousValue: `${empName} · ${SHIFT_LABELS[current]} · ${ds}`,
      newValue: `${empName} · ${SHIFT_LABELS[type]} · ${ds}`,
      notes: type === DEFAULT_SHIFT ? "Ripristinato turno in giornata (default)" : "Turno modificato",
    });
  };

  const weekLabel =
    `${days[0].toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} – ` +
    `${days[6].toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-4 h-full overflow-auto">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-2xl font-bold uppercase tracking-tight text-primary flex items-center gap-2">
            <CalendarClock size={22} /> Turni di Lavoro
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))} data-testid="button-week-today">Oggi</Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(addDays(weekStart, -7))} title="Settimana precedente"><ChevronLeft size={16} /></Button>
            <span className="text-sm font-mono w-44 text-center">{weekLabel}</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(addDays(weekStart, 7))} title="Settimana successiva"><ChevronRight size={16} /></Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Ogni operatore è <span className="font-semibold text-emerald-500">In giornata</span> come impostazione predefinita.
          {canEdit ? " Seleziona Mattina o Pomeriggio (mezza giornata) per le eccezioni." : ""}
        </p>
        {!canEdit && (
          <p className="text-xs text-amber-500">Sola lettura: serve un account Operatore o superiore per gestire i turni.</p>
        )}

        <div className="bg-card border border-card-border rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs uppercase bg-muted text-muted-foreground">
                <th className="px-3 py-2 text-left sticky left-0 bg-muted z-10">Dipendente</th>
                {days.map((d, i) => {
                  const nonW = isNonWorkingDay(d, holidays, saturdayWorking);
                  return (
                    <th key={i} className={`px-2 py-2 text-center font-mono ${nonW ? "text-muted-foreground/50" : ""}`}>
                      {d.toLocaleDateString("it-IT", { weekday: "short" })}<br />
                      <span className="text-[10px]">{d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-center">Ore</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-t border-border">
                  <td className="px-3 py-2 font-bold whitespace-nowrap sticky left-0 bg-card z-10">{emp.name}</td>
                  {weekDs.map((ds, i) => {
                    const nonW = isNonWorkingDay(days[i], holidays, saturdayWorking);
                    const eff = effectiveType(emp.id, ds, !nonW);
                    return (
                      <td key={ds} className={`px-1.5 py-1.5 text-center ${nonW ? "bg-muted/30" : ""}`}>
                        {nonW ? (
                          <span className="text-[10px] text-muted-foreground/40">—</span>
                        ) : (
                          <div className="flex justify-center gap-0.5">
                            {SHIFT_TYPES.map((type) => {
                              const on = eff === type;
                              return (
                                <button
                                  key={type}
                                  disabled={!canEdit}
                                  onClick={() => setType(emp.id, emp.name, ds, type)}
                                  title={`${emp.name} · ${SHIFT_LABELS[type]} · ${ds}`}
                                  className={`w-5 h-5 rounded text-[10px] font-bold border transition-colors ${
                                    on ? TYPE_COLOR[type] : "border-border text-muted-foreground/50 hover:border-foreground/40"
                                  } ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                                  data-testid={`shift-${emp.id}-${ds}-${type}`}
                                >
                                  {SHIFT_SHORT[type]}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-mono text-xs text-muted-foreground">{weekHours(emp.id)}h</td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground italic">Nessun dipendente.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
          <span>Legenda:</span>
          {SHIFT_TYPES.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${TYPE_COLOR[t]}`}>{SHIFT_SHORT[t]}</span>
              {SHIFT_LABELS[t]} ({SHIFT_HOURS[t]}h){t === DEFAULT_SHIFT ? " · default" : ""}
            </span>
          ))}
          {canEdit && <span className="ml-auto">Seleziona un turno per giorno; «In giornata» è il valore predefinito.</span>}
        </div>
      </div>
    </Layout>
  );
}
