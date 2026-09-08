import { useState } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { Holiday } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, CalendarX } from "lucide-react";

const EMPTY_FORM = { date: "", name: "", recurring: false };

export default function Festivita() {
  const { holidays, setHolidays, saturdayWorking, setSaturdayWorking } = useSchedulerData();
  const { can } = useAuth();
  const canManage = can("manageHolidays");
  const [dialog, setDialog] = useState<"new" | "delete" | null>(null);
  const [selected, setSelected] = useState<Holiday | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const openNew = () => { setForm(EMPTY_FORM); setDialog("new"); };

  const handleSave = () => {
    if (!form.date || !form.name) return;
    setHolidays([...holidays, { id: `hol${Date.now()}`, ...form }]);
    setDialog(null);
    setForm(EMPTY_FORM);
  };

  const openDelete = (h: Holiday) => { setSelected(h); setDialog("delete"); };

  const handleDelete = () => {
    if (!selected) return;
    setHolidays(holidays.filter(h => h.id !== selected.id));
    setDialog(null);
  };

  const ricorrenti = holidays.filter(h => h.recurring).sort((a, b) => a.date.localeCompare(b.date));
  const specifiche  = holidays.filter(h => !h.recurring).sort((a, b) => a.date.localeCompare(b.date));

  const formatDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <CalendarX size={22} className="text-primary" />
            <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">Chiusure e Festività</h2>
          </div>
          {canManage && (
            <Button onClick={openNew} data-testid="button-add-holiday">
              <Plus size={16} className="mr-2" /> Aggiungi Chiusura
            </Button>
          )}
        </div>

        {/* ── Impostazione Weekend ── */}
        <div className="bg-card border border-card-border rounded p-4 flex flex-col gap-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Impostazioni Calendario</h3>

          <div className="flex flex-col gap-3">
            {/* Domenica — always off */}
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Domenica</span>
                <span className="text-xs text-muted-foreground">Sempre non lavorativa — non modificabile</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400 bg-slate-500/20 px-2 py-0.5 rounded">Non lavorativa</span>
                <Switch checked={false} disabled className="opacity-40" />
              </div>
            </div>

            {/* Sabato — toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Sabato</span>
                <span className="text-xs text-muted-foreground">
                  {saturdayWorking
                    ? "Il sabato è lavorativo — le barre Gantt coprono il sabato e le ore si accumulano normalmente"
                    : "Il sabato è non lavorativo — le barre Gantt si interrompono il sabato"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${saturdayWorking ? "text-green-400 bg-green-500/20" : "text-slate-400 bg-slate-500/20"}`}>
                  {saturdayWorking ? "Lavorativo" : "Non lavorativo"}
                </span>
                {canManage && (
                  <Switch
                    checked={saturdayWorking}
                    onCheckedChange={(v) => setSaturdayWorking(v)}
                    data-testid="toggle-saturday-working"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground font-mono bg-muted/40 rounded px-3 py-2 border border-border/60">
            Il Gantt visualizza <span className="text-slate-300">sabato{!saturdayWorking ? " e domenica" : ""}</span> come colonne grigie vuote.
            Le festività nazionali appaiono in <span className="text-red-400">rosso</span>.
            Il calcolo delle ore lavorative e la durata delle commesse tengono conto automaticamente di tutte le chiusure.
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 border border-border rounded p-3 font-mono text-muted-foreground">
          <div>Chiusure configurate: <span className="text-foreground font-bold">{holidays.length}</span></div>
          <div>Di cui ricorrenti: <span className="text-foreground font-bold">{ricorrenti.length}</span></div>
        </div>

        {/* ── New dialog ── */}
        <Dialog open={dialog === "new"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuova Chiusura / Festività</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Data</Label>
                <Input type="date" value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  data-testid="input-holiday-date" />
              </div>
              <div className="grid gap-2">
                <Label>Descrizione</Label>
                <Input placeholder="es. Natale, Ponte aziendale…" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  data-testid="input-holiday-name" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="recurring" checked={form.recurring}
                  onCheckedChange={(v) => setForm({ ...form, recurring: !!v })} />
                <Label htmlFor="recurring" className="cursor-pointer">
                  Ricorrente ogni anno (ignora l&apos;anno, vale il giorno/mese)
                </Label>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
                <Button onClick={handleSave} data-testid="button-save-holiday">Salva</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete dialog ── */}
        <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Elimina Chiusura</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Eliminare <span className="text-foreground font-bold">{selected?.name}</span> ({selected?.date})?
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDelete}
                data-testid="button-confirm-delete-holiday">Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Tables ── */}
        <Section title="Festività Nazionali / Ricorrenti" count={ricorrenti.length}>
          <HolidayTable rows={ricorrenti} formatDate={formatDate} onDelete={openDelete} canDelete={canManage} />
        </Section>

        <Section title="Chiusure Specifiche" count={specifiche.length}>
          {specifiche.length === 0
            ? <p className="text-sm text-muted-foreground italic px-4 py-3">
                Nessuna chiusura specifica. Aggiungine una con il tasto in alto, oppure clicca direttamente su un giorno feriale nel Gantt.
              </p>
            : <HolidayTable rows={specifiche} formatDate={formatDate} onDelete={openDelete} canDelete={canManage} />}
        </Section>
      </div>
    </Layout>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
        <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{count}</span>
      </div>
      <div className="bg-card border border-card-border rounded overflow-hidden">{children}</div>
    </div>
  );
}

function HolidayTable({ rows, formatDate, onDelete, canDelete }: { rows: Holiday[]; formatDate: (s: string) => string; onDelete: (h: Holiday) => void; canDelete: boolean }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-sm text-left">
      <thead className="text-xs uppercase bg-muted text-muted-foreground">
        <tr>
          <th className="px-4 py-3 w-40">Data</th>
          <th className="px-4 py-3">Descrizione</th>
          <th className="px-4 py-3 w-28">Tipo</th>
          <th className="px-4 py-3 text-right w-20">Azioni</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(h => (
          <tr key={h.id} className="border-b border-border hover:bg-muted/20 transition-colors">
            <td className="px-4 py-3 font-mono text-primary">{h.recurring ? h.date.slice(5) : formatDate(h.date)}</td>
            <td className="px-4 py-3 font-bold">{h.name}</td>
            <td className="px-4 py-3">
              <span className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${h.recurring ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"}`}>
                {h.recurring ? "Ricorrente" : "Specifica"}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              {canDelete && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(h)} data-testid={`button-delete-holiday-${h.id}`}>
                  <Trash2 size={14} />
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
