import React, { useState } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { Order, Lot, Part } from "@/types";
import { addAuditEntry } from "@/hooks/useAuditLog";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, Eye } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  done:          "bg-green-500/20 text-green-500",
  "in-progress": "bg-blue-500/20 text-blue-500",
  pending:       "bg-amber-500/20 text-amber-500",
};
const STATUS_LABELS: Record<string, string> = {
  done: "Completata", "in-progress": "In Lavorazione", pending: "In Attesa",
};

function deriveStatus(order: Order): string {
  const parts = order.lots.flatMap(l => l.parts);
  if (parts.length === 0) return "pending";
  if (parts.every(p => p.status === "done")) return "done";
  if (parts.some(p => p.status === "in-progress" || p.status === "done")) return "in-progress";
  return "pending";
}

const EMPTY_FORM = { name: "", orderNumber: "", startDate: new Date().toISOString().split("T")[0], color: "#3b82f6", shippingList: "" };
const GANTT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function Commesse() {
  const { orders, setOrders } = useSchedulerData();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<"new" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const openNew = () => { setForm(EMPTY_FORM); setSelected(null); setDialog("new"); };
  const openEdit = (o: Order) => { setForm({ name: o.name, orderNumber: o.orderNumber, startDate: o.startDate, color: o.color, shippingList: o.shippingList ?? "" }); setSelected(o); setDialog("edit"); };
  const openDelete = (o: Order) => { setSelected(o); setDialog("delete"); };

  const handleSaveNew = () => {
    if (!form.name || !form.orderNumber || !form.startDate) return;
    const newId = `o${Date.now()}`;
    setOrders([...orders, { id: newId, ...form, lots: [] }]);
    addAuditEntry({
      actionType: "creazione",
      orderId: newId,
      orderNumber: form.orderNumber,
      field: "Commessa",
      newValue: `${form.name} (${form.orderNumber})`,
    });
    setDialog(null);
  };
  const handleSaveEdit = () => {
    if (!selected || !form.name || !form.orderNumber) return;
    setOrders(orders.map(o => o.id === selected.id ? { ...o, ...form } : o));
    if (form.name !== selected.name) {
      addAuditEntry({
        actionType: "modifica",
        orderId: selected.id,
        orderNumber: selected.orderNumber,
        field: "Nome",
        previousValue: selected.name,
        newValue: form.name,
      });
    }
    if (form.orderNumber !== selected.orderNumber) {
      addAuditEntry({
        actionType: "modifica",
        orderId: selected.id,
        orderNumber: selected.orderNumber,
        field: "N. Commessa",
        previousValue: selected.orderNumber,
        newValue: form.orderNumber,
      });
    }
    if (form.startDate !== selected.startDate) {
      addAuditEntry({
        actionType: "cambio_data",
        orderId: selected.id,
        orderNumber: selected.orderNumber,
        field: "Data Inizio",
        previousValue: selected.startDate,
        newValue: form.startDate,
      });
    }
    setDialog(null);
  };
  const handleDelete = () => {
    if (!selected) return;
    addAuditEntry({
      actionType: "cancellazione",
      orderId: selected.id,
      orderNumber: selected.orderNumber,
      field: "Commessa",
      previousValue: `${selected.name} (${selected.lots.length} lotti)`,
    });
    setOrders(orders.filter(o => o.id !== selected.id));
    setDialog(null);
  };

  const isFormOpen = dialog === "new" || dialog === "edit";

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-5">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">Commesse</h2>
          {can("crudOrders") && (
            <Button onClick={openNew} data-testid="button-add-commessa">
              <Plus size={15} className="mr-2" /> Nuova Commessa
            </Button>
          )}
        </div>

        {/* ─── New/Edit Dialog ─── */}
        <Dialog open={isFormOpen} onOpenChange={o => !o && setDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dialog === "new" ? "Nuova Commessa" : "Modifica Commessa"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>N. Commessa</Label>
                  <Input value={form.orderNumber} onChange={e => setForm({ ...form, orderNumber: e.target.value })} placeholder="CMM-2024-…" data-testid="input-order-number" />
                </div>
                <div className="grid gap-2">
                  <Label>Nome Commessa</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-order-name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Data Inizio</Label>
                  <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} data-testid="input-order-start" />
                </div>
                <div className="grid gap-2">
                  <Label>Lista di Spedizione</Label>
                  <Input value={form.shippingList} onChange={e => setForm({ ...form, shippingList: e.target.value })} placeholder="es. 537 - 2026" data-testid="input-order-shipping-list" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Colore Gantt</Label>
                <div className="flex flex-wrap gap-2">
                  {GANTT_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-white scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border p-0" title="Colore personalizzato" />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
                <Button onClick={dialog === "new" ? handleSaveNew : handleSaveEdit} data-testid="button-save-order">
                  {dialog === "new" ? "Crea Commessa" : "Salva"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Delete Dialog ─── */}
        <Dialog open={dialog === "delete"} onOpenChange={o => !o && setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Elimina Commessa</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Eliminare <span className="font-bold text-foreground">{selected?.name}</span> ({selected?.orderNumber})? Tutti i lotti e le fasi associate saranno rimossi.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDelete} data-testid="button-confirm-delete-order">Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Table ─── */}
        <div className="bg-card border border-card-border rounded overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-3 w-8" />
                <th className="px-3 py-3">N. Commessa</th>
                <th className="px-3 py-3">Nome</th>
                <th className="px-3 py-3">Data Inizio</th>
                <th className="px-3 py-3">Lista Sped.</th>
                <th className="px-3 py-3">Lotti</th>
                <th className="px-3 py-3">Fasi</th>
                <th className="px-3 py-3">Stato</th>
                <th className="px-3 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground italic">Nessuna commessa. Creane una con il tasto in alto a destra.</td></tr>
              )}
              {orders.map(order => {
                const partsCount = order.lots.reduce((acc, l) => acc + l.parts.length, 0);
                const status = deriveStatus(order);
                const isExp = expanded.has(order.id);
                return (
                  <React.Fragment key={order.id}>
                    <tr className="border-b border-border hover:bg-muted/20 transition-colors">
                      {/* Expand toggle */}
                      <td className="px-3 py-3">
                        {order.lots.length > 0 ? (
                          <button onClick={() => toggleExpand(order.id)} className="text-muted-foreground hover:text-primary transition-colors" data-testid={`button-expand-${order.id}`}>
                            {isExp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        ) : <span className="w-4 inline-block" />}
                      </td>
                      <td className="px-3 py-3 font-mono text-primary">{order.orderNumber}</td>
                      <td className="px-3 py-3 font-bold flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: order.color }} />
                        {order.name}
                      </td>
                      <td className="px-3 py-3 font-mono text-sm">{order.startDate}</td>
                      <td className="px-3 py-3 font-mono text-sm text-muted-foreground">{order.shippingList || "—"}</td>
                      <td className="px-3 py-3 font-mono">{order.lots.length}</td>
                      <td className="px-3 py-3 font-mono">{partsCount}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${STATUS_COLORS[status]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 justify-end">
                          <Link href={`/commesse/${order.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Dettaglio" data-testid={`button-view-${order.id}`}><Eye size={13} /></Button>
                          </Link>
                          {can("crudOrders") && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Modifica" onClick={() => openEdit(order)} data-testid={`button-edit-${order.id}`}><Pencil size={13} /></Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Elimina" onClick={() => openDelete(order)} data-testid={`button-delete-${order.id}`}><Trash2 size={13} /></Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ─── Expanded: Lotti & Fasi ─── */}
                    {isExp && order.lots.map((lot: Lot) => (
                      <React.Fragment key={`lot-${lot.id}`}>
                        <tr className="border-b border-border/50 bg-muted/30">
                          <td className="pl-8 py-2" />
                          <td colSpan={2} className="py-2 text-xs font-bold uppercase tracking-wider text-primary/80">
                            {lot.name}
                          </td>
                          <td colSpan={6} className="py-2 text-xs text-muted-foreground font-mono">{lot.parts.length} fasi</td>
                        </tr>
                        {lot.parts.map((part: Part) => (
                          <tr key={`part-${part.id}`} className="border-b border-border/30 bg-muted/10">
                            <td className="pl-12 py-1.5" />
                            <td className="py-1.5 text-xs font-mono text-muted-foreground">{part.line}</td>
                            <td className="py-1.5 text-xs">{part.name}</td>
                            <td className="py-1.5 text-xs font-mono">{part.estimatedHours}h</td>
                            <td className="py-1.5 text-xs">{part.requiredSkill}</td>
                            <td className="py-1.5 text-xs">{part.quantity ? `${part.quantity} pz` : "—"}</td>
                            <td className="py-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${STATUS_COLORS[part.status]}`}>
                                {STATUS_LABELS[part.status]}
                              </span>
                            </td>
                            <td />
                            <td />
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
