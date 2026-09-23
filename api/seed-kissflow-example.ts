import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "crypto";

// Endpoint temporaneo: inserisce nella commessa live il primo esempio
// Kissflow fornito dal cliente (item.csv + subitem.csv). Da rimuovere dopo
// il primo utilizzo (vedi api/kissflow.ts per l'endpoint permanente).

const sql = neon(process.env.DATABASE_URL!);
const SECRET = process.env.DEMO_AUTH_SECRET || "dev-insecure-secret";
const DOC_ID = "default";

function authorized(req: VercelRequest): boolean {
  const provided = typeof req.query.key === "string" ? req.query.key : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ITEMS = [
  {
    item_id: "UT-0839",
    title: "25214 C.M.B.  FONDAZIONE ENTE AUTONOMO FIERA INTERNAZIONALE DI MILANO - VIA GATTAMELATA, 5 - MILANO",
    assignee: "Filippo Frattin",
    priority: "Low",
    status: "GRAZIA",
    requester: "Alessandro Fabris",
    created_at: "2026-06-10T06:56:01Z",
  },
];
const SUBITEMS = [
  { item_id: "UT-0839-07", subitem_state: "In corso",     subitem_title: "252140A2 - 653 - PMU CW09" },
  { item_id: "UT-0839-06", subitem_state: "In progress",  subitem_title: "252140S1 - 631 - SOTTOSTRUTTURA DW23 (SUD-EST)", due_date: "2026-10-27T17:01:00+01:00 Europe/Rome" },
  { item_id: "UT-0839-05", subitem_state: "In attesa",    subitem_title: "252140A1 - 506 - TEST ACQUA GRIGLIE CW22" },
  { item_id: "UT-0839-04", subitem_state: "In attesa",    subitem_title: "252140B0 - 488 - VMU FACCIATA CW01 UFFICI", due_date: "2026-09-15T16:10:00+02:00 Europe/Rome" },
  { item_id: "UT-0839-03", subitem_state: "In attesa",    subitem_title: "252140B0 - 513 - STAFFE E STAMPATI VMU FACCIATA CW01 UFFICI ", due_date: "2026-09-15T14:57:00+02:00 Europe/Rome" },
  { item_id: "UT-0839-02", subitem_state: "Non iniziato", subitem_title: "252140C1 - XXX - APRIBILI CWP05 PRIMA PARTE (200pz.)" },
  { item_id: "UT-0839-01", subitem_state: "In attesa",    subitem_title: "252140A0 - 450 - MOCK UP DW23 CW09", due_date: "2026-07-13T12:25:00+02:00 Europe/Rome" },
];

const GANTT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
function colorForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return GANTT_COLORS[h % GANTT_COLORS.length];
}
function splitTitle(title: string): { orderNumber: string; name: string } {
  const trimmed = title.trim();
  const m = trimmed.match(/^(\S+)\s+(.*)$/);
  if (m && m[2]) return { orderNumber: m[1], name: m[2] };
  return { orderNumber: trimmed, name: trimmed };
}
function parentItemId(subitemId: string): string {
  return subitemId.replace(/-\d+$/, "");
}
function toDateOnly(s: any): string {
  return String(s ?? "").trim().slice(0, 10);
}
function buildLot(row: Record<string, any>): any {
  const subId = String(row.item_id ?? "").trim();
  return {
    id: `kf-${subId}`,
    name: String(row.subitem_title ?? "").trim(),
    parts: [],
    kissflowId: subId,
    externalStatus: String(row.subitem_state ?? "").trim() || undefined,
    dueDate: toDateOnly(row.due_date) || undefined,
  };
}
function buildOrder(item: Record<string, any>, subitems: Record<string, any>[]): any {
  const itemId = String(item.item_id ?? "").trim();
  const { orderNumber, name } = splitTitle(String(item.title ?? "") || itemId);
  const startDate =
    toDateOnly(item.start_date) || toDateOnly(item.created_at) || new Date().toISOString().slice(0, 10);
  const lots = subitems.filter((s) => parentItemId(String(s.item_id ?? "").trim()) === itemId).map(buildLot);
  return {
    id: `kf-${itemId}`,
    orderNumber, name, startDate, lots,
    color: colorForKey(itemId),
    kissflowId: itemId,
    assignee: String(item.assignee ?? "").trim() || undefined,
    priority: String(item.priority ?? "").trim() || undefined,
    kissflowStatus: String(item.status ?? "").trim() || undefined,
    requester: String(item.requester ?? "").trim() || undefined,
  };
}
function upsertOrder(orders: any[], desired: any): any[] {
  const idx = orders.findIndex((o) => o.id === desired.id);
  if (idx === -1) return [...orders, desired];
  const existing = orders[idx];
  const existingLots = Array.isArray(existing.lots) ? existing.lots : [];
  const desiredLotIds = new Set(desired.lots.map((l: any) => l.id));
  const mergedLots = [
    ...existingLots.filter((l: any) => !desiredLotIds.has(l.id)),
    ...desired.lots.map((dl: any) => {
      const cur = existingLots.find((l: any) => l.id === dl.id);
      return cur ? { ...cur, ...dl, parts: cur.parts } : dl;
    }),
  ];
  return orders.map((o, i) => (i === idx ? { ...existing, ...desired, lots: mergedLots } : o));
}

type NestSchema = { [k: string]: NestSchema };
const ORDERS_SCHEMA: NestSchema = { lots: { parts: {} } };
function diffRecord(base: any, local: any, schema: NestSchema): any {
  const childFields = Object.keys(schema);
  const fields: Record<string, unknown> = {};
  const scalarKeys = new Set<string>([...Object.keys(base ?? {}), ...Object.keys(local ?? {})]);
  for (const f of childFields) scalarKeys.delete(f);
  for (const k of scalarKeys) {
    if (JSON.stringify(base?.[k]) !== JSON.stringify(local?.[k])) fields[k] = local?.[k];
  }
  const children: Record<string, any> = {};
  for (const cf of childFields) {
    const node = diffArray(base?.[cf], local?.[cf], schema[cf]);
    if (node) children[cf] = node;
  }
  const out: any = {};
  if (Object.keys(fields).length) out.fields = fields;
  if (Object.keys(children).length) out.children = children;
  return out.fields || out.children ? out : null;
}
function diffArray(base: unknown, local: unknown, schema: NestSchema): any {
  const bArr = Array.isArray(base) ? (base as any[]) : [];
  const lArr = Array.isArray(local) ? (local as any[]) : [];
  const bMap = new Map(bArr.map((r) => [r?.id, r]));
  const upserts: any[] = [];
  for (const rec of lArr) {
    if (rec?.id == null) continue;
    if (!bMap.has(rec.id)) upserts.push({ id: rec.id, full: rec });
    else {
      const p = diffRecord(bMap.get(rec.id), rec, schema);
      if (p) upserts.push({ id: rec.id, ...p });
    }
  }
  const lIds = new Set(lArr.map((r) => r?.id));
  const deletes = bArr.map((r) => r?.id).filter((id) => id != null && !lIds.has(id));
  if (!upserts.length && !deletes.length) return null;
  return { upserts, deletes };
}
function applyMergeNode(base: any, node: any, schema: NestSchema): any[] {
  const arr = Array.isArray(base) ? base.slice() : [];
  const idx = new Map<unknown, number>();
  arr.forEach((r, i) => idx.set(r?.id, i));
  if (Array.isArray(node?.upserts)) {
    for (const u of node.upserts) {
      if (!u || u.id == null) continue;
      if (u.full !== undefined) {
        if (idx.has(u.id)) arr[idx.get(u.id)!] = u.full;
        else idx.set(u.id, arr.push(u.full) - 1);
        continue;
      }
      const cur = idx.has(u.id) ? { ...arr[idx.get(u.id)!] } : { id: u.id };
      if (u.fields && typeof u.fields === "object") Object.assign(cur, u.fields);
      if (u.children && typeof u.children === "object") {
        for (const [cf, childNode] of Object.entries(u.children)) {
          cur[cf] = applyMergeNode(cur[cf], childNode, schema[cf] ?? {});
        }
      }
      if (idx.has(u.id)) arr[idx.get(u.id)!] = cur;
      else idx.set(u.id, arr.push(cur) - 1);
    }
  }
  if (Array.isArray(node?.deletes) && node.deletes.length > 0) {
    const del = new Set(node.deletes);
    return arr.filter((r) => !del.has(r?.id));
  }
  return arr;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const cur = await sql`select doc, rev from scheduler_state where id = ${DOC_ID}`;
      const curDoc: Record<string, any> =
        cur.length > 0 && cur[0].doc && typeof cur[0].doc === "object" ? cur[0].doc : {};
      const curRev = cur.length > 0 ? Number(cur[0].rev) : 0;
      const baseOrders: any[] = Array.isArray(curDoc.scheduler_orders_ialc) ? curDoc.scheduler_orders_ialc : [];

      let localOrders = baseOrders;
      for (const item of ITEMS) localOrders = upsertOrder(localOrders, buildOrder(item, SUBITEMS));

      const ordersNode = diffArray(baseOrders, localOrders, ORDERS_SCHEMA);
      if (!ordersNode) return res.status(200).json({ ok: true, message: "Già presente, nessuna modifica" });
      const mergedOrders = applyMergeNode(baseOrders, ordersNode, ORDERS_SCHEMA);
      const mergedDoc = { ...curDoc, scheduler_orders_ialc: mergedOrders };

      if (cur.length === 0) {
        const ins = await sql`
          insert into scheduler_state (id, doc, rev, updated_by, updated_at)
          values (${DOC_ID}, ${JSON.stringify(mergedDoc)}::jsonb, 1, 'Kissflow (esempio)', now())
          on conflict (id) do nothing
          returning rev
        `;
        if (ins.length > 0) return res.status(200).json({ ok: true });
        continue;
      }
      const upd = await sql`
        update scheduler_state
          set doc = ${JSON.stringify(mergedDoc)}::jsonb, rev = rev + 1, updated_by = 'Kissflow (esempio)', updated_at = now()
        where id = ${DOC_ID} and rev = ${curRev}
        returning rev
      `;
      if (upd.length > 0) return res.status(200).json({ ok: true });
    }
    return res.status(503).json({ error: "Contesa elevata: riprova" });
  } catch (err: any) {
    console.error("[/api/seed-kissflow-example] error:", err);
    return res.status(500).json({ error: "Errore interno", detail: String(err?.message ?? err) });
  }
}
