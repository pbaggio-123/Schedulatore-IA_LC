import { useMemo, useRef, useState, useCallback } from "react";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useAuth } from "@/hooks/useAuth";
import { addAuditEntry } from "@/hooks/useAuditLog";
import {
  formatISODate, isHoliday, isWeekend, isNonWorkingDay, Holiday,
} from "@/types";
import { computeScheduledParts, findEmployeeOverlaps, overlappingPartIds, phaseCodeOf, ScheduledPart } from "@/lib/schedule";
import { useLocation } from "wouter";

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

  // Lookup commessa per id, per le colonne informative a sinistra del Gantt.
  const orderById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);

  // ── Compute layout ──────────────────────────────────────────────────────────
  const { partsWithRow, lineInfo, totalRows, minDate, maxDate } = useMemo(() => {
    // Colori scelti a mano per codice fase (Catalogo → campo colore). Vincono sul
    // colore automatico generato dal codice.
    const phaseColors: Record<string, string> = {};
    catalogPhases.forEach(ph => { if (ph.color) phaseColors[phaseCodeOf(ph.name)] = ph.color; });
    const finalParts: GanttPart[] = computeScheduledParts(orders, holidays, saturdayWorking, phaseColors);

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

  const commitDrag = useCallback((d: DragState) => {
    const newStart = addDays(d.origStartDate, d.currentDeltaDays);
    const lineChanged = d.currentLine !== d.origLine;
    const dateChanged = d.currentDeltaDays !== 0;
    if (!lineChanged && !dateChanged) return; // semplice click, niente da fare

    const partName = partsWithRow.find(x => x.part.id === d.partId)?.part.name ?? d.partId;
    setOrders(prev => prev.map(o => o.id !== d.orderId ? o : {
      ...o, lots: o.lots.map(l => l.id !== d.lotId ? l : {
        ...l, parts: l.parts.map(p => p.id !== d.partId ? p : {
          ...p, line: d.currentLine, manualStartDate: formatISODate(newStart),
        }),
      }),
    }));

    // registra lo spostamento (Gantt → registro condiviso)
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
        field: "Inizio", previousValue: formatISODate(d.origStartDate), newValue: formatISODate(newStart),
        notes: "Spostata via Gantt",
      });
    }
  }, [setOrders, partsWithRow]);

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
                if (!drag) setLocation(`/commesse/${p.orderId}`);
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

        {/* ── Colonne informative per riga: N° commessa, N° spedizione, date fase ── */}
        {partsWithRow.map(({ part: p, rowIdx: ri }) => {
          const order = orderById.get(p.orderId);
          const y = HEADER_HEIGHT + ri * ROW_HEIGHT;
          const midY = y + ROW_HEIGHT / 2 + 4;
          const fmtDate = (d: Date) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
          return (
            <g key={`info-${p.id}`} style={{ pointerEvents: "none" }}>
              <text x={COL_COMMESSA_X + COL_COMMESSA_W / 2} y={midY} fontSize="10" fontFamily="monospace"
                fontWeight="bold" fill="hsl(var(--primary))" textAnchor="middle">
                {order?.orderNumber || "—"}
              </text>
              <text x={COL_SPEDIZIONE_X + COL_SPEDIZIONE_W / 2} y={midY} fontSize="9" fontFamily="monospace"
                fill="hsl(var(--muted-foreground))" textAnchor="middle">
                {order?.shippingList || "—"}
              </text>
              <text x={COL_INIZIO_X + COL_DATA_W / 2} y={midY} fontSize="9" fontFamily="monospace"
                fill="hsl(var(--muted-foreground))" textAnchor="middle">
                {fmtDate(p.startDate)}
              </text>
              <text x={COL_FINE_X + COL_DATA_W / 2} y={midY} fontSize="9" fontFamily="monospace"
                fill="hsl(var(--muted-foreground))" textAnchor="middle">
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
          <div className="text-[10px] text-primary/60 mt-1">Trascina · click per aprire</div>
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
    </div>
  );
}
