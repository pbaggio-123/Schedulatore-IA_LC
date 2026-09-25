import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, CalendarClock } from "lucide-react";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useAuth } from "@/hooks/useAuth";
import { addAuditEntry } from "@/hooks/useAuditLog";
import { toast } from "@/hooks/use-toast";
import { computeScheduledParts, findEmployeeOverlaps, overlapAllowedCodesOf, EmployeeOverlap } from "@/lib/schedule";
import { formatISODate } from "@/types";

/**
 * Alert NON bloccante: elenca le persone assegnate a fasi che si
 * sovrappongono nel tempo. Avvisa soltanto — la pianificazione resta valida.
 * Chi può spostare le fasi (tier>=2) può risolvere con un click: la seconda
 * fase viene posticipata all'inizio successivo alla fine della prima.
 */
export default function OverlapAlert() {
  const { orders, setOrders, holidays, saturdayWorking, employees, catalogPhases } = useSchedulerData();
  const { can } = useAuth();
  const [open, setOpen] = useState(true);

  const overlaps = useMemo(
    () => findEmployeeOverlaps(
      computeScheduledParts(orders, holidays, saturdayWorking, undefined, overlapAllowedCodesOf(catalogPhases)),
      employees,
    ),
    [orders, holidays, saturdayWorking, employees, catalogPhases],
  );

  if (overlaps.length === 0) return null;

  const fmt = (d: Date) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });

  const resolve = (o: EmployeeOverlap) => {
    const targetStart = formatISODate(o.a.endDate); // inizio successivo alla fine di a
    setOrders((prev) =>
      prev.map((order) => ({
        ...order,
        lots: order.lots.map((lot) => ({
          ...lot,
          parts: lot.parts.map((part) =>
            part.id === o.b.id ? { ...part, manualStartDate: targetStart } : part,
          ),
        })),
      })),
    );
    addAuditEntry({
      actionType: "cambio_data",
      partId: o.b.id,
      partName: o.b.name,
      field: "manualStartDate",
      newValue: targetStart,
      notes: `Risolta sovrapposizione di ${o.employeeName} con "${o.a.name}"`,
    });
    toast({
      title: "Sovrapposizione risolta",
      description: `"${o.b.name}" spostata al ${fmt(o.a.endDate)}`,
    });
  };

  return (
    <div className="border border-amber-500/40 bg-amber-500/10 rounded p-3 flex flex-col gap-2" data-testid="overlap-alert">
      <button className="flex items-center justify-between w-full" onClick={() => setOpen(o => !o)}>
        <span className="flex items-center gap-2 text-sm font-bold text-amber-500 uppercase tracking-wide">
          <AlertTriangle size={16} />
          {overlaps.length === 1
            ? "1 sovrapposizione di persona"
            : `${overlaps.length} sovrapposizioni di persona`}
          <span className="normal-case font-normal text-xs text-muted-foreground">(avviso — non bloccante)</span>
        </span>
        {open ? <ChevronUp size={14} className="text-amber-500" /> : <ChevronDown size={14} className="text-amber-500" />}
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 text-xs">
          {overlaps.map((o, i) => (
            <li key={`${o.employeeId}-${o.a.id}-${o.b.id}-${i}`} className="flex flex-wrap items-center gap-1.5 font-mono">
              <span className="font-bold text-amber-400">{o.employeeName}</span>
              <span className="text-muted-foreground">impegnato su</span>
              <span className="bg-card border border-border rounded px-1.5 py-0.5">{o.a.orderName} / {o.a.lotName} / {o.a.name}</span>
              <span className="text-muted-foreground">e</span>
              <span className="bg-card border border-border rounded px-1.5 py-0.5">{o.b.orderName} / {o.b.lotName} / {o.b.name}</span>
              <span className="text-muted-foreground">dal {fmt(o.overlapStart)} al {fmt(o.overlapEnd)}</span>
              {can("movePhases") && (
                <button
                  onClick={() => resolve(o)}
                  className="ml-auto flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded px-2 py-0.5 uppercase tracking-wide"
                  title={`Sposta "${o.b.name}" dopo "${o.a.name}"`}
                  data-testid={`resolve-${o.b.id}`}
                >
                  <CalendarClock size={12} /> Risolvi
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
