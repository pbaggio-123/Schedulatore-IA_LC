import { Order, Lot } from "@/types";

// Import commesse/lotti da Kissflow (board "Programmazione Lavori Tecnici").
// Un "item" Kissflow = una commessa; ogni "subitem" del suo item = un lotto.
// Usato sia dalla UI di import manuale (pages/Importa.tsx) sia — in versione
// duplicata e autonoma, vedi CLAUDE.md §6.4 — dall'endpoint /api/kissflow.ts
// per l'ingestione diretta via API.
//
// Le righe attese sono oggetti con le chiavi già normalizzate da
// `normalizeHeader` in lib/importData.ts (minuscolo, spazi→_):
//   item:    item_id, title, assignee, priority, status, requester,
//            start_date, created_at
//   subitem: item_id, subitem_state, subitem_title, due_date

export interface KissflowItemRow { [key: string]: string }
export interface KissflowSubitemRow { [key: string]: string }

const GANTT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

/** Colore stabile (hash del testo) per assegnare un colore Gantt distinto per commessa importata. */
export function colorForKissflowKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return GANTT_COLORS[h % GANTT_COLORS.length];
}

/** "25214 C.M.B. FONDAZIONE..." → { orderNumber: "25214", name: "C.M.B. FONDAZIONE..." }. */
export function splitKissflowTitle(title: string): { orderNumber: string; name: string } {
  const trimmed = title.trim();
  const m = trimmed.match(/^(\S+)\s+(.*)$/);
  if (m && m[2]) return { orderNumber: m[1], name: m[2] };
  return { orderNumber: trimmed, name: trimmed };
}

/** Id del subitem ("UT-0839-07") → id dell'item padre ("UT-0839"). */
export function kissflowParentItemId(subitemId: string): string {
  return subitemId.replace(/-\d+$/, "");
}

function toDateOnly(s: string | undefined): string {
  return (s ?? "").trim().slice(0, 10);
}

export function buildLotFromSubitem(row: KissflowSubitemRow): Lot {
  const subId = (row.item_id ?? "").trim();
  return {
    id: `kf-${subId}`,
    name: (row.subitem_title ?? "").trim(),
    parts: [],
    kissflowId: subId,
    externalStatus: (row.subitem_state ?? "").trim() || undefined,
    dueDate: toDateOnly(row.due_date) || undefined,
  };
}

export function buildOrderFromKissflow(item: KissflowItemRow, subitemRows: KissflowSubitemRow[]): Order {
  const itemId = (item.item_id ?? "").trim();
  const { orderNumber, name } = splitKissflowTitle(item.title || itemId);
  const startDate =
    toDateOnly(item.start_date) || toDateOnly(item.created_at) || new Date().toISOString().slice(0, 10);
  const lots = subitemRows
    .filter(s => kissflowParentItemId((s.item_id ?? "").trim()) === itemId)
    .map(buildLotFromSubitem);
  return {
    id: `kf-${itemId}`,
    orderNumber,
    name,
    startDate,
    lots,
    color: colorForKissflowKey(itemId),
    kissflowId: itemId,
    assignee: (item.assignee ?? "").trim() || undefined,
    priority: (item.priority ?? "").trim() || undefined,
    kissflowStatus: (item.status ?? "").trim() || undefined,
    requester: (item.requester ?? "").trim() || undefined,
  };
}

/**
 * Upsert NON distruttivo di una commessa Kissflow: aggiorna i campi importati
 * senza toccare lotti o fasi aggiunti a mano (un lotto Kissflow già presente
 * mantiene le sue fasi; un lotto manuale, senza kissflowId corrispondente,
 * resta invariato). Permette la modifica manuale anche dopo un'importazione.
 */
export function upsertKissflowOrder(orders: Order[], desired: Order): Order[] {
  const idx = orders.findIndex(o => o.id === desired.id);
  if (idx === -1) return [...orders, desired];
  const existing = orders[idx];
  const existingLots = existing.lots ?? [];
  const desiredLotIds = new Set(desired.lots.map(l => l.id));
  const mergedLots = [
    ...existingLots.filter(l => !desiredLotIds.has(l.id)),
    ...desired.lots.map(dl => {
      const cur = existingLots.find(l => l.id === dl.id);
      return cur ? { ...cur, ...dl, parts: cur.parts } : dl;
    }),
  ];
  const merged: Order = { ...existing, ...desired, lots: mergedLots };
  return orders.map((o, i) => (i === idx ? merged : o));
}

export interface KissflowPreviewRow {
  action: "crea" | "aggiorna";
  order: Order;
  lotCount: number;
  errors: string[];
}
export interface KissflowPreview {
  rows: KissflowPreviewRow[];
  errorCount: number;
}

export function buildKissflowPreview(
  itemRows: KissflowItemRow[],
  subitemRows: KissflowSubitemRow[],
  existingOrders: Order[],
): KissflowPreview {
  const rows: KissflowPreviewRow[] = itemRows.map(item => {
    const errors: string[] = [];
    if (!(item.item_id ?? "").trim()) errors.push('Colonna "Item Id" mancante');
    if (!(item.title ?? "").trim()) errors.push('Colonna "Title" mancante');
    const order = buildOrderFromKissflow(item, subitemRows);
    const action: KissflowPreviewRow["action"] = existingOrders.some(o => o.id === order.id) ? "aggiorna" : "crea";
    return { action, order, lotCount: order.lots.length, errors };
  });
  return { rows, errorCount: rows.filter(r => r.errors.length > 0).length };
}

export function applyKissflowImport(
  preview: KissflowPreview,
  orders: Order[],
  setOrders: (o: Order[]) => void,
): { created: number; updated: number } {
  let created = 0, updated = 0;
  let next = orders;
  for (const row of preview.rows) {
    if (row.errors.length > 0) continue;
    if (row.action === "crea") created++; else updated++;
    next = upsertKissflowOrder(next, row.order);
  }
  setOrders(next);
  return { created, updated };
}
