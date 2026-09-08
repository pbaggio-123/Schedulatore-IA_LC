import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { computePartDurationDays, Part, Lot, SkillTag } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartStaffing from "@/components/SmartStaffing";
import { Pencil, Trash2, Plus, ChevronLeft } from "lucide-react";

const ALL_SKILLS: SkillTag[] = ["Saldatura", "Taglio", "Assemblaggio", "Verniciatura", "Collaudo", "CNC"];

const STATUS_LABELS: Record<string, string> = {
  pending: "In Attesa",
  "in-progress": "In Lavorazione",
  done: "Completata",
};

const STATUS_COLORS: Record<string, string> = {
  done: "bg-green-500/20 text-green-500",
  "in-progress": "bg-blue-500/20 text-blue-500",
  pending: "bg-amber-500/20 text-amber-500",
};

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const [, setLocation] = useLocation();
  const { orders, setOrders, employees } = useSchedulerData();

  const orderId = params?.id;
  const order = orders.find(o => o.id === orderId);

  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [editingPart, setEditingPart] = useState<Part | null>(null);

  // Lot dialogs
  const [lotDialog, setLotDialog] = useState<"edit" | "delete" | null>(null);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [lotName, setLotName] = useState("");

  // Part delete dialog
  const [partDeleteDialog, setPartDeleteDialog] = useState<{ lotId: string; part: Part } | null>(null);

  const updateOrder = (updatedLots: Lot[]) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, lots: updatedLots } : o));
  };

  if (!order) {
    return (
      <Layout>
        <div className="p-6 text-muted-foreground italic">Ordine non trovato.</div>
      </Layout>
    );
  }

  // --- Lot operations ---
  const handleAddLot = () => {
    updateOrder([...order.lots, { id: `l${Date.now()}`, name: `Lotto ${order.lots.length + 1}`, parts: [] }]);
  };

  const openEditLot = (lot: Lot) => {
    setSelectedLot(lot);
    setLotName(lot.name);
    setLotDialog("edit");
  };

  const openDeleteLot = (lot: Lot) => {
    setSelectedLot(lot);
    setLotDialog("delete");
  };

  const handleSaveEditLot = () => {
    if (!selectedLot || !lotName) return;
    updateOrder(order.lots.map(l => l.id === selectedLot.id ? { ...l, name: lotName } : l));
    setLotDialog(null);
  };

  const handleDeleteLot = () => {
    if (!selectedLot) return;
    updateOrder(order.lots.filter(l => l.id !== selectedLot.id));
    setLotDialog(null);
  };

  // --- Part operations ---
  const handleAddPart = (lotId: string) => {
    const updatedLots = order.lots.map(l => {
      if (l.id === lotId) {
        return {
          ...l,
          parts: [...l.parts, {
            id: `p${Date.now()}`,
            name: "Nuova Parte",
            estimatedHours: 8,
            requiredSkill: "Taglio",
            assignedEmployeeIds: [],
            line: "L1",
            status: "pending",
          } as Part],
        };
      }
      return l;
    });
    updateOrder(updatedLots);
  };

  const handleDeletePart = () => {
    if (!partDeleteDialog) return;
    const { lotId, part } = partDeleteDialog;
    const updatedLots = order.lots.map(l =>
      l.id === lotId ? { ...l, parts: l.parts.filter(p => p.id !== part.id) } : l
    );
    updateOrder(updatedLots);
    setPartDeleteDialog(null);
  };

  const savePart = () => {
    if (!editingPart) return;
    const updatedLots = order.lots.map(l => ({
      ...l,
      parts: l.parts.map(p => p.id === editingPart.id ? editingPart : p),
    }));
    updateOrder(updatedLots);
    setActivePartId(null);
  };

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setLocation("/orders")}
            className="flex items-center gap-1 text-xs text-muted-foreground uppercase hover:text-primary transition-colors w-fit"
            data-testid="button-back-orders"
          >
            <ChevronLeft size={14} /> Tutti gli Ordini
          </button>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-sm shrink-0 border border-border" style={{ backgroundColor: order.color }} />
            <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">{order.name}</h2>
            <div className="px-2 py-1 bg-muted rounded text-xs font-mono text-muted-foreground">{order.orderNumber}</div>
          </div>
          <div className="text-sm text-muted-foreground font-mono">
            Data Inizio: <span className="text-foreground">{order.startDate}</span>
          </div>
        </div>

        {/* Lots */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold uppercase tracking-tight">Lotti</h3>
            <Button onClick={handleAddLot} variant="outline" size="sm" data-testid="button-add-lot">
              <Plus size={14} className="mr-1" /> Aggiungi Lotto
            </Button>
          </div>

          {order.lots.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nessun lotto presente. Aggiungi il primo lotto.</p>
          )}

          {order.lots.map(lot => (
            <div key={lot.id} className="bg-card border border-card-border rounded p-4 flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-border pb-2">
                <h3 className="font-bold text-lg uppercase tracking-wide">{lot.name}</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openEditLot(lot)} title="Rinomina lotto" data-testid={`button-edit-lot-${lot.id}`}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => openDeleteLot(lot)} title="Elimina lotto" data-testid={`button-delete-lot-${lot.id}`}>
                    <Trash2 size={14} />
                  </Button>
                  <Button onClick={() => handleAddPart(lot.id)} size="sm" variant="secondary" data-testid={`button-add-part-${lot.id}`}>
                    <Plus size={14} className="mr-1" /> Aggiungi Parte
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {lot.parts.length === 0 && (
                  <div className="text-sm text-muted-foreground py-2 italic">Nessuna parte in questo lotto.</div>
                )}
                {lot.parts.map(part => {
                  const duration = computePartDurationDays(part);
                  return (
                    <div
                      key={part.id}
                      className="grid grid-cols-12 gap-2 items-center bg-background border border-border p-3 rounded hover:border-primary/50 transition-colors group"
                      data-testid={`part-row-${part.id}`}
                    >
                      <div
                        className="col-span-3 font-bold group-hover:text-primary transition-colors cursor-pointer"
                        onClick={() => { setEditingPart(part); setActivePartId(part.id); }}
                      >
                        {part.name}
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs uppercase text-muted-foreground block">Linea</span>
                        <span className="font-mono">{part.line}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs uppercase text-muted-foreground block">Durata</span>
                        <span className="font-mono">{duration}g</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs uppercase text-muted-foreground block">Skill</span>
                        <span className="text-xs bg-secondary px-2 py-0.5 rounded inline-block mt-1">{part.requiredSkill}</span>
                      </div>
                      <div className="col-span-2">
                        <span className={`text-xs px-2 py-1 rounded uppercase tracking-wider ${STATUS_COLORS[part.status]}`}>
                          {STATUS_LABELS[part.status]}
                        </span>
                      </div>
                      <div className="col-span-1 flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => { setEditingPart(part); setActivePartId(part.id); }}
                          data-testid={`button-edit-part-${part.id}`}
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setPartDeleteDialog({ lotId: lot.id, part })}
                          data-testid={`button-delete-part-${part.id}`}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Edit Part Dialog */}
        <Dialog open={!!activePartId} onOpenChange={(open) => !open && setActivePartId(null)}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Modifica Parte: {editingPart?.name}</DialogTitle>
            </DialogHeader>
            {editingPart && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Nome Parte</Label>
                  <Input value={editingPart.name} onChange={e => setEditingPart({ ...editingPart, name: e.target.value })} data-testid="input-part-name" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Ore Stimate</Label>
                    <Input type="number" min="1" value={editingPart.estimatedHours} onChange={e => setEditingPart({ ...editingPart, estimatedHours: parseInt(e.target.value) || 1 })} data-testid="input-part-hours" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Linea di Produzione</Label>
                    <Select value={editingPart.line} onValueChange={(val: "L1" | "L2" | "L3") => setEditingPart({ ...editingPart, line: val })}>
                      <SelectTrigger data-testid="select-part-line">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L1">Linea 1 (L1)</SelectItem>
                        <SelectItem value="L2">Linea 2 (L2)</SelectItem>
                        <SelectItem value="L3">Linea 3 (L3)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Competenza Richiesta</Label>
                    <Select value={editingPart.requiredSkill} onValueChange={(val: SkillTag) => setEditingPart({ ...editingPart, requiredSkill: val, assignedEmployeeIds: [] })}>
                      <SelectTrigger data-testid="select-part-skill">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_SKILLS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Stato</Label>
                    <Select value={editingPart.status} onValueChange={(val: Part["status"]) => setEditingPart({ ...editingPart, status: val })}>
                      <SelectTrigger data-testid="select-part-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">In Attesa</SelectItem>
                        <SelectItem value="in-progress">In Lavorazione</SelectItem>
                        <SelectItem value="done">Completata</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-2 border-t border-border mt-2">
                  <h4 className="text-sm font-bold uppercase tracking-tight mb-3">Assegnazione Personale</h4>
                  <SmartStaffing
                    allEmployees={employees}
                    requiredSkill={editingPart.requiredSkill}
                    estimatedHours={editingPart.estimatedHours}
                    assignedIds={editingPart.assignedEmployeeIds}
                    onChange={(ids) => setEditingPart({ ...editingPart, assignedEmployeeIds: ids })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 mt-2">
                  <Button variant="outline" onClick={() => setActivePartId(null)}>Annulla</Button>
                  <Button onClick={savePart} data-testid="button-save-part">Salva Modifiche</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Lot Name Dialog */}
        <Dialog open={lotDialog === "edit"} onOpenChange={(open) => !open && setLotDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rinomina Lotto</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Nome Lotto</Label>
                <Input value={lotName} onChange={e => setLotName(e.target.value)} data-testid="input-lot-name" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setLotDialog(null)}>Annulla</Button>
                <Button onClick={handleSaveEditLot} data-testid="button-save-lot-name">Salva</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Lot Dialog */}
        <Dialog open={lotDialog === "delete"} onOpenChange={(open) => !open && setLotDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Elimina Lotto</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Sei sicuro di voler eliminare il lotto <span className="text-foreground font-bold">{selectedLot?.name}</span> con tutte le sue parti?
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setLotDialog(null)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDeleteLot} data-testid="button-confirm-delete-lot">Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Part Dialog */}
        <Dialog open={!!partDeleteDialog} onOpenChange={(open) => !open && setPartDeleteDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Elimina Parte</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Sei sicuro di voler eliminare la parte <span className="text-foreground font-bold">{partDeleteDialog?.part.name}</span>?
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setPartDeleteDialog(null)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDeletePart} data-testid="button-confirm-delete-part">Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
