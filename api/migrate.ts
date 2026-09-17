import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "crypto";

// Endpoint temporaneo per creare lo schema iniziale su un database Neon nuovo
// (vedi CLAUDE.md §5.1). Da rimuovere dopo il primo deploy su un progetto.

const sql = neon(process.env.DATABASE_URL!);
const SECRET = process.env.DEMO_AUTH_SECRET || "dev-insecure-secret";

function authorized(req: VercelRequest): boolean {
  const header = req.headers.authorization || "";
  const expected = `Bearer ${SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    await sql`
      create table if not exists scheduler_state (
        id         text        not null,
        doc        jsonb       not null,
        rev        bigint      not null default 1,
        updated_by text,
        updated_at timestamptz not null default now(),
        constraint scheduler_state_pkey primary key (id)
      )
    `;
    await sql`
      create table if not exists presence (
        name      text        not null,
        tier      integer     not null default 1,
        last_seen timestamptz not null default now(),
        constraint presence_pkey primary key (name)
      )
    `;
    await sql`
      create table if not exists audit (
        id       text        not null,
        ts       timestamptz not null default now(),
        username text,
        entry    jsonb       not null,
        constraint audit_pkey primary key (id)
      )
    `;
    await sql`create index if not exists audit_ts_idx on audit (ts desc)`;
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[/api/migrate] error:", err);
    return res.status(500).json({ error: "Errore interno" });
  }
}
