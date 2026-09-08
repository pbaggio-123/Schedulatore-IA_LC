import { useState } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { Employee } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Trash2, Plus } from "lucide-react";

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

function skillColor(skill: string, allSkills: string[]) {
  const idx = allSkills.indexOf(skill);
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
}

export default function Employees() {
  const { employees, setEmployees, skills: allSkills } = useSchedulerData();
  const { can } = useAuth();
  const canManage = can("manageEmployees");
  const [dialog, setDialog] = useState<"new" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);

  const openNew = () => { setName(""); setChosen([]); setSelected(null); setDialog("new"); };
  const openEdit = (emp: Employee) => { setName(emp.name); setChosen([...emp.skills]); setSelected(emp); setDialog("edit"); };
  const openDelete = (emp: Employee) => { setSelected(emp); setDialog("delete"); };

  const toggleSkill = (skill: string) =>
    setChosen(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);

  const handleSaveNew = () => {
    if (!name) return;
    setEmployees([...employees, { id: `e${Date.now()}`, name, skills: chosen }]);
    setDialog(null);
  };
  const handleSaveEdit = () => {
    if (!selected || !name) return;
    setEmployees(employees.map(e => e.id === selected.id ? { ...e, name, skills: chosen } : e));
    setDialog(null);
  };
  const handleDelete = () => {
    if (!selected) return;
    setEmployees(employees.filter(e => e.id !== selected.id));
    setDialog(null);
  };

  const isFormOpen = dialog === "new" || dialog === "edit";

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">Registro Dipendenti</h2>
          {canManage && (
            <Button onClick={openNew} data-testid="button-add-employee">
              <Plus size={16} className="mr-2" /> Aggiungi Dipendente
            </Button>
          )}
        </div>

        {/* New / Edit dialog */}
        <Dialog open={isFormOpen} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{dialog === "new" ? "Nuovo Dipendente" : "Modifica Dipendente"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="emp-name">Nome e Cognome</Label>
                <Input id="emp-name" value={name} onChange={e => setName(e.target.value)} data-testid="input-employee-name" />
              </div>
              <div className="grid gap-2">
                <Label>Competenze</Label>
                {allSkills.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Nessuna competenza configurata. Aggiungile nel Catalogo.</p>
                )}
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {allSkills.map(skill => (
                    <div key={skill} className="flex items-center space-x-2">
                      <Checkbox id={`skill-${skill}`} checked={chosen.includes(skill)} onCheckedChange={() => toggleSkill(skill)} />
                      <Label htmlFor={`skill-${skill}`} className="cursor-pointer">
                        <span className={`text-xs px-1.5 py-0.5 rounded uppercase ${skillColor(skill, allSkills)}`}>{skill}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
                <Button onClick={dialog === "new" ? handleSaveNew : handleSaveEdit} data-testid="button-save-employee">
                  {dialog === "new" ? "Salva" : "Aggiorna"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Elimina Dipendente</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Eliminare <span className="text-foreground font-bold">{selected?.name}</span>?
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDelete} data-testid="button-confirm-delete-employee">Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="bg-card border border-card-border rounded overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Matricola</th>
                <th className="px-4 py-3">Competenze</th>
                <th className="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground italic">Nessun dipendente registrato</td></tr>
              )}
              {employees.map(emp => (
                <tr key={emp.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-bold">{emp.name}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{emp.matricola ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {emp.skills.map(s => (
                        <span key={s} className={`px-2 py-0.5 rounded text-xs uppercase ${skillColor(s, allSkills)}`}>{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {canManage && (
                        <>
                          <Button variant="ghost" size="sm" title="Modifica" onClick={() => openEdit(emp)} data-testid={`button-edit-employee-${emp.id}`}><Pencil size={15} /></Button>
                          <Button variant="ghost" size="sm" title="Elimina" className="text-destructive hover:text-destructive" onClick={() => openDelete(emp)} data-testid={`button-delete-employee-${emp.id}`}><Trash2 size={15} /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
