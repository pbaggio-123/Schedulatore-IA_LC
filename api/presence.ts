import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { createHmac, timingSafeEqual } from "crypto";

const sql = neon(process.env.DATABASE_URL!);
const SECRET = process.env.DEMO_AUTH_SECRET || "dev-insecure-secret";

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

async function activeUsers() {
  // gli interval sono costanti: vanno inline, NON come parametri (il tag sql
  // parametrizzerebbe dentro la stringa literal rompendo la query)
  return sql`
    select name, tier, last_seen
    from presence
    where last_seen > now() - interval '30 seconds'
    order by name
  `;
}

// GET  -> { users: [{name,tier,last_seen}] } utenti attivi (ultimi 30s)
// POST -> heartbeat (richiede token); aggiorna presenza e ritorna gli attivi
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const bearer = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null;
      if (!verifyToken(bearer)) return res.status(401).json({ error: "Token mancante o non valido" });
      return res.status(200).json({ users: await activeUsers() });
    }

    if (req.method === "POST") {
      const bearer = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null;
      const claims = verifyToken(bearer);
      if (!claims) return res.status(401).json({ error: "Token mancante o non valido" });

      await sql`
        insert into presence (name, tier, last_seen)
        values (${claims.name}, ${claims.tier}, now())
        on conflict (name) do update set tier = excluded.tier, last_seen = now()
      `;
      // pulizia opportunistica dei fantasmi
      await sql`delete from presence where last_seen < now() - interval '10 minutes'`;
      return res.status(200).json({ users: await activeUsers() });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: any) {
    console.error("[/api/presence] error:", err);
    return res.status(500).json({ error: "Errore interno" });
  }
}
