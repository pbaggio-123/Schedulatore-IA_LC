import { useRef, useState } from "react";
import Layout from "@/components/Layout";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { addAuditEntry } from "@/hooks/useAuditLog";
import {
  ImportKind, IMPORT_FORMATS, ImportPreview,
  readImportFile, buildPreview, applyImport, ApplyResult,
} from "@/lib/importData";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, RotateCcw } from "lucide-react";

const KINDS: ImportKind[] = ["fasi", "articoli", "matricole"];

export default function Importa() {
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
    <Layout>
      <div className="p-6 flex flex-col gap-5 max-w-5xl">
        <h2 className="text-2xl font-bold uppercase tracking-tight text-primary flex items-center gap-2">
          <FileSpreadsheet size={22} /> Importa da CSV / Excel
        </h2>

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
    </Layout>
  );
}
