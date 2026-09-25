import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { computePartDurationDays, Part, Lot, SkillTag } from "@/types";
import { addAuditEntry } from "@/hooks/useAuditLog";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartStaffing from "@/components/SmartStaffing";
import { computeScheduledParts, findEmployeeOverlaps, overlapAllowedCodesOf } from "@/lib/schedule";
import { computeEmployeeLoads } from "@/lib/capacity";
import { Pencil, Trash2, Plus, ChevronLeft, AlertTriangle } from "lucide-react";

// Skills loaded dynamically from hook

const STATUS_LABELS: Record<string, string> = {
  pending: "In Attesa", "in-progress": "In Lavorazione", done: "Completata",
};
const STATUS_COLORS: Record<string, string> = {
  done: "bg-green-500/20 text-green-500",
  "in-progress": "bg-blue-500/20 text-blue-500",
  pending: "bg-amber-500/20 text-amber-500",
};

export default function CommessaDetail() {
  const [, params] = useRoute("/commesse/:id");
  // Also support legacy route
  const [, paramsLegacy] = useRoute("/orders/:id");
  const [, setLocation] = useLocation();
  const { orders, setOrders, employees, catalogPhases, catalogProducts, skills: allSkills, holidays, saturdayWorking } = useSchedulerData();
  const { can } = useAuth();
  const canPlan    = can("crudOrders");        // tier 3+: struttura commessa, catalogo, nome/ore/skill

  // Carico globale per dipendente — usato da SmartStaffing per bilanciare (C2)
  const loadByEmployeeId = useMemo(() => {
    const loads = computeEmployeeLoads(
      computeScheduledParts(orders, holidays, saturdayWorking, undefined, overlapAllowedCodesOf(catalogPhases)),
      employees,
    );
    const rec: Record<string, number> = {};
    for (const l of loads) rec[l.employee.id] = l.assignedHours;
    return rec;
  }, [orders, holidays, saturdayWorking, employees, catalogPhases]);
  const canOperate = can("updatePhaseStatus"); // tier 2+: stato, linea, personale

  const orderId = params?.id ?? paramsLegacy?.id;
  const order = orders.find(o => o.id === orderId);

  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [originalPart, setOriginalPart] = useState<Part | null>(null);

  // Lot dialogs
  const [lotDialog, setLotDialog] = useState<"edit" | "delete" | null>(null);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [lotName, setLotName] = useState("");

  // Part delete dialog
  const [partDeleteDialog, setPartDeleteDialog] = useState<{ lotId: string; part: Part } | null>(null);

  // Catalog-driven state in part editor
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedPhaseId, setSelectedPhaseId]   = useState<string>("");
  const [partQty, setPartQty]                    = useState<number>(1);
  const [partAdjustment, setPartAdjustment]      = useState<number>(0);

  // When catalog phase changes → auto-fill skill + recalc hours
  useEffect(() => {
    if (!editingPart || !selectedPhaseId) return;
    const phase = catalogPhases.find(p => p.id === selectedPhaseId);
    if (!phase) return;
    const hours = Math.max(1, Math.ceil(phase.hoursPerUnit * partQty));
    setEditingPart(prev => prev ? { ...prev, requiredSkill: phase.skill, estimatedHours: hours, catalogPhaseId: phase.id, name: phase.name } : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhaseId, partQty]);

  // When selected product changes → show its phases in the selector
  const productPhases = selectedProductId
    ? (catalogProducts.find(p => p.id === selectedProductId)?.phaseIds ?? []).map(id => catalogPhases.find(p => p.id === id)).filter(Boolean) as typeof catalogPhases
    : catalogPhases;

  const updateOrder = (updatedLots: Lot[]) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, lots: updatedLots } : o));
  };

  // Avviso live nel dialog: sovrapposizioni che coinvolgerebbero la fase in
  // modifica con l'assegnazione corrente (non bloccante).
  const editingOverlaps = useMemo(() => {
    if (!editingPart) return [];
    const simulated = orders.map(o => ({
      ...o,
      lots: o.lots.map(l => ({
        ...l,
        parts: l.parts.map(p => p.id === editingPart.id ? { ...p, ...editingPart } : p),
      })),
    }));
    return findEmployeeOverlaps(
      computeScheduledParts(simulated, holidays, saturdayWorking, undefined, overlapAllowedCodesOf(catalogPhases)),
      employees,
    ).filter(ov => ov.a.id === editingPart.id || ov.b.id === editingPart.id);
  }, [editingPart, orders, holidays, saturdayWorking, employees, catalogPhases]);

  if (!order) {
    return (
      <Layout>
        <div className="p-6 text-muted-foreground italic">Commessa non trovata.</div>
      </Layout>
    );
  }

  // ── Lot ops ──────────────────────────────────────────────────────────────
  const handleAddLot = () => {
    const newLotId   = `l${Date.now()}`;
    const newLotName = `Lotto ${order.lots.length + 1}`;
    updateOrder([...order.lots, { id: newLotId, name: newLotName, parts: [] }]);
    addAuditEntry({
      actionType: "creazione",
      orderId: order.id, orderNumber: order.orderNumber,
      lotId: newLotId, lotName: newLotName,
      field: "Lotto", newValue: newLotName,
    });
  };
  const openEditLot = (lot: Lot) => { setSelectedLot(lot); setLotName(lot.name); setLotDialog("edit"); };
  const openDeleteLot = (lot: Lot) => { setSelectedLot(lot); setLotDialog("delete"); };
  const handleSaveEditLot = () => {
    if (!selectedLot || !lotName) return;
    if (lotName !== selectedLot.name) {
      addAuditEntry({
        actionType: "modifica",
        orderId: order.id, orderNumber: order.orderNumber,
        lotId: selectedLot.id, lotName: selectedLot.name,
        field: "Nome Lotto", previousValue: selectedLot.name, newValue: lotName,
      });
    }
    updateOrder(order.lots.map(l => l.id === selectedLot.id ? { ...l, name: lotName } : l));
    setLotDialog(null);
  };
  const handleDeleteLot = () => {
    if (!selectedLot) return;
    addAuditEntry({
      actionType: "cancellazione",
      orderId: order.id, orderNumber: order.orderNumber,
      lotId: selectedLot.id, lotName: selectedLot.name,
      field: "Lotto",
      previousValue: `${selectedLot.name} (${selectedLot.parts.length} fasi)`,
    });
    updateOrder(order.lots.filter(l => l.id !== selectedLot.id));
    setLotDialog(null);
  };

  // ── Part ops ─────────────────────────────────────────────────────────────
  const handleAddPart = (lotId: string) => {
    const newPartId = `p${Date.now()}`;
    const lot = order.lots.find(l => l.id === lotId);
    const updatedLots = order.lots.map(l => l.id !== lotId ? l : {
      ...l,
      parts: [...l.parts, {
        id: newPartId, name: "Nuova Fase",
        estimatedHours: 8, requiredSkill: "Taglio" as SkillTag,
        assignedEmployeeIds: [], line: "L1" as const, status: "pending" as const, quantity: 1,
      }],
    });
    updateOrder(updatedLots);
    addAuditEntry({
      actionType: "creazione",
      orderId: order.id, orderNumber: order.orderNumber,
      lotId, lotName: lot?.name,
      partId: newPartId, partName: "Nuova Fase",
      field: "Fase", newValue: "Nuova Fase",
    });
  };

  const handleDeletePart = () => {
    if (!partDeleteDialog) return;
    const { lotId, part } = partDeleteDialog;
    const lot = order.lots.find(l => l.id === lotId);
    addAuditEntry({
      actionType: "cancellazione",
      orderId: order.id, orderNumber: order.orderNumber,
      lotId, lotName: lot?.name,
      partId: part.id, partName: part.name,
      field: "Fase",
      previousValue: `${part.name} — ${part.estimatedHours}h, ${part.requiredSkill}`,
    });
    updateOrder(order.lots.map(l => l.id === lotId ? { ...l, parts: l.parts.filter(p => p.id !== part.id) } : l));
    setPartDeleteDialog(null);
  };

  const openEditPart = (part: Part) => {
    setEditingPart(part);
    setOriginalPart(part);
    setActivePartId(part.id);
    setSelectedProductId(part.catalogProductId ?? "");
    setSelectedPhaseId(part.catalogPhaseId ?? "");
    setPartQty(part.quantity ?? 1);
    setPartAdjustment(part.adjustment ?? 0);
  };

  const savePart = () => {
    if (!editingPart || !originalPart) return;
    const saved: Part = {
      ...editingPart,
      quantity: partQty,
      adjustment: partAdjustment,
      catalogPhaseId: selectedPhaseId || undefined,
      catalogProductId: selectedProductId || undefined,
    };
    const lot = order.lots.find(l => l.parts.some(p => p.id === saved.id));
    const empName = (ids: string[]) =>
      ids.map(id => employees.find(e => e.id === id)?.name ?? id).join(", ") || "Nessuno";

    // ── Status change ─────────────────────────────────────────────────────
    if (saved.status !== originalPart.status) {
      addAuditEntry({
        actionType: "cambio_stato",
        orderId: order.id, orderNumber: order.orderNumber,
        lotId: lot?.id, lotName: lot?.name,
        partId: saved.id, partName: saved.name,
        field: "Stato",
        previousValue: STATUS_LABELS[originalPart.status],
        newValue: STATUS_LABELS[saved.status],
      });
    }
    // ── Line change ───────────────────────────────────────────────────────
    if (saved.line !== originalPart.line) {
      addAuditEntry({
        actionType: "cambio_linea",
        orderId: order.id, orderNumber: order.orderNumber,
        lotId: lot?.id, lotName: lot?.name,
        partId: saved.id, partName: saved.name,
        field: "Linea",
        previousValue: originalPart.line,
        newValue: saved.line,
      });
    }
    // ── Assigned employees change ─────────────────────────────────────────
    const prevEmpSorted = [...originalPart.assignedEmployeeIds].sort().join(",");
    const nextEmpSorted = [...saved.assignedEmployeeIds].sort().join(",");
    if (prevEmpSorted !== nextEmpSorted) {
      addAuditEntry({
        actionType: "cambio_personale",
        orderId: order.id, orderNumber: order.orderNumber,
        lotId: lot?.id, lotName: lot?.name,
        partId: saved.id, partName: saved.name,
        field: "Personale",
        previousValue: empName(originalPart.assignedEmployeeIds),
        newValue: empName(saved.assignedEmployeeIds),
      });
    }
    // ── Other field changes ───────────────────────────────────────────────
    const fieldChanges: string[] = [];
    if (saved.name !== originalPart.name)
      fieldChanges.push(`Nome: "${originalPart.name}" → "${saved.name}"`);
    if (saved.estimatedHours !== originalPart.estimatedHours)
      fieldChanges.push(`Ore: ${originalPart.estimatedHours}h → ${saved.estimatedHours}h`);
    if (saved.requiredSkill !== originalPart.requiredSkill)
      fieldChanges.push(`Skill: ${originalPart.requiredSkill} → ${saved.requiredSkill}`);
    if ((saved.quantity ?? 1) !== (originalPart.quantity ?? 1))
      fieldChanges.push(`Qtà: ${originalPart.quantity ?? 1} → ${saved.quantity ?? 1}`);
    if ((saved.adjustment ?? 0) !== (originalPart.adjustment ?? 0))
      fieldChanges.push(`Variazione: ${originalPart.adjustment ?? 0}% → ${saved.adjustment ?? 0}%`);
    if (fieldChanges.length > 0) {
      addAuditEntry({
        actionType: "modifica",
        orderId: order.id, orderNumber: order.orderNumber,
        lotId: lot?.id, lotName: lot?.name,
        partId: saved.id, partName: saved.name,
        field: fieldChanges.length === 1 ? fieldChanges[0].split(":")[0] : "Vari campi",
        notes: fieldChanges.join(" | "),
      });
    }

    updateOrder(order.lots.map(l => ({ ...l, parts: l.parts.map(p => p.id === saved.id ? saved : p) })));
    setActivePartId(null);
  };

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <button onClick={() => setLocation("/commesse")}
            className="flex items-center gap-1 text-xs text-muted-foreground uppercase hover:text-primary transition-colors w-fit"
            data-testid="button-back-orders">
            <ChevronLeft size={13} /> Tutte le Commesse
          </button>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-sm shrink-0 border border-border" style={{ backgroundColor: order.color }} />
            <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">{order.name}</h2>
            <div className="px-2 py-1 bg-muted rounded text-xs font-mono text-muted-foreground">{order.orderNumber}</div>
          </div>
          <div className="text-sm text-muted-foreground font-mono">Data Inizio: <span className="text-foreground">{order.startDate}</span></div>
        </div>

        {/* Lots */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold uppercase tracking-tight">Lotti</h3>
            {canPlan && (
              <Button onClick={handleAddLot} variant="outline" size="sm" data-testid="button-add-lot">
                <Plus size={13} className="mr-1" /> Aggiungi Lotto
              </Button>
            )}
          </div>

          {order.lots.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nessun lotto. Aggiungine uno con il pulsante.</p>
          )}

          {order.lots.map(lot => (
            <div key={lot.id} className="bg-card border border-card-border rounded p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-border pb-2">
                <h3 className="font-bold text-lg uppercase tracking-wide">{lot.name}</h3>
                {canPlan && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditLot(lot)} data-testid={`button-edit-lot-${lot.id}`}><Pencil size={13} /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => openDeleteLot(lot)} data-testid={`button-delete-lot-${lot.id}`}><Trash2 size={13} /></Button>
                    <Button onClick={() => handleAddPart(lot.id)} size="sm" variant="secondary" data-testid={`button-add-part-${lot.id}`}>
                      <Plus size={13} className="mr-1" /> Aggiungi Fase
                    </Button>
                  </div>
                )}
              </div>

              {lot.parts.length === 0 && <div className="text-sm text-muted-foreground italic py-1">Nessuna fase in questo lotto.</div>}

              {lot.parts.map(part => {
                const duration = computePartDurationDays(part);
                return (
                  <div key={part.id}
                    className="grid grid-cols-12 gap-2 items-center bg-background border border-border p-3 rounded hover:border-primary/50 transition-colors group"
                    data-testid={`part-row-${part.id}`}>
                    <div className={`col-span-3 font-bold text-sm ${canOperate ? "group-hover:text-primary transition-colors cursor-pointer" : ""}`}
                      onClick={() => canOperate && openEditPart(part)}>{part.name}</div>
                    <div className="col-span-1 text-xs"><span className="block text-muted-foreground uppercase text-[10px]">Linea</span><span className="font-mono">{part.line}</span></div>
                    <div className="col-span-1 text-xs"><span className="block text-muted-foreground uppercase text-[10px]">Durata</span><span className="font-mono">{duration}g</span></div>
                    <div className="col-span-1 text-xs"><span className="block text-muted-foreground uppercase text-[10px]">Ore</span><span className="font-mono">{part.estimatedHours}h</span></div>
                    <div className="col-span-1 text-xs"><span className="block text-muted-foreground uppercase text-[10px]">Qtà</span><span className="font-mono">{part.quantity ?? "—"}</span></div>
                    <div className="col-span-2 text-xs"><span className="block text-muted-foreground uppercase text-[10px]">Skill</span><span className="bg-secondary px-1.5 py-0.5 rounded text-[10px] inline-block mt-0.5">{part.requiredSkill}</span></div>
                    <div className="col-span-2 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${STATUS_COLORS[part.status]}`}>{STATUS_LABELS[part.status]}</span>
                    </div>
                    <div className="col-span-1 flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {canOperate && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditPart(part)} data-testid={`button-edit-part-${part.id}`}><Pencil size={11} /></Button>
                      )}
                      {canPlan && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => setPartDeleteDialog({ lotId: lot.id, part })} data-testid={`button-delete-part-${part.id}`}><Trash2 size={11} /></Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Edit Part Dialog ── */}
        <Dialog open={!!activePartId} onOpenChange={o => !o && setActivePartId(null)}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader><DialogTitle>Modifica Fase: {editingPart?.name}</DialogTitle></DialogHeader>
            {editingPart && (
              <div className="grid gap-4 py-4 max-h-[75vh] overflow-y-auto pr-1">

                {/* ── Catalog selectors (solo Pianificatore+) ── */}
                {canPlan && (
                <div className="rounded border border-primary/20 bg-primary/5 p-3 flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">Selezione da Catalogo</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5 min-w-0">
                      <Label className="text-xs">Articolo (opzionale)</Label>
                      <Select value={selectedProductId} onValueChange={v => { setSelectedProductId(v); setSelectedPhaseId(""); }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tutti gli articoli" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all-phases">Tutte le fasi</SelectItem>
                          {catalogProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5 min-w-0">
                      <Label className="text-xs">Fase di Lavorazione</Label>
                      <Select value={selectedPhaseId} onValueChange={setSelectedPhaseId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleziona fase…" /></SelectTrigger>
                        <SelectContent>
                          {productPhases.map(ph => (
                            <SelectItem key={ph.id} value={ph.id}>{ph.name} ({ph.hoursPerUnit}h/{ph.unit})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Quantità ({catalogPhases.find(p => p.id === selectedPhaseId)?.unit ?? "pz"})</Label>
                    <div className="flex items-center gap-3">
                      <Input type="number" min="1" value={partQty} onChange={e => setPartQty(parseInt(e.target.value) || 1)} className="h-8 w-28 text-xs" data-testid="input-part-qty" />
                      {selectedPhaseId && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {partQty} × {catalogPhases.find(p => p.id === selectedPhaseId)?.hoursPerUnit}h =
                          <span className="text-primary font-bold ml-1">{Math.max(1, Math.ceil((catalogPhases.find(p => p.id === selectedPhaseId)?.hoursPerUnit ?? 0) * partQty))}h base</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Variazione percentuale ── */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs flex items-center gap-2">
                      Variazione Temporale
                      <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
                        partAdjustment > 0 ? "bg-amber-500/20 text-amber-400"
                        : partAdjustment < 0 ? "bg-green-500/20 text-green-400"
                        : "bg-muted text-muted-foreground"
                      }`}>
                        {partAdjustment > 0 ? "+" : ""}{partAdjustment}%
                      </span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="h-7 w-7 rounded border border-border bg-muted hover:bg-muted/70 text-sm font-bold flex items-center justify-center"
                        onClick={() => setPartAdjustment(v => Math.max(-50, v - 5))}
                      >−</button>
                      <input
                        type="range" min="-50" max="100" step="5"
                        value={partAdjustment}
                        onChange={e => setPartAdjustment(parseInt(e.target.value))}
                        className="flex-1 accent-primary h-1"
                        data-testid="input-part-adjustment"
                      />
                      <button
                        type="button"
                        className="h-7 w-7 rounded border border-border bg-muted hover:bg-muted/70 text-sm font-bold flex items-center justify-center"
                        onClick={() => setPartAdjustment(v => Math.min(100, v + 5))}
                      >+</button>
                    </div>
                    {selectedPhaseId && (() => {
                      const ph = catalogPhases.find(p => p.id === selectedPhaseId);
                      if (!ph) return null;
                      const base = Math.max(1, Math.ceil(ph.hoursPerUnit * partQty));
                      const adjusted = Math.max(1, Math.ceil(base * (1 + partAdjustment / 100)));
                      if (partAdjustment === 0) return null;
                      return (
                        <p className="text-xs font-mono text-muted-foreground">
                          Base {base}h → Effettive <span className={`font-bold ${partAdjustment > 0 ? "text-amber-400" : "text-green-400"}`}>{adjusted}h</span>
                          <span className="ml-1 text-[10px]">({adjusted > base ? "+" : ""}{adjusted - base}h)</span>
                        </p>
                      );
                    })()}
                    <p className="text-[10px] text-muted-foreground">Da −50% a +100% in step da 5%. Valore 0 = nessuna variazione.</p>
                  </div>
                </div>
                )}

                {/* ── Manual override fields (solo Pianificatore+) ── */}
                {canPlan && (
                <div className="grid gap-2">
                  <Label>Nome Fase</Label>
                  <Input value={editingPart.name} onChange={e => setEditingPart({ ...editingPart, name: e.target.value })} data-testid="input-part-name" />
                </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {canPlan && (
                  <div className="grid gap-2">
                    <Label>Ore Stimate (totali)</Label>
                    <Input type="number" min="1" value={editingPart.estimatedHours}
                      onChange={e => setEditingPart({ ...editingPart, estimatedHours: parseInt(e.target.value) || 1 })}
                      data-testid="input-part-hours" />
                  </div>
                  )}
                  <div className="grid gap-2">
                    <Label>Linea di Produzione</Label>
                    <Select value={editingPart.line} onValueChange={(v: "L1"|"L2"|"L3") => setEditingPart({ ...editingPart, line: v })}>
                      <SelectTrigger data-testid="select-part-line"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L1">Linea 1 (L1)</SelectItem>
                        <SelectItem value="L2">Linea 2 (L2)</SelectItem>
                        <SelectItem value="L3">Linea 3 (L3)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {canPlan && (
                  <div className="grid gap-2">
                    <Label>Competenza Richiesta</Label>
                    <Select value={editingPart.requiredSkill} onValueChange={(v: SkillTag) => setEditingPart({ ...editingPart, requiredSkill: v, assignedEmployeeIds: [] })}>
                      <SelectTrigger data-testid="select-part-skill"><SelectValue /></SelectTrigger>
                      <SelectContent>{allSkills.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  )}
                  <div className="grid gap-2">
                    <Label>Stato</Label>
                    <Select value={editingPart.status} onValueChange={(v: Part["status"]) => setEditingPart({ ...editingPart, status: v })}>
                      <SelectTrigger data-testid="select-part-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">In Attesa</SelectItem>
                        <SelectItem value="in-progress">In Lavorazione</SelectItem>
                        <SelectItem value="done">Completata</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <h4 className="text-xs font-bold uppercase tracking-tight mb-3">Assegnazione Personale</h4>
                  <SmartStaffing
                    allEmployees={employees}
                    requiredSkill={editingPart.requiredSkill}
                    estimatedHours={editingPart.estimatedHours}
                    adjustment={partAdjustment}
                    assignedIds={editingPart.assignedEmployeeIds}
                    onChange={ids => setEditingPart({ ...editingPart, assignedEmployeeIds: ids })}
                    loadByEmployeeId={loadByEmployeeId}
                  />
                  {editingOverlaps.length > 0 && (
                    <div className="mt-3 border border-amber-500/40 bg-amber-500/10 rounded p-2.5 flex flex-col gap-1" data-testid="overlap-warning-dialog">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-500 uppercase">
                        <AlertTriangle size={13} /> Attenzione: sovrapposizione (puoi comunque salvare)
                      </span>
                      {editingOverlaps.map((ov, i) => {
                        const other = ov.a.id === editingPart.id ? ov.b : ov.a;
                        return (
                          <span key={i} className="text-xs font-mono text-muted-foreground">
                            <span className="text-amber-400 font-bold">{ov.employeeName}</span> è già impegnato su «{other.orderName} / {other.lotName} / {other.name}» nello stesso periodo.
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setActivePartId(null)}>Annulla</Button>
                  <Button onClick={savePart} data-testid="button-save-part">Salva Fase</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Edit Lot Name Dialog ── */}
        <Dialog open={lotDialog === "edit"} onOpenChange={o => !o && setLotDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Rinomina Lotto</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2"><Label>Nome Lotto</Label><Input value={lotName} onChange={e => setLotName(e.target.value)} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setLotDialog(null)}>Annulla</Button>
                <Button onClick={handleSaveEditLot}>Salva</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete Lot Dialog ── */}
        <Dialog open={lotDialog === "delete"} onOpenChange={o => !o && setLotDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Elimina Lotto</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">Eliminare il lotto <span className="font-bold text-foreground">{selectedLot?.name}</span> con tutte le fasi?</p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setLotDialog(null)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDeleteLot}>Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete Part Dialog ── */}
        <Dialog open={!!partDeleteDialog} onOpenChange={o => !o && setPartDeleteDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Elimina Fase</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">Eliminare la fase <span className="font-bold text-foreground">{partDeleteDialog?.part.name}</span>?</p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setPartDeleteDialog(null)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDeletePart}>Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
