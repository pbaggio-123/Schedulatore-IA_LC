import { useEffect, useState } from "react";

interface PresenceUser {
  name: string;
  tier: number;
}

const HEARTBEAT_MS = 10000;

function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const TIER_COLOR: Record<number, string> = {
  1: "bg-slate-500",
  2: "bg-blue-500",
  3: "bg-emerald-500",
  4: "bg-amber-500",
};

/** Mostra gli utenti attivi (heartbeat ~10s su /api/presence). */
export function PresenceIndicator() {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function beat() {
      const token = window.localStorage.getItem("scheduler_token");
      if (!token) {
        setUsers([]); // presenza protetta: senza login niente lista
        return;
      }
      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUsers(Array.isArray(data.users) ? data.users : []);
      } catch {
        /* offline */
      }
    }

    beat();
    const iv = setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  if (users.length === 0) return null;

  return (
    <div
      className="px-3 py-2 border-t border-border flex items-center gap-2"
      title={`Online: ${users.map((u) => u.name).join(", ")}`}
      data-testid="presence-indicator"
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
        Online {users.length}
      </span>
      <div className="flex -space-x-1.5 overflow-hidden">
        {users.slice(0, 6).map((u) => (
          <div
            key={u.name}
            className={`w-5 h-5 rounded-full ${TIER_COLOR[u.tier] ?? "bg-slate-500"} text-white text-[9px] font-bold flex items-center justify-center ring-1 ring-background`}
            title={u.name}
          >
            {initials(u.name)}
          </div>
        ))}
      </div>
    </div>
  );
}
