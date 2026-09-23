import { useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useAuth } from "@/hooks/useAuth";
import { AfanEntry } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Plus, Timer, Search } from "lucide-react";

const EMPTY_FORM = {
  commessaNum: "", commessaName: "", faseCode: "",
  tempoPreventivato: "", tempoEffettivo: "", differenzaOre: "", totaleOre: "",
  operatore: "", note: "", sistemaSchuco: "", quantita: "", opNum: "",
};

export default function Afan() {
  const { afanEntries, setAfanEntries } = useSchedulerData();
  const canManage = useAuth().can("crudOrders");
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<"new" | "edit" | "delete" | null>(null);
  const [sel, setSel] = useState<AfanEntry | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return afanEntries;
    return afanEntries.filter(e =>
      e.commessaNum.toLowerCase().includes(q) ||
      e.commessaName.toLowerCase().includes(q) ||
      e.faseCode.toLowerCase().includes(q) ||
      e.operatore.toLowerCase().includes(q)
    );
  }, [afanEntries, filter]);

  const openNew = () => { setForm(EMPTY_FORM); setSel(null); setDialog("new"); };
  const openEdit = (e: AfanEntry) => {
    setForm({
      commessaNum: e.commessaNum, commessaName: e.commessaName, faseCode: e.faseCode,
      tempoPreventivato: e.tempoPreventivato, tempoEffettivo: e.tempoEffettivo,
      differenzaOre: e.differenzaOre, totaleOre: e.totaleOre, operatore: e.operatore,
      note: e.note, sistemaSchuco: e.sistemaSchuco, quantita: e.quantita, opNum: e.opNum,
    });
    setSel(e);
    setDialog("edit");
  };
  const openDel = (e: AfanEntry) => { setSel(e); setDialog("delete"); };

  const save = () => {
    const entry: AfanEntry = { id: sel?.id ?? `afan${Date.now()}`, ...form };
    if (dialog === "new") setAfanEntries([...afanEntries, entry]);
    else setAfanEntries(afanEntries.map(e => e.id === entry.id ? entry : e));
    setDialog(null);
  };
  const del = () => { if (sel) { setAfanEntries(afanEntries.filter(e => e.id !== sel.id)); setDialog(null); } };

  const field = (key: keyof typeof EMPTY_FORM, label: string, placeholder?: string) => (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Timer size={22} className="text-primary" />
          <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">Conteggio Ore Afan</h2>
        </div>
        <div className="text-xs text-muted-foreground font-mono bg-muted/40 border border-border rounded p-3">
          Confronto tra <strong className="text-foreground">tempo preventivato</strong> (PDP) e <strong className="text-foreground">tempo effettivo</strong> (RTA)
          per commessa e fase. I valori sono liberi come nel registro cartaceo/foglio di origine: nessun calcolo automatico.
        </div>

        <div className="flex justify-between items-center gap-3">
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Cerca per commessa, fase, operatore…"
              className="h-8 pl-8 text-xs"
              data-testid="input-afan-filter"
            />
          </div>
          {canManage && (
            <Button size="sm" onClick={openNew} data-testid="button-add-afan">
              <Plus size={13} className="mr-1" /> Aggiungi Riga
            </Button>
          )}
        </div>

        <div className="bg-card border border-card-border rounded overflow-x-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="text-[10px] uppercase bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2">N° Op</th>
                <th className="px-3 py-2">N° Commessa</th>
                <th className="px-3 py-2">Nome Commessa</th>
                <th className="px-3 py-2">Cod. Fase</th>
                <th className="px-3 py-2 text-right">Tempo Prev.</th>
                <th className="px-3 py-2 text-right">Tempo Eff.</th>
                <th className="px-3 py-2">Differenza Ore</th>
                <th className="px-3 py-2">Totale Ore</th>
                <th className="px-3 py-2">Operatore</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2 whitespace-normal min-w-64">Sistema Schuco</th>
                <th className="px-3 py-2">Quantità</th>
                {canManage && <th className="px-3 py-2 text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={canManage ? 13 : 12} className="px-4 py-6 text-center text-muted-foreground italic">Nessuna riga trovata</td></tr>
              )}
              {filtered.map(e => (
                <tr key={e.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{e.opNum || "—"}</td>
                  <td className="px-3 py-2 font-mono text-primary">{e.commessaNum}</td>
                  <td className="px-3 py-2 font-bold">{e.commessaName}</td>
                  <td className="px-3 py-2 font-mono">{e.faseCode}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.tempoPreventivato || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.tempoEffettivo || "—"}</td>
                  <td className="px-3 py-2 font-mono">{e.differenzaOre || "—"}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{e.totaleOre || "—"}</td>
                  <td className="px-3 py-2">{e.operatore || "—"}</td>
                  <td className="px-3 py-2">{e.note || "—"}</td>
                  <td className="px-3 py-2 whitespace-normal min-w-64 text-muted-foreground">{e.sistemaSchuco || "—"}</td>
                  <td className="px-3 py-2 font-mono">{e.quantita || "—"}</td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(e)} data-testid={`button-edit-afan-${e.id}`}><Pencil size={12} /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => openDel(e)} data-testid={`button-delete-afan-${e.id}`}><Trash2 size={12} /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialog === "new" || dialog === "edit"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog === "new" ? "Nuova Riga" : "Modifica Riga"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              {field("commessaNum", "N° Commessa", "es. 252570A0")}
              {field("commessaName", "Nome Commessa")}
              {field("faseCode", "Cod. Fase", "es. 34K")}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {field("tempoPreventivato", "Tempo Preventivato")}
              {field("tempoEffettivo", "Tempo Effettivo")}
              {field("differenzaOre", "Differenza Ore", "es. > 5")}
              {field("totaleOre", "Totale Ore")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("operatore", "Operatore")}
              {field("note", "Note")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("sistemaSchuco", "Sistema Schuco")}
              {field("quantita", "Quantità")}
            </div>
            {field("opNum", "N° Op")}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
              <Button onClick={save} data-testid="button-save-afan">Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Elimina Riga</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Eliminare la riga <span className="font-bold text-foreground">{sel?.commessaNum} — {sel?.faseCode}</span>?
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
            <Button variant="destructive" onClick={del} data-testid="button-confirm-delete-afan">Elimina</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
