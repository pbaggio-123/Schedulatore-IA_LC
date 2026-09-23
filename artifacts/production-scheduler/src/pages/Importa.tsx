import { useRef, useState } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { addAuditEntry } from "@/hooks/useAuditLog";
import {
  ImportKind, IMPORT_FORMATS, ImportPreview,
  readImportFile, buildPreview, applyImport, ApplyResult,
} from "@/lib/importData";
import {
  KissflowPreview, buildKissflowPreview, applyKissflowImport,
} from "@/lib/kissflowImport";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, RotateCcw, Workflow } from "lucide-react";

const KINDS: ImportKind[] = ["fasi", "articoli", "matricole"];
type Mode = "cataloghi" | "kissflow";

export default function Importa() {
  const [mode, setMode] = useState<Mode>("cataloghi");
  return (
    <Layout>
      <div className="p-6 flex flex-col gap-5 max-w-5xl">
        <h2 className="text-2xl font-bold uppercase tracking-tight text-primary flex items-center gap-2">
          <FileSpreadsheet size={22} /> Importa
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setMode("cataloghi")}
            className={`px-3 py-2 rounded border text-xs uppercase tracking-wider transition-colors ${mode === "cataloghi" ? "border-primary bg-primary/15 text-primary font-bold" : "border-border hover:bg-accent/30"}`}
            data-testid="button-mode-cataloghi">
            Fasi / Articoli / Matricole
          </button>
          <button onClick={() => setMode("kissflow")}
            className={`px-3 py-2 rounded border text-xs uppercase tracking-wider transition-colors ${mode === "kissflow" ? "border-primary bg-primary/15 text-primary font-bold" : "border-border hover:bg-accent/30"}`}
            data-testid="button-mode-kissflow">
            Commesse da Kissflow
          </button>
        </div>
        {mode === "cataloghi" ? <CataloghiImport /> : <KissflowImportSection />}
      </div>
    </Layout>
  );
}

// ── Import Fasi / Articoli / Matricole (CSV/Excel, uno per volta) ──────────────

function CataloghiImport() {
  const { catalogPhases, setCatalogPhases, catalogProducts, setCatalogProducts, employees, setEmployees, skills, setSkills } = useSchedulerData();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<ImportKind>("fasi");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = () => { setPreview(null); setResult(null); setFileName(null); setParseError(null); if (fileRef.current) fileRef.current.value = ""; };

  const handleFile = async (file: File) => {
    setResult(null); setParseError(null);
    setFileName(file.name);
    try {
      const raw = await readImportFile(file);
      if (raw.length === 0) { setParseError("Il file non contiene righe dati."); setPreview(null); return; }
      setPreview(buildPreview(kind, raw, { phases: catalogPhases, products: catalogProducts, employees }));
    } catch (e) {
      setParseError(`Impossibile leggere il file: ${e instanceof Error ? e.message : String(e)}`);
      setPreview(null);
    }
  };

  const confirm = () => {
    if (!preview) return;
    const res = applyImport(preview, {
      phases: catalogPhases, setPhases: setCatalogPhases,
      products: catalogProducts, setProducts: setCatalogProducts,
      employees, setEmployees,
      skills, setSkills,
    });
    addAuditEntry({
      actionType: "creazione",
      field: `Import ${IMPORT_FORMATS[preview.kind].label}`,
      newValue: `${res.created} creati, ${res.updated} aggiornati, ${res.skipped} scartati (${fileName ?? "file"})`,
    });
    setResult(res);
    setPreview(null);
    toast({ title: "Import completato", description: `${res.created} creati, ${res.updated} aggiornati.` });
  };

  const fmt = IMPORT_FORMATS[kind];

  return (
    <div className="flex flex-col gap-5">
      {/* ── Tipo ── */}
      <div className="flex gap-2">
        {KINDS.map(k => (
          <button key={k}
            onClick={() => { setKind(k); reset(); }}
            className={`px-3 py-2 rounded border text-xs uppercase tracking-wider transition-colors ${kind === k ? "border-primary bg-primary/15 text-primary font-bold" : "border-border hover:bg-accent/30"}`}
            data-testid={`button-kind-${k}`}>
            {IMPORT_FORMATS[k].label}
          </button>
        ))}
      </div>

      {/* ── Formato atteso ── */}
      <div className="border border-border rounded p-4 bg-card flex flex-col gap-2">
        <p className="text-xs font-bold uppercase text-muted-foreground">Formato atteso — {fmt.label}</p>
        <table className="text-xs w-full">
          <thead className="text-muted-foreground uppercase text-[10px]">
            <tr><th className="text-left py-1 w-36">Colonna</th><th className="text-left py-1 w-24">Obbligatoria</th><th className="text-left py-1">Note</th></tr>
          </thead>
          <tbody>
            {fmt.columns.map(c => (
              <tr key={c.key} className="border-t border-border/50">
                <td className="py-1.5 font-mono font-bold">{c.label}</td>
                <td className="py-1.5">{c.required ? "Sì" : "No"}</td>
                <td className="py-1.5 text-muted-foreground">{c.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted-foreground">
          File <span className="font-mono">.csv</span> (separatore , o ;) oppure <span className="font-mono">.xlsx</span>. Prima riga = intestazioni.
          File di esempio nella cartella <span className="font-mono">demo-data/</span> del progetto.
        </p>
      </div>

      {/* ── Upload ── */}
      <div className="flex items-center gap-3">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          data-testid="input-import-file" />
        <Button onClick={() => fileRef.current?.click()} data-testid="button-choose-file">
          <Upload size={15} className="mr-2" /> Scegli file…
        </Button>
        {fileName && <span className="text-xs font-mono text-muted-foreground">{fileName}</span>}
        {(preview || result || parseError) && (
          <Button variant="ghost" size="sm" onClick={reset}><RotateCcw size={13} className="mr-1" /> Ricomincia</Button>
        )}
      </div>

      {parseError && (
        <div className="border border-destructive/40 bg-destructive/10 rounded p-3 text-sm text-destructive flex items-center gap-2">
          <XCircle size={15} /> {parseError}
        </div>
      )}

      {/* ── Anteprima ── */}
      {preview && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-wide">
              Anteprima — <span className="text-green-500">{preview.validCount} valide</span>
              {preview.errorCount > 0 && <span className="text-destructive"> · {preview.errorCount} con errori (scartate)</span>}
            </p>
            <Button onClick={confirm} disabled={preview.validCount === 0} data-testid="button-confirm-import">
              <CheckCircle2 size={15} className="mr-2" /> Conferma import ({preview.validCount})
            </Button>
          </div>

          <div className="border border-border rounded overflow-auto max-h-[28rem]">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left p-2 w-10">#</th>
                  <th className="text-left p-2 w-20">Azione</th>
                  {fmt.columns.map(c => <th key={c.key} className="text-left p-2">{c.label}</th>)}
                  <th className="text-left p-2">Problemi</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(r => (
                  <tr key={r.index} className={`border-t border-border/50 ${r.action === "scarta" ? "bg-destructive/10" : r.warnings.length ? "bg-amber-500/10" : ""}`}>
                    <td className="p-2 font-mono text-muted-foreground">{r.index}</td>
                    <td className="p-2">
                      <span className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-bold ${
                        r.action === "crea" ? "bg-green-500/20 text-green-500"
                        : r.action === "aggiorna" ? "bg-blue-500/20 text-blue-400"
                        : "bg-destructive/20 text-destructive"}`}>
                        {r.action}
                      </span>
                    </td>
                    {fmt.columns.map(c => <td key={c.key} className="p-2 font-mono">{r.raw[c.key] || <span className="text-muted-foreground">—</span>}</td>)}
                    <td className="p-2">
                      {r.errors.map((e, i) => <span key={i} className="flex items-center gap-1 text-destructive"><XCircle size={11} />{e}</span>)}
                      {r.warnings.map((w, i) => <span key={i} className="flex items-center gap-1 text-amber-500"><AlertTriangle size={11} />{w}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">Nessun dato viene scritto finché non confermi. Le righe "aggiorna" sovrascrivono l'elemento esistente con la stessa chiave.</p>
        </div>
      )}

      {/* ── Esito ── */}
      {result && (
        <div className="border border-green-500/40 bg-green-500/10 rounded p-4 flex flex-col gap-1 text-sm" data-testid="import-result">
          <span className="flex items-center gap-2 font-bold text-green-500"><CheckCircle2 size={16} /> Import completato</span>
          <span className="text-xs font-mono">{result.created} creati · {result.updated} aggiornati · {result.skipped} scartati</span>
          {result.newSkills.length > 0 && (
            <span className="text-xs font-mono">Nuove competenze aggiunte al catalogo: {result.newSkills.join(", ")}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Import Commesse da Kissflow (item.csv + subitem.csv) ───────────────────────
// Stesso formato dell'export CSV della board Kissflow "Programmazione Lavori
// Tecnici": un file item (commesse) + un file subitem (lotti, collegati
// all'item tramite "Item Id"). Per l'ingestione automatica via API vedi
// /api/kissflow.ts (stessa logica di mappatura, duplicata lato server).

function KissflowImportSection() {
  const { orders, setOrders } = useSchedulerData();
  const { toast } = useToast();
  const itemRef = useRef<HTMLInputElement>(null);
  const subitemRef = useRef<HTMLInputElement>(null);

  const [itemFileName, setItemFileName] = useState<string | null>(null);
  const [subitemFileName, setSubitemFileName] = useState<string | null>(null);
  const [itemRows, setItemRows] = useState<Record<string, string>[] | null>(null);
  const [subitemRows, setSubitemRows] = useState<Record<string, string>[] | null>(null);
  const [preview, setPreview] = useState<KissflowPreview | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = () => {
    setItemFileName(null); setSubitemFileName(null);
    setItemRows(null); setSubitemRows(null);
    setPreview(null); setResult(null); setParseError(null);
    if (itemRef.current) itemRef.current.value = "";
    if (subitemRef.current) subitemRef.current.value = "";
  };

  const handleItemFile = async (file: File) => {
    setResult(null); setParseError(null); setPreview(null);
    setItemFileName(file.name);
    try {
      setItemRows(await readImportFile(file));
    } catch (e) {
      setParseError(`Impossibile leggere "${file.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const handleSubitemFile = async (file: File) => {
    setResult(null); setParseError(null); setPreview(null);
    setSubitemFileName(file.name);
    try {
      setSubitemRows(await readImportFile(file));
    } catch (e) {
      setParseError(`Impossibile leggere "${file.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const buildPreview_ = () => {
    if (!itemRows || itemRows.length === 0) { setParseError("Carica prima il file delle commesse (item)."); return; }
    setPreview(buildKissflowPreview(itemRows, subitemRows ?? [], orders));
    setParseError(null);
  };

  const confirm = () => {
    if (!preview) return;
    const res = applyKissflowImport(preview, orders, setOrders);
    addAuditEntry({
      actionType: "creazione",
      field: "Import Kissflow",
      newValue: `${res.created} commesse create, ${res.updated} aggiornate (${itemFileName ?? "file"})`,
    });
    setResult(res);
    setPreview(null);
    toast({ title: "Import Kissflow completato", description: `${res.created} commesse create, ${res.updated} aggiornate.` });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="border border-border rounded p-4 bg-card flex flex-col gap-2 text-xs text-muted-foreground">
        <p className="font-bold uppercase text-foreground text-[10px]">Formato atteso — export board Kissflow</p>
        <p>
          <span className="font-mono text-foreground">item.csv</span> (una riga per commessa): Item Id, Title, Assignee, Priority, Status, Requester, Start date, Created at…
        </p>
        <p>
          <span className="font-mono text-foreground">subitem.csv</span> (una riga per lotto): Item Id (della commessa padre, es. <span className="font-mono">UT-0839-07</span> per la commessa <span className="font-mono">UT-0839</span>), Subitem state, Subitem title, Due date.
        </p>
        <p>Il campo <span className="font-mono text-foreground">Title</span> viene diviso al primo spazio in "N° Commessa" + "Nome Commessa" (es. <span className="font-mono">25214 C.M.B. FONDAZIONE…</span>). Le commesse già importate (stesso Item Id) vengono aggiornate, non duplicate; lotti e fasi aggiunti a mano restano intatti.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={itemRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleItemFile(f); }}
          data-testid="input-kissflow-item-file" />
        <Button variant="outline" onClick={() => itemRef.current?.click()} data-testid="button-choose-item-file">
          <Upload size={15} className="mr-2" /> File commesse (item)…
        </Button>
        {itemFileName && <span className="text-xs font-mono text-muted-foreground">{itemFileName} ({itemRows?.length ?? 0} righe)</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={subitemRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleSubitemFile(f); }}
          data-testid="input-kissflow-subitem-file" />
        <Button variant="outline" onClick={() => subitemRef.current?.click()} data-testid="button-choose-subitem-file">
          <Upload size={15} className="mr-2" /> File lotti (subitem)…
        </Button>
        {subitemFileName && <span className="text-xs font-mono text-muted-foreground">{subitemFileName} ({subitemRows?.length ?? 0} righe)</span>}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={buildPreview_} disabled={!itemRows} data-testid="button-preview-kissflow">
          <Workflow size={15} className="mr-2" /> Genera anteprima
        </Button>
        {(preview || result || parseError || itemRows) && (
          <Button variant="ghost" size="sm" onClick={reset}><RotateCcw size={13} className="mr-1" /> Ricomincia</Button>
        )}
      </div>

      {parseError && (
        <div className="border border-destructive/40 bg-destructive/10 rounded p-3 text-sm text-destructive flex items-center gap-2">
          <XCircle size={15} /> {parseError}
        </div>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-wide">
              Anteprima — <span className="text-green-500">{preview.rows.length - preview.errorCount} valide</span>
              {preview.errorCount > 0 && <span className="text-destructive"> · {preview.errorCount} con errori (scartate)</span>}
            </p>
            <Button onClick={confirm} disabled={preview.rows.every(r => r.errors.length > 0)} data-testid="button-confirm-kissflow-import">
              <CheckCircle2 size={15} className="mr-2" /> Conferma import
            </Button>
          </div>
          <div className="border border-border rounded overflow-auto max-h-[28rem]">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left p-2 w-20">Azione</th>
                  <th className="text-left p-2">N° Commessa</th>
                  <th className="text-left p-2">Nome Commessa</th>
                  <th className="text-left p-2">Lotti</th>
                  <th className="text-left p-2">Assegnatario</th>
                  <th className="text-left p-2">Problemi</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-border/50 ${r.errors.length ? "bg-destructive/10" : ""}`}>
                    <td className="p-2">
                      <span className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-bold ${
                        r.errors.length ? "bg-destructive/20 text-destructive"
                        : r.action === "crea" ? "bg-green-500/20 text-green-500"
                        : "bg-blue-500/20 text-blue-400"}`}>
                        {r.errors.length ? "scarta" : r.action}
                      </span>
                    </td>
                    <td className="p-2 font-mono text-primary">{r.order.orderNumber}</td>
                    <td className="p-2 font-bold">{r.order.name}</td>
                    <td className="p-2 font-mono">{r.lotCount}</td>
                    <td className="p-2">{r.order.assignee || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">
                      {r.errors.map((e, ei) => <span key={ei} className="flex items-center gap-1 text-destructive"><XCircle size={11} />{e}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">Nessun dato viene scritto finché non confermi.</p>
        </div>
      )}

      {result && (
        <div className="border border-green-500/40 bg-green-500/10 rounded p-4 flex flex-col gap-1 text-sm" data-testid="import-kissflow-result">
          <span className="flex items-center gap-2 font-bold text-green-500"><CheckCircle2 size={16} /> Import completato</span>
          <span className="text-xs font-mono">{result.created} commesse create · {result.updated} aggiornate</span>
        </div>
      )}
    </div>
  );
}
