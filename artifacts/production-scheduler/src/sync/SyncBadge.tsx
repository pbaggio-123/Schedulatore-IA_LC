import { Cloud, CloudOff, RefreshCw, Check } from "lucide-react";
import { useSyncState } from "./SyncProvider";

const CONFIG = {
  idle: { icon: Cloud, label: "Connessione…", cls: "text-muted-foreground", spin: false },
  saving: { icon: RefreshCw, label: "Salvataggio…", cls: "text-amber-500", spin: true },
  synced: { icon: Check, label: "Sincronizzato", cls: "text-green-500", spin: false },
  offline: { icon: CloudOff, label: "Offline", cls: "text-red-500", spin: false },
} as const;

function relTime(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 10) return "ora";
  if (sec < 60) return `${sec}s fa`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m fa`;
  const h = Math.round(min / 60);
  return `${h}h fa`;
}

export function SyncBadge() {
  const { status, lastUpdatedBy, lastUpdatedAt } = useSyncState();
  const cfg = CONFIG[status];
  const Icon = cfg.icon;

  const title =
    lastUpdatedBy && lastUpdatedAt
      ? `Ultima modifica: ${lastUpdatedBy} · ${relTime(lastUpdatedAt)}`
      : "Stato sincronizzazione cloud";

  return (
    <div
      className="px-3 py-2 border-t border-border flex items-center gap-2 text-[10px] uppercase tracking-wider"
      title={title}
      data-testid="sync-badge"
    >
      <Icon size={13} className={`${cfg.cls} ${cfg.spin ? "animate-spin" : ""} shrink-0`} />
      <span className={cfg.cls}>{cfg.label}</span>
      {lastUpdatedBy && status === "synced" && (
        <span className="text-muted-foreground truncate">· {lastUpdatedBy}</span>
      )}
    </div>
  );
}
