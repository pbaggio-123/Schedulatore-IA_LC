import { useMemo } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useShifts } from "@/hooks/useShifts";
import { computeScheduledParts } from "@/lib/schedule";
import { computeEmployeeLoads } from "@/lib/capacity";
import { Users } from "lucide-react";

function satColor(sat: number): string {
  if (sat === 0) return "bg-slate-500";
  if (sat <= 0.85) return "bg-emerald-500";
  if (sat <= 1.0) return "bg-amber-500";
  return "bg-red-500";
}

export default function Capacita() {
  const { orders, holidays, saturdayWorking, employees } = useSchedulerData();
  const { shifts } = useShifts();

  const loads = useMemo(() => {
    const parts = computeScheduledParts(orders, holidays, saturdayWorking);
    return computeEmployeeLoads(parts, employees, { shifts, holidays, saturdayWorking });
  }, [orders, holidays, saturdayWorking, employees, shifts]);

  const maxHours = Math.max(1, ...loads.map((l) => l.assignedHours));
  const totalAssigned = loads.reduce((s, l) => s + l.assignedHours, 0);

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-5 h-full overflow-auto">
        <h2 className="text-2xl font-bold uppercase tracking-tight text-primary flex items-center gap-2">
          <Users size={22} /> Capacità & Saturazione
        </h2>
        <p className="text-xs text-muted-foreground -mt-3">
          Ore a carico di ciascuna persona sulle fasi attive (le fasi completate non pesano).
          Saturazione = ore assegnate / ore lavorabili nella finestra. Le ore lavorabili
          tengono conto dei <span className="font-semibold">turni</span> (mezza giornata = 4h),
          non più 8h fisse per tutti.
        </p>

        <div className="flex flex-col gap-2">
          {loads.map((l) => {
            const pct = Math.round((l.assignedHours / maxHours) * 100);
            const satPct = Math.round(l.saturation * 100);
            return (
              <div
                key={l.employee.id}
                className="bg-card border border-card-border rounded p-3 flex flex-col gap-1.5"
                data-testid={`load-${l.employee.id}`}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold">{l.employee.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {l.assignedHours.toFixed(1)} h
                    {l.capacityHours > 0 && <> / {l.capacityHours.toFixed(0)} h</>}
                    {" · "}{l.partCount} fasi
                    {l.partCount > 0 && l.availableHoursPerDay < 8 && (
                      <span className="text-amber-500" title="ore lavorabili medie al giorno (turni)">
                        {" · "}{l.availableHoursPerDay.toFixed(1)} h/g
                      </span>
                    )}
                    {l.saturation > 0 && (
                      <>
                        {" · "}
                        <span className={l.saturation > 1 ? "text-red-500 font-bold" : "text-foreground"}>
                          sat {satPct}%
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-muted/40 rounded overflow-hidden">
                  <div className={`h-full ${satColor(l.saturation)}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {l.employee.skills.map((s) => (
                    <span key={s} className="text-[10px] uppercase bg-muted/50 rounded px-1.5 py-0.5 text-muted-foreground">
                      {s}
                    </span>
                  ))}
                  {l.partCount === 0 && (
                    <span className="text-[10px] uppercase text-muted-foreground italic">nessuna fase attiva</span>
                  )}
                </div>
              </div>
            );
          })}
          {loads.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessun dipendente.</p>
          )}
        </div>

        <div className="text-xs text-muted-foreground border-t border-border pt-3">
          Totale ore attive pianificate: <span className="font-mono font-bold text-foreground">{totalAssigned.toFixed(1)} h</span>
        </div>
      </div>
    </Layout>
  );
}
