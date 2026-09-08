import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { createHmac, timingSafeEqual } from "crypto";

const sql = neon(process.env.DATABASE_URL!);
const SECRET = process.env.DEMO_AUTH_SECRET || "dev-insecure-secret";
const MAX_LIMIT = 2000;

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

function tokenFrom(req: VercelRequest) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  return verifyToken(bearer);
}

// GET    -> { entries: AuditEntry[] } (più recenti, jsonb originale)
// POST   -> append una entry (token tier>=2)
// DELETE -> svuota il registro (token tier>=4)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      if (!tokenFrom(req)) return res.status(401).json({ error: "Token mancante o non valido" });
      const limit = Math.min(Number(req.query.limit) || 500, MAX_LIMIT);
      const rows = await sql`select entry from audit order by ts desc limit ${limit}`;
      return res.status(200).json({ entries: rows.map((r: any) => r.entry) });
    }

    if (req.method === "POST") {
      const claims = tokenFrom(req);
      if (!claims) return res.status(401).json({ error: "Token mancante o non valido" });
      if (claims.tier < 2) return res.status(403).json({ error: "Permessi insufficienti" });

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const entry = body?.entry;
      if (!entry || typeof entry !== "object" || !entry.id) {
        return res.status(400).json({ error: "entry mancante o non valida" });
      }
      // l'autore è sempre quello del token (non ci fidiamo del body)
      const merged = { ...entry, user: claims.name };
      const ts = typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString();
      await sql`
        insert into audit (id, ts, username, entry)
        values (${entry.id}, ${ts}, ${claims.name}, ${JSON.stringify(merged)}::jsonb)
        on conflict (id) do nothing
      `;
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const claims = tokenFrom(req);
      if (!claims) return res.status(401).json({ error: "Token mancante o non valido" });
      if (claims.tier < 4) return res.status(403).json({ error: "Solo amministratore" });
      await sql`delete from audit`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: any) {
    console.error("[/api/audit] error:", err);
    return res.status(500).json({ error: "Errore interno" });
  }
}
