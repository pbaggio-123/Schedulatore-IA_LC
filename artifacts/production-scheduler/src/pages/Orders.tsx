import { useState } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { Order } from "@/types";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Eye, Plus } from "lucide-react";

const EMPTY_FORM = { name: "", orderNumber: "", startDate: new Date().toISOString().split("T")[0], color: "#3b82f6" };

export default function Orders() {
  const { orders, setOrders } = useSchedulerData();
  const [dialog, setDialog] = useState<"new" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setSelected(null);
    setDialog("new");
  };

  const openEdit = (order: Order) => {
    setForm({ name: order.name, orderNumber: order.orderNumber, startDate: order.startDate, color: order.color });
    setSelected(order);
    setDialog("edit");
  };

  const openDelete = (order: Order) => {
    setSelected(order);
    setDialog("delete");
  };

  const handleSaveNew = () => {
    if (!form.name || !form.orderNumber || !form.startDate) return;
    setOrders([...orders, { id: `o${Date.now()}`, ...form, lots: [] }]);
    setDialog(null);
  };

  const handleSaveEdit = () => {
    if (!selected || !form.name || !form.orderNumber || !form.startDate) return;
    setOrders(orders.map(o => o.id === selected.id ? { ...o, ...form } : o));
    setDialog(null);
  };

  const handleDelete = () => {
    if (!selected) return;
    setOrders(orders.filter(o => o.id !== selected.id));
    setDialog(null);
  };

  const isOpen = dialog === "new" || dialog === "edit";

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">Gestione Ordini</h2>
          <Button onClick={openNew} data-testid="button-add-order">
            <Plus size={16} className="mr-2" /> Nuovo Ordine
          </Button>
        </div>

        {/* New / Edit dialog */}
        <Dialog open={isOpen} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dialog === "new" ? "Nuovo Ordine" : "Modifica Ordine"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="orderNumber">Numero Ordine</Label>
                <Input id="orderNumber" value={form.orderNumber} onChange={e => setForm({ ...form, orderNumber: e.target.value })} placeholder="ORD-2024-..." data-testid="input-order-number" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Nome Commessa</Label>
                <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-order-name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="startDate">Data Inizio</Label>
                <Input id="startDate" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} data-testid="input-order-start" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="color">Colore Gantt</Label>
                <div className="flex items-center gap-3">
                  <Input id="color" type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-14 h-10 p-1 cursor-pointer" />
                  <span className="text-sm text-muted-foreground font-mono">{form.color}</span>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
                <Button onClick={dialog === "new" ? handleSaveNew : handleSaveEdit} data-testid="button-save-order">
                  {dialog === "new" ? "Crea Ordine" : "Salva Modifiche"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete confirm dialog */}
        <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Elimina Ordine</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Sei sicuro di voler eliminare l&apos;ordine <span className="text-foreground font-bold">{selected?.name}</span> ({selected?.orderNumber})?
              Questa azione cancellerà anche tutti i lotti e le parti associate.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDelete} data-testid="button-confirm-delete-order">Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="bg-card border border-card-border rounded overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3">N. Ordine</th>
                <th className="px-4 py-3">Commessa</th>
                <th className="px-4 py-3">Data Inizio</th>
                <th className="px-4 py-3">Lotti</th>
                <th className="px-4 py-3">Parti</th>
                <th className="px-4 py-3">Colore</th>
                <th className="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground italic">Nessun ordine presente</td>
                </tr>
              )}
              {orders.map(order => {
                const partsCount = order.lots.reduce((acc, lot) => acc + lot.parts.length, 0);
                return (
                  <tr key={order.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-primary">{order.orderNumber}</td>
                    <td className="px-4 py-3 font-bold">{order.name}</td>
                    <td className="px-4 py-3 font-mono">{order.startDate}</td>
                    <td className="px-4 py-3 font-mono">{order.lots.length}</td>
                    <td className="px-4 py-3 font-mono">{partsCount}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block w-6 h-6 rounded border border-border" style={{ backgroundColor: order.color }} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Link href={`/orders/${order.id}`}>
                          <Button variant="ghost" size="sm" title="Dettaglio" data-testid={`button-view-order-${order.id}`}>
                            <Eye size={15} />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" title="Modifica" onClick={() => openEdit(order)} data-testid={`button-edit-order-${order.id}`}>
                          <Pencil size={15} />
                        </Button>
                        <Button variant="ghost" size="sm" title="Elimina" className="text-destructive hover:text-destructive" onClick={() => openDelete(order)} data-testid={`button-delete-order-${order.id}`}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
