import { useMemo, useRef, useState, useCallback } from "react";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useAuth } from "@/hooks/useAuth";
import { addAuditEntry } from "@/hooks/useAuditLog";
import {
  formatISODate, isHoliday, isWeekend, isNonWorkingDay, Holiday,
} from "@/types";
import {
  computeScheduledParts, findEmployeeOverlaps, overlappingPartIds, phaseCodeOf,
  shippingListOf, overlapMapOf, findLineGaps, findGapsInDateRanges,
  ScheduledPart, ProductionGap, DAY_HOURS,
} from "@/lib/schedule";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Types ─────────────────────────────────────────────────────────────────────

type GanttPart = ScheduledPart;

interface DragState {
  partId: string;
  orderId: string;
  lotId: string;
  originX: number;
  originY: number;
  origStartDate: Date;
  origLine: "L1" | "L2" | "L3";
  currentDeltaDays: number;
  currentLine: "L1" | "L2" | "L3";
}

interface Segment { startDay: number; widthDays: number; }

// Riga della proposta di "spostamento a cascata" (drag che impatta altre fasi
// sulla stessa linea, o click su un buco di produzione già presente): per
// ciascuna fase coinvolta, solo la data di inizio proposta è editabile.
interface CascadeRow {
  partId: string; orderId: string; lotId: string;
  name: string; orderName: string; lotName: string;
  currentDate: string;   // ISO, data attuale (prima della proposta)
  proposedDate: string;  // ISO, editabile
  calendarDays: number;  // durata (giorni di calendario), invariata dalla proposta
  prevLine?: "L1" | "L2" | "L3"; // presenti solo sulla fase trascinata, se
  newLine?: "L1" | "L2" | "L3";  // lo spostamento ha cambiato anche la linea
}
interface CascadeProposal {
  line: "L1" | "L2" | "L3";
  rows: CascadeRow[];
  // "drag": lo spostamento che ha innescato la proposta è GIÀ applicato (il
  // pannello serve solo a rivedere/correggere le altre fasi coinvolte).
  // "gap": click su un buco esistente, nulla è ancora applicato.
  context: "drag" | "gap";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LINES = ["L1", "L2", "L3"] as const;
const DAY_WIDTH   = 34;
const ROW_HEIGHT  = 44;
const HEADER_HEIGHT = 56;
const LINE_LABEL_W  = 56;

// Colonne informative per riga (fase), fra l'etichetta di linea e il Gantt:
// N° commessa, N° lista di spedizione, data inizio/fine della fase in quella riga.
const COL_COMMESSA_W   = 66;
const COL_SPEDIZIONE_W = 60;
const COL_DATA_W       = 44;
const INFO_PANEL_W = LINE_LABEL_W + COL_COMMESSA_W + COL_SPEDIZIONE_W + COL_DATA_W * 2;
const COL_COMMESSA_X   = LINE_LABEL_W;
const COL_SPEDIZIONE_X = COL_COMMESSA_X + COL_COMMESSA_W;
const COL_INIZIO_X     = COL_SPEDIZIONE_X + COL_SPEDIZIONE_W;
const COL_FINE_X       = COL_INIZIO_X + COL_DATA_W;

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + Math.round(n)); return r;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function getSegments(
  startDate: Date, endDate: Date,
  holidays: Holiday[], saturdayWorking: boolean,
): Segment[] {
  const segs: Segment[] = [];
  const total = daysBetween(startDate, endDate);
  let segStart = -1;
  for (let i = 0; i < total; i++) {
    const nonW = isNonWorkingDay(addDays(startDate, i), holidays, saturdayWorking);
    if (!nonW) { if (segStart === -1) segStart = i; }
    else { if (segStart !== -1) { segs.push({ startDay: segStart, widthDays: i - segStart }); segStart = -1; } }
  }
  if (segStart !== -1) segs.push({ startDay: segStart, widthDays: total - segStart });
  return segs;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GanttChart() {
  const { orders, setOrders, holidays, setHolidays, saturdayWorking, employees, catalogPhases } = useSchedulerData();
  const { can } = useAuth();
  const [, setLocation] = useLocation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag]       = useState<DragState | null>(null);
  // true se il mouse si è mosso oltre la soglia durante il drag: il click
  // emesso dal browser dopo il mouseup non deve navigare alla commessa
  const didDragRef = useRef(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; part: GanttPart } | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  // Editing inline della data inizio (click sulla colonna "Inizio")
  const [dateEdit, setDateEdit] = useState<{ partId: string; x: number; y: number; value: string } | null>(null);
  // Dialog di correzione ore/giorni (click sulla barra della fase)
  const [correctionPart, setCorrectionPart] = useState<GanttPart | null>(null);
  const [correctionHours, setCorrectionHours] = useState("0");
  const [correctionDays, setCorrectionDays] = useState("0");
  // Proposta di spostamento a cascata (drag con impatto su altre fasi, o click
  // su un buco di produzione): elenco editabile di date proposte per fase.
  const [cascadeProposal, setCascadeProposal] = useState<CascadeProposal | null>(null);

  // Lookup commessa per id, per le colonne informative a sinistra del Gantt.
  const orderById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);

  // ── Compute layout ──────────────────────────────────────────────────────────
  const { partsWithRow, lineInfo, totalRows, minDate, maxDate } = useMemo(() => {
    // Colori scelti a mano per codice fase (Catalogo → campo colore). Vincono sul
    // colore automatico generato dal codice.
    const phaseColors: Record<string, string> = {};
    catalogPhases.forEach(ph => { if (ph.color) phaseColors[phaseCodeOf(ph.name)] = ph.color; });
    const overlapMap = overlapMapOf(catalogPhases);
    const finalParts: GanttPart[] = computeScheduledParts(orders, holidays, saturdayWorking, phaseColors, overlapMap);

    // Assign rows: each part gets its own row, grouped by line
    const lineGroups: Record<string, GanttPart[]> = { L1: [], L2: [], L3: [] };
    finalParts.forEach(p => lineGroups[p.line].push(p));

    let rowIdx = 0;
    const partsWithRow: Array<{ part: GanttPart; rowIdx: number }> = [];
    const lineInfo: Record<string, { startRow: number; rowCount: number }> = {};
    LINES.forEach(line => {
      const partsInLine = lineGroups[line];
      lineInfo[line] = { startRow: rowIdx, rowCount: Math.max(1, partsInLine.length) };
      partsInLine.forEach(part => { partsWithRow.push({ part, rowIdx }); rowIdx++; });
      if (partsInLine.length === 0) rowIdx++;
    });

    // Date range
    let minT = Infinity, maxT = -Infinity;
    finalParts.forEach(p => {
      if (p.startDate.getTime() < minT) minT = p.startDate.getTime();
      if (p.endDate.getTime() > maxT) maxT = p.endDate.getTime();
    });
    if (minT === Infinity) { const now = Date.now(); minT = now - 7 * 86400000; maxT = now + 21 * 86400000; }
    else { minT -= 3 * 86400000; maxT += 10 * 86400000; }

    return { partsWithRow, lineInfo, totalRows: rowIdx, minDate: new Date(minT), maxDate: new Date(maxT) };
  }, [orders, holidays, saturdayWorking, catalogPhases]);

  // Fasi con sovrapposizione di persona (alert non bloccante: solo badge)
  const overlapIds = useMemo(
    () => overlappingPartIds(findEmployeeOverlaps(partsWithRow.map(x => x.part), employees)),
    [partsWithRow, employees],
  );

  // Buchi di produzione (giorni vuoti fra fasi già pianificate sulla stessa
  // linea): evidenziati nel Gantt, cliccabili per riaprire una proposta di
  // spostamento che li chiuda.
  const gaps = useMemo(
    () => findLineGaps(partsWithRow.map(x => x.part), holidays, saturdayWorking),
    [partsWithRow, holidays, saturdayWorking],
  );

  // Buchi "live" della proposta aperta: ricalcolati ad ogni modifica di una
  // data proposta nel dialog, così l'avviso resta sempre coerente con quello
  // che l'utente sta effettivamente per confermare.
  const cascadeGaps = useMemo(() => {
    if (!cascadeProposal) return [];
    const rowIds = new Set(cascadeProposal.rows.map(r => r.partId));
    const rowRanges = cascadeProposal.rows.map(r => {
      const start = new Date(r.proposedDate + "T00:00:00");
      return { startDate: start, endDate: addDays(start, r.calendarDays) };
    });
    const otherRanges = partsWithRow.map(x => x.part)
      .filter(p => p.line === cascadeProposal.line && !rowIds.has(p.id))
      .map(p => ({ startDate: p.startDate, endDate: p.endDate }));
    return findGapsInDateRanges([...otherRanges, ...rowRanges], holidays, saturdayWorking);
  }, [cascadeProposal, partsWithRow, holidays, saturdayWorking]);

  const totalDays   = Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000);
  const chartWidth  = totalDays * DAY_WIDTH;
  const totalHeight = HEADER_HEIGHT + totalRows * ROW_HEIGHT;

  // ── Day info array ──────────────────────────────────────────────────────────
  const dayInfo = useMemo(() => Array.from({ length: totalDays + 1 }).map((_, i) => {
    const d = addDays(minDate, i);
    const ds = formatISODate(d);
    const hol  = isHoliday(d, holidays);
    const sat  = d.getDay() === 6;
    const sun  = d.getDay() === 0;
    const nonW = isNonWorkingDay(d, holidays, saturdayWorking);
    return { d, ds, hol, sat, sun, nonW };
  }), [minDate, totalDays, holidays, saturdayWorking]);

  const nonWorkingSet = useMemo(() => {
    const s = new Set<string>();
    dayInfo.forEach(({ ds, nonW }) => { if (nonW) s.add(ds); });
    return s;
  }, [dayInfo]);

  // ── Mouse helpers ───────────────────────────────────────────────────────────
  const getSvgPt = (e: React.MouseEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const xToDate = (x: number) => addDays(minDate, Math.floor((x - INFO_PANEL_W) / DAY_WIDTH));

  const getLineFromY = (y: number): "L1" | "L2" | "L3" => {
    for (const line of LINES) {
      const { startRow, rowCount } = lineInfo[line];
      const lineY = HEADER_HEIGHT + startRow * ROW_HEIGHT;
      if (y >= lineY && y < lineY + rowCount * ROW_HEIGHT) return line as "L1" | "L2" | "L3";
    }
    return drag?.origLine ?? "L1";
  };

  const getGhostRow = (partId: string, targetLine: "L1" | "L2" | "L3") => {
    const pr = partsWithRow.find(x => x.part.id === partId);
    if (!pr) return 0;
    if (pr.part.line === targetLine) return pr.rowIdx;
    const { startRow, rowCount } = lineInfo[targetLine];
    return startRow + rowCount - 1;
  };

  // ── Click on blank area → toggle closure ───────────────────────────────────
  const toggleHolidayOnDate = (ds: string) => {
    if (!can("manageHolidays")) return; // chiusure: solo Pianificatore+
    const d = new Date(ds + "T00:00:00");
    if (isWeekend(d, true)) return; // never toggle weekend cells
    const existing = holidays.find(h => !h.recurring && h.date === ds);
    if (existing) {
      setHolidays(holidays.filter(h => h.id !== existing.id));
    } else {
      const label = d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
      setHolidays([...holidays, { id: `hol${Date.now()}`, date: ds, name: `Chiusura ${label}`, recurring: false }]);
    }
  };

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handleBarMouseDown = (e: React.MouseEvent, p: GanttPart) => {
    e.preventDefault(); e.stopPropagation();
    if (!can("movePhases")) return; // tier 1: sola lettura, niente drag
    didDragRef.current = false;
    setTooltip(null); setHoverDay(null);
    const { x, y } = getSvgPt(e);
    setDrag({ partId: p.id, orderId: p.orderId, lotId: p.lotId, originX: x, originY: y, origStartDate: new Date(p.startDate), origLine: p.line, currentDeltaDays: 0, currentLine: p.line });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getSvgPt(e);
    if (drag) {
      if (Math.abs(x - drag.originX) > 4 || Math.abs(y - drag.originY) > 4) didDragRef.current = true;
      const dd = Math.round((x - drag.originX) / DAY_WIDTH);
      const newLine = getLineFromY(y);
      setDrag(prev => prev ? { ...prev, currentDeltaDays: dd, currentLine: newLine } : null);
      return;
    }
    if (x > INFO_PANEL_W && y > HEADER_HEIGHT) setHoverDay(formatISODate(xToDate(x)));
    else setHoverDay(null);
  };

  // ── Proposta di spostamento a cascata ────────────────────────────────────────
  // Calcola l'impatto di un cambio di data (ed eventualmente di linea) su UNA
  // fase: quali altre fasi della linea di destinazione cambierebbero data di
  // conseguenza (accodamento automatico) e se si aprirebbe un buco di
  // produzione. Ritorna null se non c'è alcun impatto (si applica direttamente,
  // senza dialog — comportamento invariato per lo spostamento "semplice").
  const buildCascadeProposal = useCallback((
    changedPartId: string,
    newDateISO: string,
    destLine: "L1" | "L2" | "L3",
    lineChangeFrom?: "L1" | "L2" | "L3",
    // Conta solo i buchi ADIACENTI alla fase appena spostata (che iniziano
    // esattamente dove finisce, o finiscono esattamente dove inizia): un buco
    // preesistente e scollegato altrove sulla linea non deve riaprire il
    // pannello ad ogni minimo spostamento successivo su quella stessa linea.
    // Nota: confrontare i buchi "prima vs dopo" per data esatta NON funziona,
    // perché un buco delimitato dalla fase appena spostata trasla insieme a
    // lei — sembrerebbe sempre "nuovo" anche quando è lo stesso buco di sempre.
    onlyAdjacentGaps = false,
  ): Omit<CascadeProposal, "context"> | null => {
    const phaseColors: Record<string, string> = {};
    catalogPhases.forEach(ph => { if (ph.color) phaseColors[phaseCodeOf(ph.name)] = ph.color; });
    const overlapMap = overlapMapOf(catalogPhases);
    const baseline = computeScheduledParts(orders, holidays, saturdayWorking, phaseColors, overlapMap);
    const baselineById = new Map(baseline.map(p => [p.id, p]));

    const candidateOrders = orders.map(o => ({
      ...o,
      lots: o.lots.map(l => ({
        ...l,
        parts: l.parts.map(p => p.id === changedPartId ? { ...p, manualStartDate: newDateISO, line: destLine } : p),
      })),
    }));
    const candidate = computeScheduledParts(candidateOrders, holidays, saturdayWorking, phaseColors, overlapMap);
    const changedCandidate = candidate.find(p => p.id === changedPartId);
    if (!changedCandidate) return null;

    const rows: CascadeRow[] = [{
      partId: changedCandidate.id, orderId: changedCandidate.orderId, lotId: changedCandidate.lotId,
      name: changedCandidate.name, orderName: changedCandidate.orderName, lotName: changedCandidate.lotName,
      currentDate: formatISODate(baselineById.get(changedPartId)?.startDate ?? changedCandidate.startDate),
      proposedDate: formatISODate(changedCandidate.startDate),
      calendarDays: changedCandidate.calendarDays,
      ...(lineChangeFrom ? { prevLine: lineChangeFrom, newLine: destLine } : {}),
    }];

    candidate.filter(p => p.line === destLine && p.id !== changedPartId).forEach(p => {
      const before = baselineById.get(p.id);
      if (!before) return;
      const beforeISO = formatISODate(before.startDate);
      const afterISO = formatISODate(p.startDate);
      if (beforeISO !== afterISO) {
        rows.push({
          partId: p.id, orderId: p.orderId, lotId: p.lotId,
          name: p.name, orderName: p.orderName, lotName: p.lotName,
          currentDate: beforeISO, proposedDate: afterISO, calendarDays: p.calendarDays,
        });
      }
    });

    let candidateGaps = findLineGaps(candidate.filter(p => p.line === destLine), holidays, saturdayWorking);
    if (onlyAdjacentGaps) {
      const baselineGaps = findLineGaps(baseline.filter(p => p.line === destLine), holidays, saturdayWorking);
      candidateGaps = candidateGaps.filter(g => {
        const isAdjacent = g.startDate.getTime() === changedCandidate.endDate.getTime()
          || g.endDate.getTime() === changedCandidate.startDate.getTime();
        if (!isAdjacent) return false;
        // Un buco isolato "di coda" (es. una commessa lontana dalle altre) si
        // sposta insieme alla fase trascinata: non è nuovo, è lo stesso spazio
        // vuoto di sempre, solo con il bordo traslato. Lo consideriamo nuovo
        // solo se NON si sovrappone a un buco già presente prima del drag.
        const overlapsPreexisting = baselineGaps.some(bg =>
          bg.startDate.getTime() < g.endDate.getTime() && bg.endDate.getTime() > g.startDate.getTime(),
        );
        return !overlapsPreexisting;
      });
    }
    if (rows.length <= 1 && candidateGaps.length === 0) return null;

    return { line: destLine, rows };
  }, [orders, holidays, saturdayWorking, catalogPhases]);

  // Applica le date (ed eventuale cambio linea) di una proposta confermata.
  const applyCascadeRows = useCallback((rows: CascadeRow[]) => {
    setOrders(prev => prev.map(o => ({
      ...o,
      lots: o.lots.map(l => ({
        ...l,
        parts: l.parts.map(p => {
          const row = rows.find(r => r.partId === p.id);
          if (!row) return p;
          const dateChanged = row.proposedDate !== row.currentDate;
          const lineChanged = !!row.newLine && row.newLine !== row.prevLine;
          if (!dateChanged && !lineChanged) return p;
          return {
            ...p,
            ...(dateChanged ? { manualStartDate: row.proposedDate } : {}),
            ...(lineChanged ? { line: row.newLine! } : {}),
          };
        }),
      })),
    })));
    rows.forEach(row => {
      const dateChanged = row.proposedDate !== row.currentDate;
      const lineChanged = !!row.newLine && row.newLine !== row.prevLine;
      if (lineChanged) {
        addAuditEntry({
          actionType: "cambio_linea", partId: row.partId, partName: row.name,
          field: "Linea", previousValue: row.prevLine, newValue: row.newLine,
          notes: "Spostata via Gantt",
        });
      }
      if (dateChanged) {
        addAuditEntry({
          actionType: "cambio_data", partId: row.partId, partName: row.name,
          field: "Inizio", previousValue: row.currentDate, newValue: row.proposedDate,
          notes: lineChanged ? "Spostata via Gantt (cambio linea + data)" : "Spostata via Gantt (spostamento a cascata)",
        });
      }
    });
  }, [setOrders]);

  // Il rilascio del mouse applica SEMPRE e SUBITO lo spostamento della fase
  // trascinata (data esattamente quella trascinata coi pixel, più eventuale
  // cambio linea): nessun secondo click è mai necessario per "rilasciarla". Se
  // questo sposta di conseguenza anche altre fasi della stessa linea
  // (accodamento automatico) o lascia un buco, si apre DOPO un pannello non
  // bloccante per rivedere/correggere quelle altre date — la fase appena
  // trascinata è già a posto e non fa più parte di quella proposta.
  const commitDrag = useCallback((d: DragState) => {
    const newStart = addDays(d.origStartDate, d.currentDeltaDays);
    const lineChanged = d.currentLine !== d.origLine;
    const dateChanged = d.currentDeltaDays !== 0;
    if (!lineChanged && !dateChanged) return; // semplice click, niente da fare

    const partName = partsWithRow.find(x => x.part.id === d.partId)?.part.name ?? d.partId;
    const newStartISO = formatISODate(newStart);

    setOrders(prev => prev.map(o => o.id !== d.orderId ? o : {
      ...o, lots: o.lots.map(l => l.id !== d.lotId ? l : {
        ...l, parts: l.parts.map(p => p.id !== d.partId ? p : {
          ...p, line: d.currentLine, ...(dateChanged ? { manualStartDate: newStartISO } : {}),
        }),
      }),
    }));
    if (lineChanged) {
      addAuditEntry({
        actionType: "cambio_linea", partId: d.partId, partName,
        field: "Linea", previousValue: d.origLine, newValue: d.currentLine,
        notes: "Spostata via Gantt",
      });
    }
    if (dateChanged) {
      addAuditEntry({
        actionType: "cambio_data", partId: d.partId, partName,
        field: "Inizio", previousValue: formatISODate(d.origStartDate), newValue: newStartISO,
        notes: "Spostata via Gantt",
      });
    }

    if (!dateChanged) return; // solo cambio linea: nessuna cascata di date da rivedere

    // Solo buchi ADIACENTI alla fase appena spostata: una linea con un buco
    // preesistente e scollegato non deve riaprire il pannello ad ogni
    // spostamento successivo, anche minimo, su quella linea.
    const proposal = buildCascadeProposal(d.partId, newStartISO, d.currentLine, lineChanged ? d.origLine : undefined, true);
    if (!proposal) return; // nessun impatto su altre fasi né buchi adiacenti: fatto
    // La fase appena trascinata resta SEMPRE nell'elenco (editabile: può
    // servire una correzione fine) — "Attuale"/"Proposta" puntano entrambe al
    // valore già scritto sopra, non a quello (eventualmente diverso per snap
    // sui giorni lavorativi) ricalcolato dal motore, così riaprendo il
    // pannello senza toccare nulla non si riscrive lo stesso valore due volte.
    const rows = proposal.rows.map(r => r.partId === d.partId
      ? { ...r, currentDate: newStartISO, proposedDate: newStartISO }
      : r);
    setCascadeProposal({ line: proposal.line, rows, context: "drag" });
  }, [setOrders, partsWithRow, buildCascadeProposal]);

  // ── Click su un buco di produzione: propone di richiudere la fase successiva ─
  const handleGapClick = useCallback((gap: ProductionGap) => {
    const candidatePart = partsWithRow.map(x => x.part)
      .find(p => p.line === gap.line && formatISODate(p.startDate) === formatISODate(gap.endDate));
    if (!candidatePart) return;
    const newDateISO = formatISODate(gap.startDate);
    const proposal = buildCascadeProposal(candidatePart.id, newDateISO, gap.line);
    if (proposal) { setCascadeProposal({ ...proposal, context: "gap" }); return; }
    // Nessun impatto su altre fasi: propone comunque la chiusura del buco,
    // dato che l'utente ha cliccato apposta per risolverlo.
    setCascadeProposal({
      line: gap.line,
      context: "gap",
      rows: [{
        partId: candidatePart.id, orderId: candidatePart.orderId, lotId: candidatePart.lotId,
        name: candidatePart.name, orderName: candidatePart.orderName, lotName: candidatePart.lotName,
        currentDate: formatISODate(candidatePart.startDate), proposedDate: newDateISO,
        calendarDays: candidatePart.calendarDays,
      }],
    });
  }, [partsWithRow, buildCascadeProposal]);

  // ── Modifica manuale data inizio (colonna "Inizio") ─────────────────────────
  const commitDateEdit = () => {
    if (!dateEdit || !dateEdit.value) { setDateEdit(null); return; }
    const pr = partsWithRow.find(x => x.part.id === dateEdit.partId);
    const p = pr?.part;
    if (p) {
      const prevISO = formatISODate(p.startDate);
      if (dateEdit.value !== prevISO) {
        setOrders(prev => prev.map(o => o.id !== p.orderId ? o : {
          ...o, lots: o.lots.map(l => l.id !== p.lotId ? l : {
            ...l, parts: l.parts.map(pt => pt.id !== p.id ? pt : { ...pt, manualStartDate: dateEdit.value }),
          }),
        }));
        addAuditEntry({
          actionType: "cambio_data", partId: p.id, partName: p.name,
          field: "Inizio", previousValue: prevISO, newValue: dateEdit.value,
          notes: "Modificata dalla colonna Inizio nel Pannello",
        });
      }
    }
    setDateEdit(null);
  };

  // ── Correzione ore/giorni (click sulla fase nel Gantt) ──────────────────────
  const applyCorrection = () => {
    if (!correctionPart) return;
    const hoursDelta = parseFloat(correctionHours) || 0;
    const daysDelta = parseFloat(correctionDays) || 0;
    const delta = hoursDelta + daysDelta * DAY_HOURS;
    if (delta === 0) { setCorrectionPart(null); return; }
    const prevHours = correctionPart.estimatedHours;
    const newHours = Math.max(1, prevHours + delta);
    setOrders(prev => prev.map(o => o.id !== correctionPart.orderId ? o : {
      ...o, lots: o.lots.map(l => l.id !== correctionPart.lotId ? l : {
        ...l, parts: l.parts.map(pt => pt.id !== correctionPart.id ? pt : { ...pt, estimatedHours: newHours }),
      }),
    }));
    const notesParts: string[] = [];
    if (hoursDelta !== 0) notesParts.push(`${hoursDelta > 0 ? "+" : ""}${hoursDelta}h`);
    if (daysDelta !== 0) notesParts.push(`${daysDelta > 0 ? "+" : ""}${daysDelta}gg lavorativi`);
    addAuditEntry({
      actionType: "modifica", partId: correctionPart.id, partName: correctionPart.name,
      field: "Ore stimate", previousValue: `${prevHours}h`, newValue: `${newHours}h`,
      notes: `Correzione dal Pannello: ${notesParts.join(", ")}`,
    });
    setCorrectionPart(null);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (drag) { commitDrag(drag); setDrag(null); return; }
    const { x, y } = getSvgPt(e);
    if (x > INFO_PANEL_W && y > HEADER_HEIGHT) toggleHolidayOnDate(formatISODate(xToDate(x)));
  };

  const handleMouseLeave = () => {
    if (drag) { commitDrag(drag); setDrag(null); }
    setHoverDay(null);
  };

  // ── Bar height within a row ─────────────────────────────────────────────────
  const barH = ROW_HEIGHT - 12;

  // ── Today ──────────────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayX = INFO_PANEL_W + daysBetween(minDate, today) * DAY_WIDTH;

  return (
    <div
      className="w-full h-full overflow-auto bg-card relative select-none"
      style={{ cursor: drag ? "grabbing" : "crosshair" }}
    >
      {/* Legend */}
      <div className="absolute top-2 right-3 z-10 flex items-center gap-3 text-[10px] font-mono text-muted-foreground bg-card/90 px-2 py-1 rounded border border-border">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500 text-white text-[8px] font-bold leading-3 text-center">!</span> Persona sovrapposta</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-orange-500 text-white text-[8px] font-bold leading-3 text-center">!</span> Buco di produzione</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-slate-500/30" /> Weekend</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500/30" /> Festività</span>
        <span className="opacity-60">Click feriale = chiusura</span>
      </div>

      <svg
        ref={svgRef}
        width={Math.max(INFO_PANEL_W + chartWidth, 600)}
        height={totalHeight}
        className="min-w-full"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* ── Background base ── */}
        <rect x={INFO_PANEL_W} y={HEADER_HEIGHT} width={chartWidth} height={totalHeight - HEADER_HEIGHT}
          fill="hsl(var(--card))" />

        {/* ── Alternating day backgrounds (working days) ── */}
        {dayInfo.slice(0, totalDays).map(({ nonW }, i) => {
          if (nonW) return null;
          const x = INFO_PANEL_W + i * DAY_WIDTH;
          const fill = i % 2 === 0 ? "rgba(255,255,255,0.025)" : "transparent";
          return (
            <rect key={`bg-${i}`} x={x} y={HEADER_HEIGHT} width={DAY_WIDTH} height={totalHeight - HEADER_HEIGHT}
              fill={fill} style={{ pointerEvents: "none" }} />
          );
        })}

        {/* ── Row separator lines ── */}
        {Array.from({ length: totalRows }).map((_, ri) => (
          <line key={`rl-${ri}`} x1={INFO_PANEL_W} y1={HEADER_HEIGHT + ri * ROW_HEIGHT}
            x2={INFO_PANEL_W + chartWidth} y2={HEADER_HEIGHT + ri * ROW_HEIGHT}
            stroke="rgba(130,130,150,0.18)" strokeWidth="1" />
        ))}
        <line x1={INFO_PANEL_W} y1={totalHeight} x2={INFO_PANEL_W + chartWidth} y2={totalHeight}
          stroke="rgba(130,130,150,0.18)" strokeWidth="1" />

        {/* ── Vertical day grid lines ── */}
        {Array.from({ length: totalDays + 1 }).map((_, i) => (
          <line key={`dl-${i}`}
            x1={INFO_PANEL_W + i * DAY_WIDTH} y1={HEADER_HEIGHT}
            x2={INFO_PANEL_W + i * DAY_WIDTH} y2={totalHeight}
            stroke="rgba(130,130,160,0.22)" strokeWidth="1" />
        ))}

        {/* ── Non-working day column fills ── */}
        {dayInfo.slice(0, totalDays).map(({ ds, hol, sat, sun, nonW }, i) => {
          const isHov = ds === hoverDay && !drag;
          const x = INFO_PANEL_W + i * DAY_WIDTH;
          let fill = "transparent";
          if (hol)                          fill = "rgba(239,68,68,0.20)";
          else if (sun)                     fill = "rgba(100,116,139,0.22)";
          else if (sat && !saturdayWorking) fill = "rgba(100,116,139,0.14)";
          if (isHov && !hol && !sun && !(sat && !saturdayWorking)) fill = "rgba(251,191,36,0.09)";
          if (fill === "transparent") return null;
          return (
            <rect key={`nw-${i}`} x={x} y={HEADER_HEIGHT} width={DAY_WIDTH} height={totalHeight - HEADER_HEIGHT}
              fill={fill} style={{ pointerEvents: "none" }} />
          );
        })}

        {/* Holiday vertical accent lines */}
        {dayInfo.slice(0, totalDays).map(({ ds, hol }, i) => {
          if (!hol) return null;
          const x = INFO_PANEL_W + i * DAY_WIDTH;
          return <line key={`hvl-${i}`} x1={x} y1={HEADER_HEIGHT} x2={x} y2={totalHeight}
            stroke="rgba(239,68,68,0.30)" strokeWidth="1.5" style={{ pointerEvents: "none" }} />;
        })}

        {/* ── Today line ── */}
        {todayX >= INFO_PANEL_W && todayX <= INFO_PANEL_W + chartWidth && (
          <line x1={todayX} y1={0} x2={todayX} y2={totalHeight}
            stroke="#ef4444" strokeWidth="2" strokeDasharray="4 3" opacity="0.65" />
        )}

        {/* ── Part bars ── */}
        {partsWithRow.map(({ part: p, rowIdx: ri }) => {
          const isDragging = drag?.partId === p.id;
          const effectiveStart = isDragging ? addDays(drag!.origStartDate, drag!.currentDeltaDays) : p.startDate;
          const y    = HEADER_HEIGHT + ri * ROW_HEIGHT;
          const barY = y + 6;
          const baseX = INFO_PANEL_W + daysBetween(minDate, effectiveStart) * DAY_WIDTH;
          const segs = getSegments(
            isDragging ? effectiveStart : p.startDate,
            isDragging ? addDays(effectiveStart, p.calendarDays) : p.endDate,
            holidays, saturdayWorking,
          );
          const totalW = p.calendarDays * DAY_WIDTH;
          const showLabel = totalW > 32;

          return (
            <g key={p.id}
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
              onMouseDown={e => handleBarMouseDown(e, p)}
              onMouseEnter={e => { if (!drag) { const pt = getSvgPt(e); setTooltip({ x: pt.x, y: pt.y, part: p }); setHoverDay(null); } }}
              onMouseLeave={() => !drag && setTooltip(null)}
              onClick={e => {
                e.stopPropagation();
                if (didDragRef.current) { didDragRef.current = false; return; }
                if (!drag) {
                  if (can("movePhases")) { setCorrectionHours("0"); setCorrectionDays("0"); setCorrectionPart(p); }
                  else setLocation(`/commesse/${p.orderId}`);
                }
              }}
              opacity={isDragging ? 0.3 : 1}
            >
              {segs.map((seg, si) => (
                <rect key={si}
                  x={baseX + seg.startDay * DAY_WIDTH + 2}
                  y={barY}
                  width={Math.max(seg.widthDays * DAY_WIDTH - 4, 4)}
                  height={barH}
                  fill={p.color} rx={3}
                  stroke={isDragging ? "white" : "rgba(255,255,255,0.18)"}
                  strokeWidth={isDragging ? 1.5 : 0.5}
                />
              ))}
              {showLabel && segs.length > 0 && (
                <>
                  <clipPath id={`clip-${p.id}`}>
                    <rect x={baseX + segs[0].startDay * DAY_WIDTH + 2} y={barY}
                      width={Math.max(totalW - 8, 0)} height={barH} />
                  </clipPath>
                  <text
                    x={baseX + segs[0].startDay * DAY_WIDTH + 8}
                    y={barY + barH / 2 + 4}
                    fontSize="10" fontFamily="monospace" fill="white"
                    clipPath={`url(#clip-${p.id})`}
                    style={{ pointerEvents: "none" }}
                  >{p.name}</text>
                </>
              )}
              {/* Badge sovrapposizione persona */}
              {overlapIds.has(p.id) && segs.length > 0 && (
                <g style={{ pointerEvents: "none" }}>
                  <circle
                    cx={baseX + segs[0].startDay * DAY_WIDTH + 2}
                    cy={barY}
                    r={7}
                    fill="#ef4444" stroke="white" strokeWidth={1.2}
                  />
                  <text
                    x={baseX + segs[0].startDay * DAY_WIDTH + 2}
                    y={barY + 3.5}
                    fontSize="10" fontWeight="bold" fill="white" textAnchor="middle"
                  >!</text>
                </g>
              )}
            </g>
          );
        })}

        {/* ── Buchi di produzione: giorni vuoti fra fasi già pianificate sulla
             stessa linea. Zona cliccabile: riapre la proposta di spostamento
             per chiuderlo. ── */}
        {gaps.map((g, gi) => {
          const { startRow, rowCount } = lineInfo[g.line];
          const y = HEADER_HEIGHT + startRow * ROW_HEIGHT;
          const h = rowCount * ROW_HEIGHT;
          const x = INFO_PANEL_W + daysBetween(minDate, g.startDate) * DAY_WIDTH;
          const w = daysBetween(g.startDate, g.endDate) * DAY_WIDTH;
          const midX = x + w / 2;
          const canResolve = can("movePhases");
          return (
            <g key={`gap-${gi}`}
              style={{ cursor: canResolve ? "pointer" : "default" }}
              onMouseUp={e => { if (!drag) e.stopPropagation(); }}
              onClick={e => { e.stopPropagation(); if (canResolve) handleGapClick(g); }}
            >
              <rect x={x} y={y} width={w} height={h}
                fill="rgba(249,115,22,0.18)" stroke="#f97316" strokeDasharray="4 3" strokeWidth={1.5} />
              <circle cx={midX} cy={y + h / 2} r={9} fill="#f97316" stroke="white" strokeWidth={1.2} />
              <text x={midX} y={y + h / 2 + 4} fontSize="12" fontWeight="bold" fill="white" textAnchor="middle"
                style={{ pointerEvents: "none" }}>!</text>
            </g>
          );
        })}

        {/* ── Colonne informative per riga: N° commessa, N° spedizione, date fase ── */}
        {partsWithRow.map(({ part: p, rowIdx: ri }) => {
          const order = orderById.get(p.orderId);
          const y = HEADER_HEIGHT + ri * ROW_HEIGHT;
          const midY = y + ROW_HEIGHT / 2 + 4;
          const fmtDate = (d: Date) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
          const canEditDate = can("movePhases");
          return (
            <g key={`info-${p.id}`}>
              <text x={COL_COMMESSA_X + COL_COMMESSA_W / 2} y={midY} fontSize="10" fontFamily="monospace"
                fontWeight="bold" fill="hsl(var(--primary))" textAnchor="middle" style={{ pointerEvents: "none" }}>
                {order?.orderNumber || "—"}
              </text>
              <text x={COL_SPEDIZIONE_X + COL_SPEDIZIONE_W / 2} y={midY} fontSize="9" fontFamily="monospace"
                fill="hsl(var(--muted-foreground))" textAnchor="middle" style={{ pointerEvents: "none" }}>
                {shippingListOf(p.lotName) ?? "—"}
              </text>
              <text x={COL_INIZIO_X + COL_DATA_W / 2} y={midY} fontSize="9" fontFamily="monospace"
                fill={canEditDate ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} textAnchor="middle"
                textDecoration={canEditDate ? "underline" : undefined}
                style={{ cursor: canEditDate ? "pointer" : "default" }}
                onClick={e => {
                  e.stopPropagation();
                  if (!canEditDate) return;
                  setDateEdit({ partId: p.id, x: COL_INIZIO_X, y, value: formatISODate(p.startDate) });
                }}
              >
                {fmtDate(p.startDate)}
              </text>
              <text x={COL_FINE_X + COL_DATA_W / 2} y={midY} fontSize="9" fontFamily="monospace"
                fill="hsl(var(--muted-foreground))" textAnchor="middle" style={{ pointerEvents: "none" }}>
                {fmtDate(p.endDate)}
              </text>
            </g>
          );
        })}

        {/* ── Ghost bar while dragging ── */}
        {drag && (() => {
          const pr = partsWithRow.find(x => x.part.id === drag.partId);
          if (!pr) return null;
          const p = pr.part;
          const ghostStart = addDays(drag.origStartDate, drag.currentDeltaDays);
          const ghostX  = INFO_PANEL_W + daysBetween(minDate, ghostStart) * DAY_WIDTH;
          const ghostRi = getGhostRow(drag.partId, drag.currentLine);
          const ghostY  = HEADER_HEIGHT + ghostRi * ROW_HEIGHT + 6;
          const segs = getSegments(ghostStart, addDays(ghostStart, p.calendarDays), holidays, saturdayWorking);
          return (
            <g style={{ pointerEvents: "none" }}>
              {segs.map((seg, si) => (
                <rect key={si}
                  x={ghostX + seg.startDay * DAY_WIDTH + 2} y={ghostY}
                  width={Math.max(seg.widthDays * DAY_WIDTH - 4, 4)} height={barH}
                  fill={p.color} rx={3} opacity={0.85} stroke="white" strokeWidth={1.5} />
              ))}
            </g>
          );
        })()}

        {/* ── Line group highlight on drag target ── */}
        {drag && (() => {
          const { startRow, rowCount } = lineInfo[drag.currentLine];
          const ly = HEADER_HEIGHT + startRow * ROW_HEIGHT;
          const lh = rowCount * ROW_HEIGHT;
          return (
            <rect x={INFO_PANEL_W} y={ly} width={chartWidth} height={lh}
              fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)"
              strokeWidth="1.5" rx={2} style={{ pointerEvents: "none" }} />
          );
        })()}

        {/* ── HEADER (on top) ── */}
        <rect x={0} y={0} width={INFO_PANEL_W + chartWidth} height={HEADER_HEIGHT}
          fill="hsl(var(--card))" opacity="0.96" />
        <line x1={0} y1={HEADER_HEIGHT} x2={INFO_PANEL_W + chartWidth} y2={HEADER_HEIGHT}
          stroke="hsl(var(--border))" strokeWidth="1.5" />

        {/* ── Colonne informative: N° Commessa, N° Spedizione, Data Inizio/Fine
             (una per riga/fase, fra l'etichetta di linea e il Gantt) ── */}
        {[COL_SPEDIZIONE_X, COL_INIZIO_X, COL_FINE_X, INFO_PANEL_W].map(x => (
          <line key={`infocol-${x}`} x1={x} y1={0} x2={x} y2={totalHeight}
            stroke="hsl(var(--border))" strokeWidth="1" opacity={0.5} />
        ))}
        {[
          { x: COL_COMMESSA_X,   w: COL_COMMESSA_W,   label: "COMMESSA" },
          { x: COL_SPEDIZIONE_X, w: COL_SPEDIZIONE_W, label: "SPEDIZ." },
          { x: COL_INIZIO_X,     w: COL_DATA_W,        label: "INIZIO" },
          { x: COL_FINE_X,       w: COL_DATA_W,        label: "FINE" },
        ].map(c => (
          <text key={c.label} x={c.x + c.w / 2} y={HEADER_HEIGHT - 6} fontSize="8" fontFamily="monospace"
            fontWeight="bold" fill="hsl(var(--muted-foreground))" textAnchor="middle"
            style={{ textTransform: "uppercase" }}>
            {c.label}
          </text>
        ))}

        {/* Month + day labels in header: ogni colonna mostra iniziale giorno
            settimana (L, M, M, G, V, S, D) sopra e data gg/mm sotto */}
        {(() => {
          let prevMonth = "";
          return dayInfo.slice(0, totalDays).map(({ d, hol }, i) => {
            const isToday = d.toDateString() === today.toDateString();
            const isMonday = d.getDay() === 1;
            const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
            const isNewMonth = monthKey !== prevMonth;
            if (isNewMonth) prevMonth = monthKey;
            const x = INFO_PANEL_W + i * DAY_WIDTH;
            const textColor = isToday ? "#ef4444" : hol ? "#f87171" : "hsl(var(--muted-foreground))";
            return (
              <g key={`hdr-${i}`}>
                {isNewMonth && (
                  <text x={x + 3} y={9} fontSize="8" fontFamily="monospace" fontWeight="bold"
                    fill="rgba(255,255,255,0.35)" style={{ textTransform: "uppercase" }}>
                    {d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" })}
                  </text>
                )}
                <line x1={x} y1={0} x2={x} y2={HEADER_HEIGHT}
                  stroke="hsl(var(--border))" strokeWidth={isMonday ? 1 : 0.5} opacity={0.6} />
                <text x={x + DAY_WIDTH / 2} y={26} fontSize="10" fontFamily="monospace"
                  textAnchor="middle" fill={textColor} fontWeight={isToday ? "bold" : "normal"}>
                  {d.toLocaleDateString("it-IT", { weekday: "narrow" })}
                </text>
                <text x={x + DAY_WIDTH / 2} y={40} fontSize="9" fontFamily="monospace"
                  textAnchor="middle" fill={textColor} fontWeight={isToday ? "bold" : "normal"}>
                  {d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                </text>
              </g>
            );
          });
        })()}

        {/* Holiday name snippets in header */}
        {dayInfo.slice(0, totalDays).map(({ ds, hol }, i) => {
          if (!hol) return null;
          const h = holidays.find(h => h.recurring ? h.date.slice(5) === ds.slice(5) : h.date === ds);
          if (!h) return null;
          const x = INFO_PANEL_W + i * DAY_WIDTH + DAY_WIDTH / 2;
          return (
            <text key={`hlbl-${i}`} x={x} y={HEADER_HEIGHT - 4} fontSize="8" fontFamily="monospace"
              fill="#f87171" textAnchor="middle" style={{ pointerEvents: "none" }}>
              {h.name.length > 9 ? h.name.slice(0, 8) + "…" : h.name}
            </text>
          );
        })}

        {/* ── LEFT: Line group labels (spanning rows) ── */}
        {LINES.map(line => {
          const { startRow, rowCount } = lineInfo[line];
          const labelY = HEADER_HEIGHT + startRow * ROW_HEIGHT;
          const labelH = rowCount * ROW_HEIGHT;
          return (
            <g key={line}>
              {/* Strong separator between line groups */}
              <line x1={0} y1={labelY} x2={INFO_PANEL_W + chartWidth} y2={labelY}
                stroke="hsl(var(--border))" strokeWidth="1.5" />
              {/* Label background */}
              <rect x={0} y={labelY} width={LINE_LABEL_W} height={labelH} fill="hsl(var(--muted))" />
              {/* Right border of label column */}
              <line x1={LINE_LABEL_W} y1={labelY} x2={LINE_LABEL_W} y2={labelY + labelH}
                stroke="hsl(var(--border))" strokeWidth="1" />
              {/* Line name — centered vertically */}
              <text x={LINE_LABEL_W / 2} y={labelY + labelH / 2 + 5}
                fontSize="14" fontFamily="monospace" fontWeight="bold"
                fill="hsl(var(--primary))" textAnchor="middle">{line}</text>
              {/* Empty line hint */}
              {rowCount === 1 && partsWithRow.filter(pr => pr.part.line === line).length === 0 && (
                <text x={LINE_LABEL_W + 8} y={labelY + labelH / 2 + 4}
                  fontSize="10" fontFamily="monospace" fill="hsl(var(--muted-foreground))" opacity={0.5}>
                  vuota
                </text>
              )}
            </g>
          );
        })}

        {/* Bottom border */}
        <line x1={0} y1={totalHeight} x2={INFO_PANEL_W + chartWidth} y2={totalHeight}
          stroke="hsl(var(--border))" strokeWidth="1" />
      </svg>

      {/* ── Tooltip ── */}
      {tooltip && !drag && (
        <div className="absolute z-50 pointer-events-none bg-popover border border-border rounded shadow-lg p-3 text-xs font-mono max-w-[260px]"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <div className="font-bold text-foreground mb-1">{tooltip.part.name}</div>
          <div className="text-muted-foreground">Commessa: <span className="text-foreground">{tooltip.part.orderName}</span></div>
          <div className="text-muted-foreground">Lotto: <span className="text-foreground">{tooltip.part.lotName}</span></div>
          <div className="text-muted-foreground">Linea: <span className="text-primary font-bold">{tooltip.part.line}</span></div>
          <div className="text-muted-foreground">Skill: <span className="text-foreground">{tooltip.part.requiredSkill}</span></div>
          <div className="text-muted-foreground">Giorni lavorativi: <span className="text-foreground">{tooltip.part.workingDays}</span></div>
          <div className="text-muted-foreground">Giorni calendario: <span className="text-amber-400">{tooltip.part.calendarDays}</span></div>
          {(tooltip.part.adjustment ?? 0) !== 0 && (
            <div className="text-muted-foreground">Variazione: <span className={tooltip.part.adjustment! > 0 ? "text-amber-400" : "text-green-400"}>
              {tooltip.part.adjustment! > 0 ? "+" : ""}{tooltip.part.adjustment}%
            </span></div>
          )}
          <div className="text-[10px] text-primary/60 mt-1">
            {can("movePhases") ? "Trascina · click per correggere ore/giorni" : "Trascina · click per aprire"}
          </div>
        </div>
      )}

      {/* ── Hover day hint ── */}
      {hoverDay && !drag && !tooltip && (() => {
        const hd = new Date(hoverDay + "T00:00:00");
        if (isWeekend(hd, true)) return null;
        const x = INFO_PANEL_W + daysBetween(minDate, hd) * DAY_WIDTH;
        return (
          <div className="absolute z-50 pointer-events-none bg-popover border border-border rounded px-2 py-1 text-[10px] font-mono"
            style={{ left: x + 4, top: HEADER_HEIGHT + 4 }}>
            {nonWorkingSet.has(hoverDay)
              ? <span className="text-red-400">Click → rimuovi chiusura</span>
              : <span className="text-amber-400">Click → aggiungi chiusura</span>}
          </div>
        );
      })()}

      {/* ── Editing inline data inizio (click sulla colonna Inizio) ── */}
      {dateEdit && (
        <div className="absolute z-50 bg-popover border border-primary rounded shadow-lg p-1.5 flex flex-col gap-1"
          style={{ left: dateEdit.x, top: dateEdit.y }}>
          <input
            type="date"
            autoFocus
            value={dateEdit.value}
            onChange={e => setDateEdit({ ...dateEdit, value: e.target.value })}
            onKeyDown={e => {
              if (e.key === "Enter") commitDateEdit();
              if (e.key === "Escape") setDateEdit(null);
            }}
            className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1"
            style={{ width: COL_COMMESSA_W + COL_SPEDIZIONE_W }}
            data-testid="input-inline-start-date"
          />
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setDateEdit(null)}>Annulla</Button>
            <Button size="sm" className="h-6 text-[10px] px-2" onClick={commitDateEdit} data-testid="button-save-inline-date">Ok</Button>
          </div>
        </div>
      )}

      {/* ── Dialog correzione ore/giorni (click sulla fase) ── */}
      <Dialog open={!!correctionPart} onOpenChange={o => !o && setCorrectionPart(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Correggi Fase</DialogTitle></DialogHeader>
          {correctionPart && (() => {
            const hoursDelta = parseFloat(correctionHours) || 0;
            const daysDelta = parseFloat(correctionDays) || 0;
            const resultHours = Math.max(1, correctionPart.estimatedHours + hoursDelta + daysDelta * DAY_HOURS);
            return (
              <div className="flex flex-col gap-4 py-2">
                <div className="text-sm">
                  <span className="font-bold">{correctionPart.name}</span>
                  <span className="text-muted-foreground"> — {correctionPart.orderName} / {correctionPart.lotName}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Correzione ore (± ore)</Label>
                    <Input type="number" step="0.5" value={correctionHours}
                      onChange={e => setCorrectionHours(e.target.value)} data-testid="input-correction-hours" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Correzione giorni lavorativi (± gg)</Label>
                    <Input type="number" step="1" value={correctionDays}
                      onChange={e => setCorrectionDays(e.target.value)} data-testid="input-correction-days" />
                  </div>
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  Ore attuali: {correctionPart.estimatedHours}h → Risultanti:{" "}
                  <span className="text-primary font-bold">{resultHours}h</span>
                </p>
                <div className="flex items-center justify-between pt-2">
                  <button type="button" className="text-xs text-primary underline"
                    onClick={() => { setLocation(`/commesse/${correctionPart.orderId}`); setCorrectionPart(null); }}>
                    Apri dettaglio commessa →
                  </button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCorrectionPart(null)}>Annulla</Button>
                    <Button onClick={applyCorrection} data-testid="button-apply-correction">Applica</Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Dialog proposta nuove date (drag con impatto su altre fasi, o click
           su un buco di produzione già presente) ── */}
      <Dialog open={!!cascadeProposal} onOpenChange={o => !o && setCascadeProposal(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Verifica spostamento — Linea {cascadeProposal?.line}</DialogTitle>
          </DialogHeader>
          {cascadeProposal && (() => {
            const isDrag = cascadeProposal.context === "drag";
            const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
            return (
              <div className="flex flex-col gap-4 py-2">
                <p className="text-xs text-muted-foreground">
                  {isDrag
                    ? "Lo spostamento è già stato applicato. Se serve, correggi qui sotto la data della fase appena spostata o di altre fasi impattate sulla stessa linea (accodamento automatico)."
                    : "Correggi se necessario la data di inizio proposta per chiudere il buco di produzione."}
                </p>
                {cascadeGaps.length > 0 && (
                  <div className="flex flex-col gap-1 bg-amber-500/10 border border-amber-500/40 rounded p-2">
                    {cascadeGaps.map((g, i) => (
                      <div key={i} className="text-xs text-amber-400 flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold shrink-0">!</span>
                        Con queste date resta un buco di produzione sulla linea {cascadeProposal.line} dal{" "}
                        {g.startDate.toLocaleDateString("it-IT")} al {addDays(g.endDate, -1).toLocaleDateString("it-IT")}.
                      </div>
                    ))}
                  </div>
                )}
                <div className="max-h-72 overflow-y-auto border border-border rounded">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted text-muted-foreground uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Fase</th>
                        <th className="px-3 py-2">Attuale</th>
                        <th className="px-3 py-2">Proposta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cascadeProposal.rows.map((row, i) => (
                        <tr key={row.partId} className="border-t border-border">
                          <td className="px-3 py-2">
                            <div className="font-bold">{row.name}</div>
                            <div className="text-muted-foreground">{row.orderName} / {row.lotName}</div>
                            {row.newLine && row.newLine !== row.prevLine && (
                              <div className="text-primary">{row.prevLine} → {row.newLine}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{fmt(row.currentDate)}</td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={row.proposedDate}
                              onChange={e => {
                                const v = e.target.value;
                                setCascadeProposal(prev => prev
                                  ? { ...prev, rows: prev.rows.map((r, ri) => ri === i ? { ...r, proposedDate: v } : r) }
                                  : prev);
                              }}
                              className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1"
                              data-testid={`input-cascade-date-${i}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setCascadeProposal(null)} data-testid="button-cascade-cancel">
                    {isDrag ? "Chiudi" : "Annulla"}
                  </Button>
                  <Button
                    onClick={() => { applyCascadeRows(cascadeProposal.rows); setCascadeProposal(null); }}
                    data-testid="button-cascade-confirm"
                  >
                    {isDrag ? "Fissa queste date" : "Applica"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
