import { useState } from "react";
import Layout from "@/components/Layout";
import { useAuth, Account, Tier, TIER_LABELS } from "@/hooks/useAuth";
import { addAuditEntry } from "@/hooks/useAuditLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";

const EMPTY = { username: "", password: "", displayName: "", tier: 1 as Tier };

export default function Utenti() {
  const { user, accounts, setAccounts } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const startCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (a: Account) => {
    setEditing(a);
    setForm({ username: a.username, password: a.password, displayName: a.displayName, tier: a.tier });
    setOpen(true);
  };

  const save = () => {
    if (!form.username.trim() || !form.password || !form.displayName.trim()) return;
    if (editing) {
      setAccounts(prev => prev.map(a => a.id === editing.id ? { ...a, ...form } : a));
      addAuditEntry({ actionType: "modifica", field: "Account", previousValue: `${editing.username} (${TIER_LABELS[editing.tier]})`, newValue: `${form.username} (${TIER_LABELS[form.tier]})` });
    } else {
      if (accounts.some(a => a.username === form.username.trim())) return;
      setAccounts(prev => [...prev, { id: `u${Date.now()}`, ...form, username: form.username.trim() }]);
      addAuditEntry({ actionType: "creazione", field: "Account", newValue: `${form.username} (${TIER_LABELS[form.tier]})` });
    }
    setOpen(false);
  };

  const remove = (a: Account) => {
    if (a.id === user?.id) return; // non eliminare sé stessi
    setAccounts(prev => prev.filter(x => x.id !== a.id));
    addAuditEntry({ actionType: "cancellazione", field: "Account", previousValue: `${a.username} (${TIER_LABELS[a.tier]})` });
  };

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold uppercase tracking-tight text-primary flex items-center gap-2">
            <ShieldCheck size={22} /> Gestione Utenti
          </h2>
          <Button onClick={startCreate} data-testid="button-new-user">
            <Plus size={15} className="mr-1" /> Nuovo account
          </Button>
        </div>

        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Nome utente</th>
                <th className="text-left p-3">Nome visualizzato</th>
                <th className="text-left p-3">Tier</th>
                <th className="p-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className="border-t border-border" data-testid={`row-user-${a.username}`}>
                  <td className="p-3 font-bold">{a.username}{a.id === user?.id && <span className="ml-2 text-[10px] text-primary">(tu)</span>}</td>
                  <td className="p-3">{a.displayName}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-1 rounded bg-primary/15 text-primary uppercase">{a.tier} — {TIER_LABELS[a.tier]}</span>
                  </td>
                  <td className="p-3 flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" className="w-8 h-8 p-0" onClick={() => startEdit(a)} data-testid={`button-edit-${a.username}`}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="sm" className="w-8 h-8 p-0 text-destructive" disabled={a.id === user?.id} onClick={() => remove(a)} data-testid={`button-delete-${a.username}`}><Trash2 size={14} /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Demo: credenziali salvate in locale nel browser. In produzione gli account andranno gestiti dal server.
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Modifica account" : "Nuovo account"}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="text-xs uppercase text-muted-foreground">Nome utente</label>
            <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} data-testid="input-user-username" />
            <label className="text-xs uppercase text-muted-foreground">Password (demo)</label>
            <Input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} data-testid="input-user-password" />
            <label className="text-xs uppercase text-muted-foreground">Nome visualizzato</label>
            <Input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} data-testid="input-user-displayname" />
            <label className="text-xs uppercase text-muted-foreground">Tier</label>
            <Select value={String(form.tier)} onValueChange={v => setForm({ ...form, tier: Number(v) as Tier })}>
              <SelectTrigger data-testid="select-user-tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                {([1, 2, 3, 4] as Tier[]).map(t => (
                  <SelectItem key={t} value={String(t)}>{t} — {TIER_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={save} data-testid="button-save-user">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
