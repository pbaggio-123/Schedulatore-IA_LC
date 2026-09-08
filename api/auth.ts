import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";

// Token HMAC firmato lato server (zero dipendenze, zero costi). Codice inline:
// gli import relativi fuori da /api non vengono tracciati nel bundle in questo
// monorepo con outputDirectory custom, quindi auth + verifica stanno nei file.

const SECRET = process.env.DEMO_AUTH_SECRET || "dev-insecure-secret";
// 30 giorni: il token a 12h scadeva durante l'uso (o dopo un reload) e mandava il
// client offline in silenzio, lasciando le modifiche solo in locale (non condivise).
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 giorni

interface ServerAccount {
  id: string;
  username: string;
  password: string;
  displayName: string;
  tier: number;
}

const DEMO_ACCOUNTS: ServerAccount[] = [
  { id: "u1", username: "demo-viewer", password: "demo-viewer", displayName: "Vera Visiona (demo)", tier: 1 },
  { id: "u2", username: "demo-operatore", password: "demo-operatore", displayName: "Oreste Operai (demo)", tier: 2 },
  { id: "u3", username: "demo-planner", password: "demo-planner", displayName: "Pia Pianifica (demo)", tier: 3 },
  { id: "u4", username: "demo-admin", password: "demo-admin", displayName: "Ada Amministra (demo)", tier: 4 },
];

function signToken(p: { sub: string; tier: number; name: string; exp: number }): string {
  const payload = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

// POST { username, password } -> { token, tier, name }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const username = body?.username;
    const password = body?.password;
    const acc = DEMO_ACCOUNTS.find((a) => a.username === username && a.password === password);
    if (!acc) return res.status(401).json({ error: "Credenziali non valide" });

    const token = signToken({
      sub: acc.id,
      tier: acc.tier,
      name: acc.displayName,
      exp: Date.now() + TOKEN_TTL_MS,
    });
    return res.status(200).json({ token, tier: acc.tier, name: acc.displayName });
  } catch (err: any) {
    console.error("[/api/auth] error:", err);
    return res.status(500).json({ error: "Errore interno" });
  }
}
