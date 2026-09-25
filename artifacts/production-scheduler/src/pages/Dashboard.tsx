import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useUndoRedoShortcuts } from "@/hooks/useUndoRedoShortcuts";
import UndoRedoToolbar from "@/components/UndoRedoToolbar";
import GanttChart from "@/components/GanttChart";
import OverlapAlert from "@/components/OverlapAlert";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { exportPlanXlsx } from "@/lib/exportPlan";

export default function Dashboard() {
  const { orders, holidays, saturdayWorking, employees, catalogPhases, undoOrders, redoOrders, canUndoOrders, canRedoOrders } = useSchedulerData();
  useUndoRedoShortcuts(undoOrders, redoOrders);

  const totalOrders = orders.length;
  const parts = orders.flatMap(o => o.lots.flatMap(l => l.parts));
  const pendingParts     = parts.filter(p => p.status === "pending").length;
  const inProgressParts  = parts.filter(p => p.status === "in-progress").length;
  const doneParts        = parts.filter(p => p.status === "done").length;

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-5 h-full">
        <div className="flex items-center justify-between gap-2 no-print">
          <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">Pannello di Controllo</h2>
          <div className="flex items-center gap-2">
            <UndoRedoToolbar canUndo={canUndoOrders} canRedo={canRedoOrders} onUndo={undoOrders} onRedo={redoOrders} testIdPrefix="pannello" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportPlanXlsx(orders, holidays, saturdayWorking, employees, catalogPhases)}
              data-testid="button-export-xlsx"
            >
              <Download size={15} className="mr-2" /> Esporta Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              data-testid="button-print"
            >
              <Printer size={15} className="mr-2" /> Stampa / PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Commesse Attive",    value: totalOrders,   color: "text-foreground" },
            { label: "Fasi in Attesa",     value: pendingParts,  color: "text-amber-500" },
            { label: "Fasi in Lavorazione",value: inProgressParts,color:"text-blue-500" },
            { label: "Fasi Completate",    value: doneParts,     color: "text-green-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-card-border p-4 rounded flex flex-col">
              <span className="text-xs uppercase text-muted-foreground">{label}</span>
              <span className={`text-3xl font-bold mt-1 ${color}`}>{value}</span>
            </div>
          ))}
        </div>

        <OverlapAlert />

        <div className="flex-1 min-h-[400px] border border-border bg-card rounded flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border bg-muted/40 flex items-center gap-2">
            <span className="text-muted-foreground uppercase tracking-widest text-xs font-bold">
              Diagramma di Gantt — Trascina le barre per spostare · Click sull&apos;area vuota per aggiungere chiusura
            </span>
          </div>
          <div className="flex-1 relative overflow-auto">
            <GanttChart />
          </div>
        </div>
      </div>
    </Layout>
  );
}
