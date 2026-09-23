import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { createHmac, timingSafeEqual } from "crypto";

// Stato condiviso della demo: documento singolo (id) con le chiavi scheduler_*.
// Modello last-write-wins; `rev` serve solo a sopprimere l'eco del proprio push
// lato client (non rifiutiamo scritture concorrenti — è una demo).

const sql = neon(process.env.DATABASE_URL!);
const SECRET = process.env.DEMO_AUTH_SECRET || "dev-insecure-secret";

// Verifica del token HMAC rilasciato da /api/auth (inline: vedi nota in auth.ts).
function verifyToken(token: string | null): { sub: string; tier: number; name: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

// Schema di nesting (deve combaciare con quello del client): per ogni chiave,
// quali campi sono array figli di record con `id` da fondere ricorsivamente.
type NestSchema = { [childField: string]: NestSchema };
const MERGE_SCHEMA: Record<string, NestSchema> = {
  scheduler_orders_ialc: { lots: { parts: {} } },
  scheduler_employees_ialc: {},
  scheduler_holidays: {},
  scheduler_catalog_phases_ialc: {},
  scheduler_catalog_products_ialc: {},
  scheduler_shifts_ialc: {},
  scheduler_afan_ialc: {},
};

// Applica un MergeNode (upsert/delete per id, con patch ricorsivo) su un array.
function applyMergeNode(base: any, node: any, schema: NestSchema): any[] {
  const arr = Array.isArray(base) ? base.slice() : [];
  const idx = new Map<unknown, number>();
  arr.forEach((r, i) => idx.set(r?.id, i));
  if (Array.isArray(node?.upserts)) {
    for (const u of node.upserts) {
      if (!u || u.id == null) continue;
      if (u.full !== undefined) {
        // Record nuovo (o sostituzione intera).
        if (idx.has(u.id)) arr[idx.get(u.id)!] = u.full;
        else idx.set(u.id, arr.push(u.full) - 1);
        continue;
      }
      // Patch su record esistente (o ricreazione se sparito sul server).
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

// Applica un delta sopra un documento. Per ogni chiave: `replace` sostituisce il
// valore intero; `patch` fa merge ricorsivo per id (vedi MERGE_SCHEMA); `merge`
// è il vecchio formato (upsert di record interi per id) tenuto per retrocompat.
function applyDelta(
  doc: Record<string, any>,
  delta: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...doc };
  for (const [key, d] of Object.entries(delta)) {
    if (!d || typeof d !== "object") continue;
    if (d.op === "replace") {
      out[key] = d.value;
    } else if (d.op === "patch") {
      out[key] = applyMergeNode(out[key], d, MERGE_SCHEMA[key] ?? {});
    } else if (d.op === "merge") {
      // Legacy: upsert di record interi per id.
      const arr = Array.isArray(out[key]) ? (out[key] as any[]).slice() : [];
      const idx = new Map<unknown, number>();
      arr.forEach((r, i) => idx.set(r?.id, i));
      if (Array.isArray(d.upserts)) {
        for (const rec of d.upserts) {
          if (!rec || rec.id == null) continue;
          if (idx.has(rec.id)) arr[idx.get(rec.id)!] = rec;
          else idx.set(rec.id, arr.push(rec) - 1);
        }
      }
      let result = arr;
      if (Array.isArray(d.deletes) && d.deletes.length > 0) {
        const del = new Set(d.deletes);
        result = arr.filter((r) => !del.has(r?.id));
      }
      out[key] = result;
    }
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = String(req.query.id ?? (req.body && req.body.id) ?? "default");

    // Tutte le operazioni richiedono un login demo valido (anche la lettura):
    // nulla è visibile senza token.
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;
    const claims = verifyToken(bearer);
    if (!claims) {
      return res.status(401).json({ error: "Token mancante o non valido" });
    }

    if (req.method === "GET") {
      const rows = await sql`
        select doc, rev, updated_by, updated_at
        from scheduler_state where id = ${id}
      `;
      if (rows.length === 0) {
        return res.status(200).json({ rev: 0, doc: null, updatedBy: null, updatedAt: null });
      }
      const r = rows[0];
      return res.status(200).json({
        rev: Number(r.rev),
        doc: r.doc,
        updatedBy: r.updated_by,
        updatedAt: r.updated_at,
      });
    }

    if (req.method === "POST") {
      // Scrittura: viewer (tier 1) = sola lettura. updated_by dal token.
      if (claims.tier < 2) {
        return res.status(403).json({ error: "Permessi insufficienti (sola lettura)" });
      }

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const updatedBy = claims.name;

      // ── Modalità DELTA (merge per-record) ──────────────────────────────────
      // Il client invia solo ciò che ha cambiato: per ogni chiave-array di
      // record con `id`, un set di upsert (id→record) e delete (id). Il server
      // li applica SOPRA lo stato corrente, così modifiche a record diversi
      // (commesse/dipendenti/fasi diverse) di utenti diversi NON collidono.
      // Conflitto solo sullo stesso identico record (ultimo upsert vince).
      if (body?.delta && typeof body.delta === "object") {
        const delta = body.delta as Record<string, any>;
        if (Object.keys(delta).length === 0) {
          return res.status(400).json({ error: "delta vuoto: scrittura ignorata" });
        }
        // Loop ottimistico: leggi rev+doc, fondi, scrivi SOLO se rev invariata;
        // se un'altra invocazione ha scritto nel frattempo, ritenta sulla nuova.
        for (let attempt = 0; attempt < 6; attempt++) {
          const cur = await sql`select doc, rev from scheduler_state where id = ${id}`;
          const curDoc: Record<string, any> =
            cur.length > 0 && cur[0].doc && typeof cur[0].doc === "object" ? cur[0].doc : {};
          const curRev = cur.length > 0 ? Number(cur[0].rev) : 0;
          const merged = applyDelta(curDoc, delta);
          if (Object.keys(merged).length === 0) {
            return res.status(400).json({ error: "merge vuoto: scrittura ignorata" });
          }
          if (cur.length === 0) {
            // Prima scrittura: inserisci. Se un'altra ha inserito nel frattempo,
            // on conflict do nothing → rows vuote → ritenta sul ramo update.
            const ins = await sql`
              insert into scheduler_state (id, doc, rev, updated_by, updated_at)
              values (${id}, ${JSON.stringify(merged)}::jsonb, 1, ${updatedBy}, now())
              on conflict (id) do nothing
              returning rev, updated_at
            `;
            if (ins.length > 0) {
              return res.status(200).json({ rev: Number(ins[0].rev), doc: merged, updatedAt: ins[0].updated_at });
            }
            continue;
          }
          const upd = await sql`
            update scheduler_state
              set doc = ${JSON.stringify(merged)}::jsonb,
                  rev = rev + 1,
                  updated_by = ${updatedBy},
                  updated_at = now()
            where id = ${id} and rev = ${curRev}
            returning rev, updated_at
          `;
          if (upd.length > 0) {
            return res.status(200).json({ rev: Number(upd[0].rev), doc: merged, updatedAt: upd[0].updated_at });
          }
          // rev cambiata sotto di noi: ritenta sulla versione aggiornata.
        }
        return res.status(503).json({ error: "Contesa elevata: riprova" });
      }

      // ── Modalità LEGACY (documento intero, last-write-wins) ────────────────
      // Mantenuta per i client non ancora ricaricati (bundle JS vecchio).
      const doc = body?.doc;
      if (doc == null || typeof doc !== "object") {
        return res.status(400).json({ error: "doc mancante o non valido" });
      }
      // Guardia anti-wipe: non sovrascrivere mai lo stato con un bundle vuoto
      // (browser senza dati / partial). Una scrittura vuota cancellerebbe tutto.
      if (Object.keys(doc).length === 0) {
        return res.status(400).json({ error: "doc vuoto: scrittura ignorata" });
      }

      // Concorrenza ottimistica: il client dichiara la revisione su cui si basa
      // (baseRev). Scriviamo SOLO se combacia con quella sul server. Se un'altra
      // sessione ha scritto nel frattempo (rev diversa) NON sovrascriviamo e
      // torniamo 409 con lo stato corrente: così una scheda "vecchia" (o con i
      // soli dati demo) non può più cancellare dati più recenti.
      const baseRev = Number.isFinite(Number(body?.baseRev)) ? Number(body.baseRev) : 0;
      const rows = await sql`
        insert into scheduler_state (id, doc, rev, updated_by, updated_at)
        values (${id}, ${JSON.stringify(doc)}::jsonb, 1, ${updatedBy}, now())
        on conflict (id) do update
          set doc = excluded.doc,
              rev = scheduler_state.rev + 1,
              updated_by = excluded.updated_by,
              updated_at = now()
          where scheduler_state.rev = ${baseRev}
        returning rev, updated_at
      `;
      if (rows.length === 0) {
        // Conflitto di revisione: la riga esiste ma rev != baseRev → non scriviamo.
        // Restituiamo lo stato attuale così il client può riallinearsi.
        const cur = await sql`
          select doc, rev, updated_by, updated_at from scheduler_state where id = ${id}
        `;
        const r = cur[0];
        return res.status(409).json({
          error: "Conflitto di revisione",
          rev: Number(r.rev),
          doc: r.doc,
          updatedBy: r.updated_by,
          updatedAt: r.updated_at,
        });
      }
      return res.status(200).json({
        rev: Number(rows[0].rev),
        updatedAt: rows[0].updated_at,
      });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: any) {
    console.error("[/api/state] error:", err);
    return res.status(500).json({ error: "Errore interno", detail: String(err?.message ?? err) });
  }
}
