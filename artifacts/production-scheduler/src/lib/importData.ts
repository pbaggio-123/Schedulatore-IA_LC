import Papa from "papaparse";
import * as XLSX from "xlsx";
import { CatalogPhase, CatalogProduct, Employee } from "@/types";

// Import da CSV/Excel di fasi standard, articoli e matricole (dipendenti).
//
// Architettura: questo modulo trasforma "righe grezze" (da qualunque fonte)
// in righe validate pronte per la scrittura. La UI passa un File; in futuro
// un connettore gestionale potrà passare le stesse righe grezze (array di
// oggetti) saltando la parte file — la validazione e l'applicazione restano
// identiche.

export type ImportKind = "fasi" | "articoli" | "matricole";

export interface ImportFormat {
  label: string;
  /** Intestazioni attese (case-insensitive; accenti/spazi tollerati). */
  columns: { key: string; label: string; required: boolean; hint: string }[];
}

export const IMPORT_FORMATS: Record<ImportKind, ImportFormat> = {
  fasi: {
    label: "Fasi standard",
    columns: [
      { key: "nome",          label: "nome",          required: true,  hint: "Nome della fase (chiave: aggiorna se esiste)" },
      { key: "competenza",    label: "competenza",    required: true,  hint: "Skill richiesta; creata se nuova" },
      { key: "ore_per_unita", label: "ore_per_unita", required: true,  hint: "Numero, es. 2 oppure 0,5" },
      { key: "unita",         label: "unita",         required: false, hint: "pz, kg, m… (default: pz)" },
    ],
  },
  articoli: {
    label: "Articoli",
    columns: [
      { key: "codice", label: "codice", required: true,  hint: "Codice articolo (chiave: aggiorna se esiste)" },
      { key: "nome",   label: "nome",   required: true,  hint: "Descrizione articolo" },
      { key: "fasi",   label: "fasi",   required: false, hint: "Nomi fase separati da | (devono esistere o essere nello stesso import)" },
    ],
  },
  matricole: {
    label: "Matricole (dipendenti)",
    columns: [
      { key: "matricola",  label: "matricola",  required: true,  hint: "Numero matricola (chiave: aggiorna se esiste)" },
      { key: "nome",       label: "nome",       required: true,  hint: "Nome e cognome" },
      { key: "competenze", label: "competenze", required: false, hint: "Skill separate da | ; create se nuove" },
    ],
  },
};

export interface ImportRow {
  index: number;                     // riga nel file (1-based, esclusa intestazione)
  raw: Record<string, string>;
  errors: string[];
  warnings: string[];
  action: "crea" | "aggiorna" | "scarta";
}

export interface ImportPreview {
  kind: ImportKind;
  rows: ImportRow[];
  validCount: number;
  errorCount: number;
}

// ── Lettura file ──────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase()
    .replace(/à/g, "a").replace(/è|é/g, "e").replace(/ì/g, "i").replace(/ò/g, "o").replace(/ù/g, "u")
    .replace(/\s+/g, "_");
}

/** Legge .csv/.xlsx/.xls e restituisce righe come oggetti chiave→stringa. */
export async function readImportFile(file: File): Promise<Record<string, string>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return json.map(row => {
      const out: Record<string, string> = {};
      Object.entries(row).forEach(([k, v]) => { out[normalizeHeader(k)] = String(v ?? "").trim(); });
      return out;
    });
  }
  // CSV (delimitatore auto: , o ;)
  const text = await file.text();
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });
  return res.data.map(row => {
    const out: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => { out[k] = String(v ?? "").trim(); });
    return out;
  });
}

// ── Validazione ───────────────────────────────────────────────────────────────

function parseItalianNumber(s: string): number | null {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const splitList = (s: string) => s.split("|").map(x => x.trim()).filter(Boolean);

export function buildPreview(
  kind: ImportKind,
  rawRows: Record<string, string>[],
  existing: { phases: CatalogPhase[]; products: CatalogProduct[]; employees: Employee[] },
): ImportPreview {
  const seenKeys = new Set<string>();
  // nomi fase disponibili per la validazione articoli (esistenti + in import)
  const phaseNames = new Set(existing.phases.map(p => p.name.toLowerCase()));
  if (kind === "articoli") {
    // niente
  }

  const rows: ImportRow[] = rawRows.map((raw, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let action: ImportRow["action"] = "crea";

    const fmt = IMPORT_FORMATS[kind];
    fmt.columns.filter(c => c.required).forEach(c => {
      if (!raw[c.key]) errors.push(`Colonna "${c.label}" mancante o vuota`);
    });

    if (kind === "fasi") {
      const key = (raw.nome ?? "").toLowerCase();
      if (raw.ore_per_unita && parseItalianNumber(raw.ore_per_unita) === null)
        errors.push(`"ore_per_unita" non è un numero: ${raw.ore_per_unita}`);
      else if (raw.ore_per_unita && (parseItalianNumber(raw.ore_per_unita) ?? 0) <= 0)
        errors.push(`"ore_per_unita" deve essere > 0`);
      if (key && seenKeys.has(key)) errors.push(`Nome fase duplicato nel file: ${raw.nome}`);
      if (key) seenKeys.add(key);
      if (key && existing.phases.some(p => p.name.toLowerCase() === key)) action = "aggiorna";
      if (key) phaseNames.add(key);
    }

    if (kind === "articoli") {
      const key = (raw.codice ?? "").toLowerCase();
      if (key && seenKeys.has(key)) errors.push(`Codice articolo duplicato nel file: ${raw.codice}`);
      if (key) seenKeys.add(key);
      if (key && existing.products.some(p => p.code.toLowerCase() === key)) action = "aggiorna";
      splitList(raw.fasi ?? "").forEach(f => {
        if (!phaseNames.has(f.toLowerCase()))
          warnings.push(`Fase "${f}" non in catalogo: verrà ignorata`);
      });
    }

    if (kind === "matricole") {
      const key = (raw.matricola ?? "").toLowerCase();
      if (key && seenKeys.has(key)) errors.push(`Matricola duplicata nel file: ${raw.matricola}`);
      if (key) seenKeys.add(key);
      if (key && existing.employees.some(e => e.matricola?.toLowerCase() === key)) action = "aggiorna";
      else if (raw.nome && existing.employees.some(e => !e.matricola && e.name.toLowerCase() === raw.nome.toLowerCase())) {
        action = "aggiorna";
        warnings.push("Abbinato per nome a dipendente esistente senza matricola");
      }
    }

    if (errors.length > 0) action = "scarta";
    return { index: i + 1, raw, errors, warnings, action };
  });

  return {
    kind,
    rows,
    validCount: rows.filter(r => r.action !== "scarta").length,
    errorCount: rows.filter(r => r.action === "scarta").length,
  };
}

// ── Applicazione (scrittura) ──────────────────────────────────────────────────

export interface ApplyResult {
  created: number;
  updated: number;
  skipped: number;
  newSkills: string[];
}

export function applyImport(
  preview: ImportPreview,
  data: {
    phases: CatalogPhase[];     setPhases: (p: CatalogPhase[]) => void;
    products: CatalogProduct[]; setProducts: (p: CatalogProduct[]) => void;
    employees: Employee[];      setEmployees: (e: Employee[]) => void;
    skills: string[];           setSkills: (s: string[]) => void;
  },
): ApplyResult {
  const valid = preview.rows.filter(r => r.action !== "scarta");
  let created = 0, updated = 0;
  const newSkills: string[] = [];
  const skillSet = new Set(data.skills);
  const ensureSkill = (s: string) => {
    if (s && !skillSet.has(s)) { skillSet.add(s); newSkills.push(s); }
  };

  if (preview.kind === "fasi") {
    let phases = [...data.phases];
    valid.forEach(({ raw }) => {
      const hours = parseItalianNumber(raw.ore_per_unita) ?? 1;
      const unit = raw.unita || "pz";
      ensureSkill(raw.competenza);
      const idx = phases.findIndex(p => p.name.toLowerCase() === raw.nome.toLowerCase());
      if (idx >= 0) {
        phases[idx] = { ...phases[idx], skill: raw.competenza, hoursPerUnit: hours, unit };
        updated++;
      } else {
        phases = [...phases, { id: `cp-imp-${Date.now()}-${created}`, name: raw.nome, skill: raw.competenza, hoursPerUnit: hours, unit }];
        created++;
      }
    });
    data.setPhases(phases);
    if (newSkills.length) data.setSkills([...skillSet]);
  }

  if (preview.kind === "articoli") {
    let products = [...data.products];
    valid.forEach(({ raw }) => {
      const phaseIds = splitList(raw.fasi ?? "")
        .map(f => data.phases.find(p => p.name.toLowerCase() === f.toLowerCase())?.id)
        .filter((x): x is string => !!x);
      const idx = products.findIndex(p => p.code.toLowerCase() === raw.codice.toLowerCase());
      if (idx >= 0) {
        products[idx] = { ...products[idx], name: raw.nome, phaseIds };
        updated++;
      } else {
        products = [...products, { id: `art-imp-${Date.now()}-${created}`, code: raw.codice, name: raw.nome, phaseIds }];
        created++;
      }
    });
    data.setProducts(products);
  }

  if (preview.kind === "matricole") {
    let employees = [...data.employees];
    valid.forEach(({ raw }) => {
      const skills = splitList(raw.competenze ?? "");
      skills.forEach(ensureSkill);
      let idx = employees.findIndex(e => e.matricola?.toLowerCase() === raw.matricola.toLowerCase());
      if (idx < 0) idx = employees.findIndex(e => !e.matricola && e.name.toLowerCase() === raw.nome.toLowerCase());
      if (idx >= 0) {
        employees[idx] = { ...employees[idx], name: raw.nome, matricola: raw.matricola, skills: skills.length ? skills : employees[idx].skills };
        updated++;
      } else {
        employees = [...employees, { id: `e-imp-${Date.now()}-${created}`, name: raw.nome, matricola: raw.matricola, skills }];
        created++;
      }
    });
    data.setEmployees(employees);
    if (newSkills.length) data.setSkills([...skillSet]);
  }

  return { created, updated, skipped: preview.errorCount, newSkills };
}
