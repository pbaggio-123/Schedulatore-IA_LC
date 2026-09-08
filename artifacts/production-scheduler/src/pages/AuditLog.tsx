import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useAuth } from "@/hooks/useAuth";
import { AuditEntry, AuditActionType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, Trash2, User, ChevronLeft, ChevronRight, FilterX } from "lucide-react";

// ── Labels & colours for each action type ─────────────────────────────────────

const ACTION_LABELS: Record<AuditActionType, string> = {
  creazione:       "Creazione",
  modifica:        "Modifica",
  cancellazione:   "Cancellazione",
  cambio_stato:    "Cambio Stato",
  cambio_personale:"Cambio Personale",
  cambio_linea:    "Cambio Linea",
  cambio_data:     "Cambio Data",
};

const ACTION_COLORS: Record<AuditActionType, string> = {
  creazione:        "bg-green-500/20 text-green-400",
  modifica:         "bg-blue-500/20 text-blue-400",
  cancellazione:    "bg-red-500/20 text-red-400",
  cambio_stato:     "bg-orange-500/20 text-orange-400",
  cambio_personale: "bg-purple-500/20 text-purple-400",
  cambio_linea:     "bg-cyan-500/20 text-cyan-400",
  cambio_data:      "bg-amber-500/20 text-amber-400",
};

const PAGE_SIZES = [25, 50, 100];

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return ts;
  }
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AuditLog() {
  const { entries, clearAll, currentUser } = useAuditLog();
  const { user, can } = useAuth();

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [filterUser,     setFilterUser]     = useState("all");
  const [filterAction,   setFilterAction]   = useState<AuditActionType | "all">("all");
  const [filterSearch,   setFilterSearch]   = useState("");
  const [pageSize,       setPageSize]       = useState(25);
  const [page,           setPage]           = useState(1);
  const [confirmClear,   setConfirmClear]   = useState(false);

  const uniqueUsers = useMemo(
    () => Array.from(new Set(entries.map(e => e.user))).sort(),
    [entries],
  );

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterUser !== "all" && e.user !== filterUser) return false;
      if (filterAction !== "all" && e.actionType !== filterAction) return false;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const ref = [e.orderNumber, e.lotName, e.partName, e.orderId]
          .filter(Boolean).join(" ").toLowerCase();
        if (!ref.includes(q) && !e.field?.toLowerCase().includes(q)) return false;
      }
      const day = e.timestamp.slice(0, 10);
      if (filterDateFrom && day < filterDateFrom) return false;
      if (filterDateTo   && day > filterDateTo)   return false;
      return true;
    });
  }, [entries, filterUser, filterAction, filterSearch, filterDateFrom, filterDateTo]);

  const totalPages   = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage  = Math.min(page, totalPages);
  const paginated    = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resetPage = () => setPage(1);
  const hasFilters =
    filterDateFrom || filterDateTo || filterUser !== "all" ||
    filterAction !== "all" || filterSearch;

  return (
    <Layout>
      <div className="p-6 flex flex-col gap-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <History size={22} className="text-primary" />
            <h2 className="text-2xl font-bold uppercase tracking-tight text-primary">
              Registro Modifiche
            </h2>
            <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
              {entries.length} eventi totali
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Utente corrente (dal login) */}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded px-2 py-1">
              <User size={12} />
              <span>{user?.displayName ?? currentUser}</span>
            </span>

            {/* Clear all — solo Amministratore */}
            {can("clearAudit") && (!confirmClear ? (
              <Button
                variant="ghost" size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirmClear(true)}
                disabled={entries.length === 0}
              >
                <Trash2 size={12} className="mr-1" /> Cancella tutto
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-destructive">Sicuro?</span>
                <Button size="sm" variant="destructive" className="h-6 text-xs px-2"
                  onClick={() => { clearAll(); setConfirmClear(false); }}>Sì</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                  onClick={() => setConfirmClear(false)}>No</Button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="bg-card border border-card-border rounded p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Da data</Label>
            <Input type="date" value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); resetPage(); }}
              className="h-8 w-36 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">A data</Label>
            <Input type="date" value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); resetPage(); }}
              className="h-8 w-36 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Utente</Label>
            <Select value={filterUser} onValueChange={v => { setFilterUser(v); resetPage(); }}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli utenti</SelectItem>
                {uniqueUsers.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Tipo Azione</Label>
            <Select
              value={filterAction}
              onValueChange={v => { setFilterAction(v as AuditActionType | "all"); resetPage(); }}
            >
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le azioni</SelectItem>
                {(Object.keys(ACTION_LABELS) as AuditActionType[]).map(k => (
                  <SelectItem key={k} value={k}>{ACTION_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <Label className="text-xs">Cerca Commessa / Lotto / Fase</Label>
            <Input
              value={filterSearch}
              onChange={e => { setFilterSearch(e.target.value); resetPage(); }}
              placeholder="N. commessa, lotto, fase…"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Righe / pagina</Label>
            <Select
              value={String(pageSize)}
              onValueChange={v => { setPageSize(Number(v)); resetPage(); }}
            >
              <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <Button
              variant="ghost" size="sm" className="h-8 text-xs self-end gap-1"
              onClick={() => {
                setFilterDateFrom(""); setFilterDateTo("");
                setFilterUser("all"); setFilterAction("all");
                setFilterSearch(""); resetPage();
              }}
            >
              <FilterX size={12} /> Azzera filtri
            </Button>
          )}
        </div>

        {/* ── Results summary ─────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>
              {filtered.length} risultati
              {filtered.length !== entries.length ? ` (su ${entries.length} totali)` : ""}
            </span>
            {filtered.length > 0 && (
              <span>
                Pagina {currentPage} di {totalPages} —
                righe {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)}
              </span>
            )}
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="bg-card border border-card-border rounded overflow-hidden overflow-x-auto">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <History size={44} className="mb-4 opacity-20" />
              <p className="text-sm italic">Nessun evento registrato.</p>
              <p className="text-xs mt-1 opacity-50">
                Ogni modifica al piano di produzione comparirà qui in automatico.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
              <FilterX size={32} className="mb-3 opacity-30" />
              <p className="text-sm italic">Nessun risultato con i filtri applicati.</p>
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-muted text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">Data e Ora</th>
                  <th className="px-3 py-3">Utente</th>
                  <th className="px-3 py-3">ID Ordine / Lotto</th>
                  <th className="px-3 py-3">Tipo Azione</th>
                  <th className="px-3 py-3">Campo</th>
                  <th className="px-3 py-3">Valore Precedente</th>
                  <th className="px-3 py-3">Nuovo Valore</th>
                  <th className="px-3 py-3">Note / Motivazione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map(entry => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {filtered.length > pageSize && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPage={setPage}
          />
        )}
      </div>
    </Layout>
  );
}

// ── Row sub-component ──────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2.5 font-mono whitespace-nowrap text-muted-foreground">
        {formatTimestamp(entry.timestamp)}
      </td>
      <td className="px-3 py-2.5 font-bold whitespace-nowrap">{entry.user}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          {entry.orderNumber && (
            <span className="font-mono text-primary">{entry.orderNumber}</span>
          )}
          {entry.lotName && (
            <span className="text-muted-foreground">{entry.lotName}</span>
          )}
          {entry.partName && (
            <span className="text-muted-foreground/60 italic">{entry.partName}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`px-2 py-0.5 rounded uppercase text-[10px] tracking-wider font-bold whitespace-nowrap ${ACTION_COLORS[entry.actionType]}`}
        >
          {ACTION_LABELS[entry.actionType]}
        </span>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{entry.field ?? "—"}</td>
      <td className="px-3 py-2.5 max-w-[130px]">
        <TruncCell value={entry.previousValue} />
      </td>
      <td className="px-3 py-2.5 max-w-[130px]">
        <TruncCell value={entry.newValue} />
      </td>
      <td className="px-3 py-2.5 max-w-[160px] text-muted-foreground">
        <TruncCell value={entry.notes} />
      </td>
    </tr>
  );
}

function TruncCell({ value }: { value?: string }) {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className="block truncate" title={value}>
      {value}
    </span>
  );
}

// ── Pagination sub-component ───────────────────────────────────────────────────

function Pagination({
  currentPage,
  totalPages,
  onPage,
}: {
  currentPage: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => startPage + i).filter(p => p <= totalPages);

  return (
    <div className="flex items-center justify-center gap-1">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-xs font-bold"
        disabled={currentPage === 1} onClick={() => onPage(1)}>«</Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
        disabled={currentPage === 1} onClick={() => onPage(currentPage - 1)}>
        <ChevronLeft size={14} />
      </Button>
      {visiblePages.map(p => (
        <Button
          key={p}
          variant={p === currentPage ? "default" : "ghost"}
          size="sm"
          className="h-7 w-7 p-0 text-xs"
          onClick={() => onPage(p)}
        >
          {p}
        </Button>
      ))}
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
        disabled={currentPage === totalPages} onClick={() => onPage(currentPage + 1)}>
        <ChevronRight size={14} />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-xs font-bold"
        disabled={currentPage === totalPages} onClick={() => onPage(totalPages)}>»</Button>
    </div>
  );
}
