import { useState } from "react";
import { Employee, SkillTag } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, ArrowRightLeft, UserPlus, UserMinus, Sparkles } from "lucide-react";

interface SmartStaffingProps {
  allEmployees: Employee[];
  requiredSkill: SkillTag;
  estimatedHours: number;
  adjustment?: number;
  assignedIds: string[];
  onChange: (newIds: string[]) => void;
  /** Ore già a carico di ciascun dipendente sull'intero piano (per bilanciare). */
  loadByEmployeeId?: Record<string, number>;
}

interface AddSuggestion {
  kind: "add";
  emp: Employee;
  newIds: string[];
  newDuration: number;
  saving: number;
}

interface SwapSuggestion {
  kind: "swap";
  from: Employee;
  to: Employee;
  newIds: string[];
  newDuration: number;
  saving: number;
  extraSkills: string[];
}

interface RemoveSuggestion {
  kind: "remove";
  emp: Employee;
  newIds: string[];
  newDuration: number;
  cost: number; // positive = adds days
}

type Suggestion = AddSuggestion | SwapSuggestion | RemoveSuggestion;

const PALETTE = [
  "bg-orange-500/20 text-orange-400",
  "bg-red-500/20 text-red-400",
  "bg-blue-500/20 text-blue-400",
  "bg-purple-500/20 text-purple-400",
  "bg-green-500/20 text-green-400",
  "bg-cyan-500/20 text-cyan-400",
  "bg-pink-500/20 text-pink-400",
  "bg-amber-500/20 text-amber-400",
];
function skillBadge(skill: string, allSkills: string[]) {
  const idx = allSkills.indexOf(skill);
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
}

export default function SmartStaffing({
  allEmployees,
  requiredSkill,
  estimatedHours,
  adjustment = 0,
  assignedIds,
  onChange,
  loadByEmployeeId,
}: SmartStaffingProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const effectiveHours = estimatedHours * (1 + adjustment / 100);
  const allSkills = Array.from(new Set(allEmployees.flatMap(e => e.skills)));
  const loadOf = (id: string) => loadByEmployeeId?.[id] ?? 0;

  const eligibleEmployees = allEmployees.filter(e => e.skills.includes(requiredSkill));

  // C2 — dipendente idoneo, non assegnato, con minor carico globale
  const leastLoaded = eligibleEmployees
    .filter(e => !assignedIds.includes(e.id))
    .sort((a, b) => loadOf(a.id) - loadOf(b.id))[0];

  const computeDuration = (ids: string[]) =>
    ids.length === 0
      ? Math.max(1, Math.ceil(effectiveHours / 8))
      : Math.max(1, Math.ceil(effectiveHours / (8 * ids.length)));

  const currentDuration = computeDuration(assignedIds);

  const assignedEmps  = assignedIds.map(id => allEmployees.find(e => e.id === id)).filter(Boolean) as Employee[];
  const eligibleExtra = eligibleEmployees.filter(e => !assignedIds.includes(e.id)); // qualified but not assigned
  const ineligibleAssigned = assignedEmps.filter(e => !e.skills.includes(requiredSkill)); // assigned but missing skill

  // ── Build suggestions ────────────────────────────────────────────────────
  const suggestions: Suggestion[] = [];

  // 1. Add each eligible unassigned employee
  eligibleExtra.forEach(emp => {
    const newIds = [...assignedIds, emp.id];
    const newDuration = computeDuration(newIds);
    const saving = currentDuration - newDuration;
    suggestions.push({ kind: "add", emp, newIds, newDuration, saving });
  });

  // 2. Swap each assigned employee with each eligible unassigned
  assignedEmps.forEach(from => {
    eligibleExtra.forEach(to => {
      const newIds = assignedIds.map(id => id === from.id ? to.id : id);
      const newDuration = computeDuration(newIds);
      const saving = currentDuration - newDuration;
      const extraSkills = to.skills.filter(s => s !== requiredSkill && !from.skills.includes(s));
      suggestions.push({ kind: "swap", from, to, newIds, newDuration, saving, extraSkills });
    });
  });

  // 3. Remove each assigned employee (only if ≥2 assigned)
  if (assignedEmps.length >= 2) {
    assignedEmps.forEach(emp => {
      const newIds = assignedIds.filter(id => id !== emp.id);
      const newDuration = computeDuration(newIds);
      const cost = newDuration - currentDuration;
      suggestions.push({ kind: "remove", emp, newIds, newDuration, cost });
    });
  }

  // Sort: improvements first (biggest saving), then neutral, then worsening
  const sorted = [...suggestions].sort((a, b) => {
    const scoreA = a.kind === "remove" ? -a.cost : (a as AddSuggestion | SwapSuggestion).saving;
    const scoreB = b.kind === "remove" ? -b.cost : (b as AddSuggestion | SwapSuggestion).saving;
    return scoreB - scoreA;
  });

  const hasSuggestions = sorted.length > 0;
  const improvingSuggestions = sorted.filter(s =>
    s.kind !== "remove" && (s as AddSuggestion | SwapSuggestion).saving > 0
  );

  const applySuggestion = (s: Suggestion) => {
    onChange(s.newIds);
  };

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...assignedIds, id] : assignedIds.filter(a => a !== id));

  return (
    <div className="flex flex-col gap-3">
      {/* ── Duration bar ── */}
      <div className="flex items-center justify-between bg-muted/50 p-2 rounded border border-border">
        <span className="text-xs uppercase text-muted-foreground font-mono">Durata Stimata</span>
        <span className="text-sm font-bold font-mono text-primary">
          {currentDuration} {currentDuration === 1 ? "giorno" : "giorni"}
        </span>
      </div>

      {/* ── Warning: assigned employee missing skill ── */}
      {ineligibleAssigned.length > 0 && (
        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
          ⚠ {ineligibleAssigned.map(e => e.name).join(", ")} {ineligibleAssigned.length === 1 ? "non ha" : "non hanno"} la competenza <span className="font-bold">{requiredSkill}</span>
        </div>
      )}

      {/* ── Eligible employees checklist ── */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="text-xs uppercase text-muted-foreground font-mono">
          Personale Idoneo — <span className="text-foreground">{requiredSkill}</span>
          <span className="ml-2 normal-case">({eligibleEmployees.length} disponibili)</span>
        </div>
        {loadByEmployeeId && leastLoaded && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2 shrink-0"
            onClick={() => onChange([...assignedIds, leastLoaded.id])}
            title={`${leastLoaded.name} — ${loadOf(leastLoaded.id).toFixed(0)}h a carico`}
            data-testid="button-assign-least-loaded"
          >
            <Sparkles size={11} className="mr-1 text-amber-400" /> Meno carico: {leastLoaded.name.split(" ")[0]}
          </Button>
        )}
      </div>

      {eligibleEmployees.length === 0 ? (
        <div className="text-sm text-destructive italic">Nessun dipendente con competenza: {requiredSkill}</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
          {eligibleEmployees.map(emp => {
            const isAssigned = assignedIds.includes(emp.id);
            const withoutThis = computeDuration(assignedIds.filter(id => id !== emp.id));
            const withThis    = computeDuration([...assignedIds.filter(id => id !== emp.id), emp.id]);
            const delta       = isAssigned
              ? computeDuration(assignedIds.filter(id => id !== emp.id)) - currentDuration // if removed
              : currentDuration - computeDuration([...assignedIds, emp.id]);               // if added

            return (
              <div key={emp.id}
                className={`flex items-center gap-2 p-1.5 rounded border transition-colors ${isAssigned ? "border-primary/30 bg-primary/5" : "border-transparent"}`}>
                <Checkbox
                  id={`emp-${emp.id}`}
                  checked={isAssigned}
                  onCheckedChange={v => toggle(emp.id, v as boolean)}
                />
                <Label htmlFor={`emp-${emp.id}`} className="text-sm cursor-pointer flex-1">{emp.name}</Label>
                {loadByEmployeeId && (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0" title="ore a carico sul piano">
                    {loadOf(emp.id).toFixed(0)}h
                  </span>
                )}
                {/* Other skills */}
                <div className="flex gap-1 flex-wrap">
                  {emp.skills.filter(s => s !== requiredSkill).map(s => (
                    <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${skillBadge(s, allSkills)}`}>{s}</span>
                  ))}
                </div>
                {/* Impact badge */}
                {!isAssigned && delta > 0 && (
                  <span className="text-[10px] font-mono text-green-400 shrink-0">−{delta}g</span>
                )}
                {isAssigned && assignedIds.length > 1 && delta > 0 && (
                  <span className="text-[10px] font-mono text-amber-400 shrink-0">+{delta}g se tolto</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Suggestions panel ── */}
      {hasSuggestions && (
        <div className="border border-border rounded overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/60 transition-colors text-xs font-bold uppercase tracking-widest"
            onClick={() => setShowSuggestions(v => !v)}
          >
            <span className="flex items-center gap-2">
              <Sparkles size={12} className={improvingSuggestions.length > 0 ? "text-amber-400" : "text-muted-foreground"} />
              <span className={improvingSuggestions.length > 0 ? "text-amber-400" : "text-muted-foreground"}>
                Proposte di Cambio Personale
              </span>
              {improvingSuggestions.length > 0 && (
                <span className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-mono normal-case">
                  {improvingSuggestions.length} miglioramento{improvingSuggestions.length > 1 ? "i" : ""}
                </span>
              )}
            </span>
            {showSuggestions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showSuggestions && (
            <div className="flex flex-col divide-y divide-border max-h-64 overflow-y-auto">
              {sorted.map((s, i) => {
                if (s.kind === "add") {
                  return (
                    <SuggestionRow key={i} type="add"
                      icon={<UserPlus size={13} className="text-green-400 shrink-0" />}
                      label={<>Aggiungi <span className="text-foreground font-bold">{s.emp.name}</span></>}
                      impact={s.saving > 0
                        ? <span className="text-green-400 font-mono">−{s.saving}g ({currentDuration}→{s.newDuration})</span>
                        : <span className="text-muted-foreground font-mono">stessa durata</span>}
                      extraSkills={s.emp.skills.filter(sk => sk !== requiredSkill)}
                      allSkills={allSkills}
                      onApply={() => applySuggestion(s)}
                    />
                  );
                }
                if (s.kind === "swap") {
                  return (
                    <SuggestionRow key={i} type="swap"
                      icon={<ArrowRightLeft size={13} className={s.saving > 0 ? "text-blue-400 shrink-0" : "text-muted-foreground shrink-0"} />}
                      label={<>Sostituisci <span className="text-foreground font-bold">{s.from.name}</span> con <span className="text-foreground font-bold">{s.to.name}</span></>}
                      impact={s.saving > 0
                        ? <span className="text-green-400 font-mono">−{s.saving}g ({currentDuration}→{s.newDuration})</span>
                        : s.saving === 0
                          ? <span className="text-muted-foreground font-mono">stessa durata</span>
                          : <span className="text-red-400 font-mono">+{-s.saving}g ({currentDuration}→{s.newDuration})</span>}
                      extraSkills={s.extraSkills}
                      allSkills={allSkills}
                      onApply={() => applySuggestion(s)}
                    />
                  );
                }
                if (s.kind === "remove") {
                  return (
                    <SuggestionRow key={i} type="remove"
                      icon={<UserMinus size={13} className="text-red-400 shrink-0" />}
                      label={<>Rimuovi <span className="text-foreground font-bold">{s.emp.name}</span></>}
                      impact={<span className="text-amber-400 font-mono">+{s.cost}g ({currentDuration}→{s.newDuration})</span>}
                      extraSkills={[]}
                      allSkills={allSkills}
                      onApply={() => applySuggestion(s)}
                    />
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Suggestion row ─────────────────────────────────────────────────────────

function SuggestionRow({
  icon,
  label,
  impact,
  extraSkills,
  allSkills,
  onApply,
}: {
  type: "add" | "swap" | "remove";
  icon: React.ReactNode;
  label: React.ReactNode;
  impact: React.ReactNode;
  extraSkills: string[];
  allSkills: string[];
  onApply: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/20 text-xs">
      {icon}
      <div className="flex-1 flex flex-wrap items-center gap-1 min-w-0">
        <span className="text-muted-foreground">{label}</span>
        {extraSkills.length > 0 && (
          <>
            <span className="text-muted-foreground/50 text-[9px]">anche:</span>
            {extraSkills.map(s => (
              <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${PALETTE[allSkills.indexOf(s) % PALETTE.length] ?? PALETTE[0]}`}>{s}</span>
            ))}
          </>
        )}
      </div>
      <span className="shrink-0">{impact}</span>
      <Button type="button" size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0" onClick={onApply}>
        Applica
      </Button>
    </div>
  );
}
