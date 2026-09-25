import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useUndoRedoShortcuts } from "@/hooks/useUndoRedoShortcuts";
import UndoRedoToolbar from "@/components/UndoRedoToolbar";
import { CatalogPhase, CatalogProduct } from "@/types";
import { phaseColor, phaseCodeOf } from "@/lib/schedule";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil, Trash2, Plus, BookOpen, Tag, ChevronDown } from "lucide-react";

const PALETTE = [
  "bg-orange-500/20 text-orange-400",
  "bg-red-500/20 text-red-400",
  "bg-blue-500/20 text-blue-400",
  "bg-purple-500/20 text-purple-400",
  "bg-green-500/20 text-green-400",
  "bg-cyan-500/20 text-cyan-400",
  "bg-pink-500/20 text-pink-400",
  "bg-amber-500/20 text-amber-400",
  "bg-rose-500/20 text-rose-400",
  "bg-indigo-500/20 text-indigo-400",
  "bg-teal-500/20 text-teal-400",
  "bg-lime-500/20 text-lime-400",
];

export function skillColor(skill: string, allSkills: string[]) {
  const idx = allSkills.indexOf(skill);
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
}

// ── Sezione Competenze ───────────────────────────────────────────────────────

function CompetenzaSection() {
  const { skills, setSkills, catalogPhases, employees } = useSchedulerData();
  const canManage = useAuth().can("manageCatalog");
  const [adding, setAdding] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingVal, setEditingVal] = useState("");
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  const usageCount = (skill: string) => ({
    phases: catalogPhases.filter(p => p.skill === skill).length,
    employees: employees.filter(e => e.skills.includes(skill)).length,
  });

  const handleAdd = () => {
    const trimmed = newSkill.trim();
    if (!trimmed || skills.includes(trimmed)) return;
    setSkills([...skills, trimmed]);
    setNewSkill("");
    setAdding(false);
  };

  const handleRename = (idx: number) => {
    const trimmed = editingVal.trim();
    if (!trimmed) { setEditingIdx(null); return; }
    const oldName = skills[idx];
    const updated = skills.map((s, i) => i === idx ? trimmed : s);
    setSkills(updated);
    // Propagate rename to catalog phases and employees
    catalogPhases.forEach(p => {
      if (p.skill === oldName) p.skill = trimmed; // mutate in place (will be saved by setSkills triggers)
    });
    employees.forEach(e => {
      const si = e.skills.indexOf(oldName);
      if (si !== -1) e.skills[si] = trimmed;
    });
    setEditingIdx(null);
  };

  const handleDelete = (idx: number) => {
    setSkills(skills.filter((_, i) => i !== idx));
    setDeleteIdx(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Tag size={15} className="text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Competenze / Skill</h3>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => { setAdding(true); setNewSkill(""); }} data-testid="button-add-skill">
            <Plus size={13} className="mr-1" /> Aggiungi Competenza
          </Button>
        )}
      </div>

      <div className="bg-card border border-card-border rounded overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nome Competenza</th>
              <th className="px-4 py-3">Fasi che la usano</th>
              <th className="px-4 py-3">Dipendenti con skill</th>
              <th className="px-4 py-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {skills.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground italic">Nessuna competenza. Aggiungine una.</td></tr>
            )}
            {skills.map((skill, idx) => {
              const usage = usageCount(skill);
              const isEditing = editingIdx === idx;
              return (
                <tr key={skill} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Input
                          value={editingVal}
                          onChange={e => setEditingVal(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleRename(idx); if (e.key === "Escape") setEditingIdx(null); }}
                          className="h-7 text-xs w-40"
                          autoFocus
                          data-testid={`input-edit-skill-${idx}`}
                        />
                        <Button size="sm" className="h-7 text-xs" onClick={() => handleRename(idx)}>Ok</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingIdx(null)}>✕</Button>
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded uppercase font-bold ${skillColor(skill, skills)}`}>{skill}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">{usage.phases > 0 ? `${usage.phases} fas${usage.phases > 1 ? "i" : "e"}` : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-sm">{usage.employees > 0 ? `${usage.employees}` : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingIdx(idx); setEditingVal(skill); }} data-testid={`button-edit-skill-${idx}`}><Pencil size={12} /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteIdx(idx)} data-testid={`button-delete-skill-${idx}`}><Trash2 size={12} /></Button>
                    </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {/* Add new row */}
            {adding && (
              <tr className="border-b border-border bg-primary/5">
                <td className="px-4 py-2" colSpan={4}>
                  <div className="flex gap-2 items-center">
                    <Input
                      value={newSkill}
                      onChange={e => setNewSkill(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
                      placeholder="Es. Fresatura, Controllo Qualità…"
                      className="h-7 text-xs w-64"
                      autoFocus
                      data-testid="input-new-skill"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={handleAdd}>Aggiungi</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>Annulla</Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={deleteIdx !== null} onOpenChange={o => !o && setDeleteIdx(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Elimina Competenza</DialogTitle></DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            {deleteIdx !== null && (() => {
              const u = usageCount(skills[deleteIdx]);
              return (
                <>
                  <p>Eliminare la competenza <span className="font-bold text-foreground">{skills[deleteIdx]}</span>?</p>
                  {(u.phases > 0 || u.employees > 0) && (
                    <p className="mt-2 text-amber-400 text-xs">
                      ⚠ Usata da {u.phases > 0 ? `${u.phases} fase/i nel catalogo` : ""}{u.phases > 0 && u.employees > 0 ? " e " : ""}{u.employees > 0 ? `${u.employees} dipendente/i` : ""}.
                      I riferimenti resteranno ma la skill non sarà più selezionabile.
                    </p>
                  )}
                </>
              );
            })()}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteIdx(null)}>Annulla</Button>
            <Button variant="destructive" onClick={() => deleteIdx !== null && handleDelete(deleteIdx)}>Elimina</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sezione Fasi ─────────────────────────────────────────────────────────────

function FasiSection() {
  const { catalogPhases, setCatalogPhases, skills, undoCatalogPhases, redoCatalogPhases, canUndoCatalogPhases, canRedoCatalogPhases } = useSchedulerData();
  const canManage = useAuth().can("manageCatalog");
  useUndoRedoShortcuts(undoCatalogPhases, redoCatalogPhases);
  const [dialog, setDialog] = useState<"new" | "edit" | "delete" | null>(null);
  const [sel, setSel] = useState<CatalogPhase | null>(null);
  const [form, setForm] = useState({ name: "", skill: "", hoursPerUnit: "0.5", unit: "pz", color: "", overlapWith: [] as string[] });

  const openNew = () => { setForm({ name: "", skill: skills[0] ?? "", hoursPerUnit: "0.5", unit: "pz", color: "", overlapWith: [] }); setSel(null); setDialog("new"); };
  const openEdit = (p: CatalogPhase) => { setForm({ name: p.name, skill: p.skill, hoursPerUnit: String(p.hoursPerUnit), unit: p.unit, color: p.color ?? "", overlapWith: p.overlapWith ? [...p.overlapWith] : [] }); setSel(p); setDialog("edit"); };
  const openDel = (p: CatalogPhase) => { setSel(p); setDialog("delete"); };

  // Altre fasi selezionabili nel menu di sovrapposizione (esclude quella in
  // modifica; deduplicate per codice, così due voci con lo stesso codice fase
  // non compaiono due volte nell'elenco).
  const overlapOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    catalogPhases.forEach(p => {
      if (sel && p.id === sel.id) return;
      const code = phaseCodeOf(p.name);
      if (!byCode.has(code)) byCode.set(code, p.name);
    });
    return Array.from(byCode.entries()).map(([code, name]) => ({ code, name }));
  }, [catalogPhases, sel]);

  const toggleOverlap = (code: string) => setForm(f => ({
    ...f,
    overlapWith: f.overlapWith.includes(code) ? f.overlapWith.filter(c => c !== code) : [...f.overlapWith, code],
  }));

  const save = () => {
    const entry: CatalogPhase = { id: sel?.id ?? `cp${Date.now()}`, name: form.name, skill: form.skill, hoursPerUnit: parseFloat(form.hoursPerUnit) || 0, unit: form.unit, color: form.color || undefined, overlapWith: form.overlapWith.length ? form.overlapWith : undefined };

    // Sovrapposizione simmetrica: spuntarla qui deve farla risultare spuntata
    // anche nel menu dell'ALTRA fase (e viceversa togliendola) — propaga la
    // differenza rispetto a prima del salvataggio sulle fasi coinvolte, così il
    // dato resta coerente da qualunque lato lo si apra.
    const myCode = phaseCodeOf(form.name);
    const oldCodes = new Set(sel?.overlapWith ?? []);
    const newCodes = new Set(form.overlapWith);
    const added = [...newCodes].filter(c => !oldCodes.has(c));
    const removed = [...oldCodes].filter(c => !newCodes.has(c));

    let updated = dialog === "new" ? [...catalogPhases, entry] : catalogPhases.map(p => p.id === entry.id ? entry : p);
    if (added.length || removed.length) {
      updated = updated.map(p => {
        if (p.id === entry.id) return p;
        const code = phaseCodeOf(p.name);
        if (added.includes(code) && !p.overlapWith?.includes(myCode)) {
          return { ...p, overlapWith: [...(p.overlapWith ?? []), myCode] };
        }
        if (removed.includes(code) && p.overlapWith?.includes(myCode)) {
          const next = p.overlapWith.filter(c => c !== myCode);
          return { ...p, overlapWith: next.length ? next : undefined };
        }
        return p;
      });
    }

    setCatalogPhases(updated);
    setDialog(null);
  };
  const del = () => { if (sel) { setCatalogPhases(catalogPhases.filter(p => p.id !== sel.id)); setDialog(null); } };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Fasi di Lavorazione Standard</h3>
        <div className="flex items-center gap-2">
          <UndoRedoToolbar canUndo={canUndoCatalogPhases} canRedo={canRedoCatalogPhases} onUndo={undoCatalogPhases} onRedo={redoCatalogPhases} testIdPrefix="catalogo" />
          {canManage && <Button size="sm" onClick={openNew} data-testid="button-add-phase"><Plus size={13} className="mr-1" /> Aggiungi Fase</Button>}
        </div>
      </div>

      <Dialog open={dialog === "new" || dialog === "edit"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog === "new" ? "Nuova Fase" : "Modifica Fase"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>Nome Fase</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="es. Taglio Laser" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Competenza Richiesta</Label>
                {skills.length === 0 ? (
                  <p className="text-xs text-amber-400 italic">Aggiungi prima le competenze nella sezione in alto.</p>
                ) : (
                  <Select value={form.skill} onValueChange={v => setForm({ ...form, skill: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                    <SelectContent>{skills.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-2"><Label>Unità di misura</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pz" /></div>
            </div>
            <div className="grid gap-2">
              <Label>Ore per unità ({form.unit})</Label>
              <Input type="number" min="0.01" step="0.01" value={form.hoursPerUnit} onChange={e => setForm({ ...form, hoursPerUnit: e.target.value })} />
              <p className="text-xs text-muted-foreground">Esempio: 10 × {form.hoursPerUnit}h = <span className="text-foreground font-bold">{(10 * (parseFloat(form.hoursPerUnit) || 0)).toFixed(1)}h</span></p>
            </div>
            <div className="grid gap-2">
              <Label>Colore nel calendario</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.color || "#3b82f6"} onChange={e => setForm({ ...form, color: e.target.value })}
                  className="h-8 w-12 rounded border border-border bg-transparent cursor-pointer" />
                <span className="text-xs font-mono text-muted-foreground">{form.color || "automatico (dal codice fase)"}</span>
                {form.color && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setForm({ ...form, color: "" })}>Auto</Button>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Può sovrapporsi nel tempo con (stessa linea)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between font-normal">
                    {form.overlapWith.length === 0
                      ? "Nessuna (accodamento automatico)"
                      : `${form.overlapWith.length} fase/i selezionata/e`}
                    <ChevronDown size={14} className="opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 max-h-64 overflow-y-auto" align="start">
                  {overlapOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic px-1 py-1">Nessun&apos;altra fase nel catalogo.</p>
                  ) : overlapOptions.map(({ code, name }) => (
                    <div key={code} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-muted/40">
                      <Checkbox
                        id={`overlap-${code}`}
                        checked={form.overlapWith.includes(code)}
                        onCheckedChange={() => toggleOverlap(code)}
                      />
                      <Label htmlFor={`overlap-${code}`} className="cursor-pointer text-xs flex-1">{name}</Label>
                    </div>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Le fasi selezionate non aspettano la fine di questa fase (e viceversa) per iniziare sulla stessa linea nel Gantt: restano alla loro data naturale anche sovrapponendosi nel tempo. Con le altre resta l&apos;accodamento automatico.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
              <Button onClick={save}>Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Elimina Fase</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Eliminare la fase <span className="font-bold text-foreground">{sel?.name}</span>?</p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
            <Button variant="destructive" onClick={del}>Elimina</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-card border border-card-border rounded overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nome Fase</th>
              <th className="px-4 py-3">Skill</th>
              <th className="px-4 py-3">Ore / Unità</th>
              <th className="px-4 py-3">U.M.</th>
              <th className="px-4 py-3">Sovrapposizione</th>
              <th className="px-4 py-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {catalogPhases.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground italic">Nessuna fase configurata</td></tr>}
            {catalogPhases.map(p => (
              <tr key={p.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-bold">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: p.color || phaseColor(p.name) }}
                      title={p.color ? "Colore personalizzato" : "Colore automatico"} />
                    {p.name}
                  </span>
                </td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded uppercase ${skillColor(p.skill, skills)}`}>{p.skill}</span></td>
                <td className="px-4 py-3 font-mono">{p.hoursPerUnit}h</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{p.unit}</td>
                <td className="px-4 py-3">
                  {p.overlapWith?.length
                    ? <span className="text-xs px-2 py-0.5 rounded uppercase bg-amber-500/20 text-amber-400"
                        title={`Può sovrapporsi con: ${p.overlapWith.join(", ")}`}>
                        {p.overlapWith.length} fase/i
                      </span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-right flex gap-1 justify-end">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Pencil size={12} /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => openDel(p)}><Trash2 size={12} /></Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sezione Articoli ─────────────────────────────────────────────────────────

function ArticoliSection() {
  const { catalogProducts, setCatalogProducts, catalogPhases, skills } = useSchedulerData();
  const canManage = useAuth().can("manageCatalog");
  const [dialog, setDialog] = useState<"new" | "edit" | "delete" | null>(null);
  const [sel, setSel] = useState<CatalogProduct | null>(null);
  const [form, setForm] = useState({ code: "", name: "", phaseIds: [] as string[] });

  const openNew = () => { setForm({ code: "", name: "", phaseIds: [] }); setSel(null); setDialog("new"); };
  const openEdit = (a: CatalogProduct) => { setForm({ code: a.code, name: a.name, phaseIds: [...a.phaseIds] }); setSel(a); setDialog("edit"); };
  const openDel = (a: CatalogProduct) => { setSel(a); setDialog("delete"); };
  const togglePhase = (id: string) => setForm(f => ({ ...f, phaseIds: f.phaseIds.includes(id) ? f.phaseIds.filter(x => x !== id) : [...f.phaseIds, id] }));

  const save = () => {
    const entry: CatalogProduct = { id: sel?.id ?? `prod${Date.now()}`, code: form.code, name: form.name, phaseIds: form.phaseIds };
    if (dialog === "new") setCatalogProducts([...catalogProducts, entry]);
    else setCatalogProducts(catalogProducts.map(p => p.id === entry.id ? entry : p));
    setDialog(null);
  };
  const del = () => { if (sel) { setCatalogProducts(catalogProducts.filter(p => p.id !== sel.id)); setDialog(null); } };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Articoli / Prodotti</h3>
        {canManage && <Button size="sm" onClick={openNew} data-testid="button-add-product"><Plus size={13} className="mr-1" /> Aggiungi Articolo</Button>}
      </div>

      <Dialog open={dialog === "new" || dialog === "edit"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{dialog === "new" ? "Nuovo Articolo" : "Modifica Articolo"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Codice Articolo</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="ART-001" /></div>
              <div className="grid gap-2"><Label>Nome Articolo</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <div className="grid gap-2">
              <Label>Fasi di Lavorazione Associate</Label>
              <div className="max-h-48 overflow-y-auto border border-border rounded p-3 flex flex-col gap-2">
                {catalogPhases.length === 0 && <p className="text-xs text-muted-foreground italic">Nessuna fase disponibile.</p>}
                {catalogPhases.map(ph => (
                  <div key={ph.id} className="flex items-center gap-2">
                    <Checkbox id={`ph-${ph.id}`} checked={form.phaseIds.includes(ph.id)} onCheckedChange={() => togglePhase(ph.id)} />
                    <Label htmlFor={`ph-${ph.id}`} className="cursor-pointer text-sm flex-1">{ph.name}</Label>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${skillColor(ph.skill, skills)}`}>{ph.skill}</span>
                    <span className="text-xs text-muted-foreground font-mono">{ph.hoursPerUnit}h/{ph.unit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
              <Button onClick={save}>Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Elimina Articolo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Eliminare <span className="font-bold text-foreground">{sel?.code} — {sel?.name}</span>?</p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
            <Button variant="destructive" onClick={del}>Elimina</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-card border border-card-border rounded overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-32">Codice</th>
              <th className="px-4 py-3">Articolo</th>
              <th className="px-4 py-3">Fasi Associate</th>
              <th className="px-4 py-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {catalogProducts.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground italic">Nessun articolo configurato</td></tr>}
            {catalogProducts.map(a => (
              <tr key={a.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-primary">{a.code}</td>
                <td className="px-4 py-3 font-bold">{a.name}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.phaseIds.map(pid => {
                      const ph = catalogPhases.find(p => p.id === pid);
                      return ph ? <span key={pid} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">{ph.name}</span> : null;
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && (
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(a)}><Pencil size={12} /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => openDel(a)}><Trash2 size={12} /></Button>
                  </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pagina principale ────────────────────────────────────────────────────────

export default function Catalogo() {
  return (
    <Layout>
      <div className="p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <BookOpen size={22} className="text-primary" />
          <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">Catalogo Lavorazioni</h2>
        </div>
        <div className="text-xs text-muted-foreground font-mono bg-muted/40 border border-border rounded p-3">
          Gestisci qui le <strong className="text-foreground">competenze/skill</strong>, le <strong className="text-foreground">fasi di lavorazione</strong> con ore standard e gli <strong className="text-foreground">articoli/prodotti</strong> con le fasi associate.
          Le skill definite qui saranno disponibili nelle fasi, nelle commesse e nei profili dei dipendenti.
        </div>
        <CompetenzaSection />
        <FasiSection />
        <ArticoliSection />
      </div>
    </Layout>
  );
}
