import * as XLSX from "xlsx";
import { Order, Holiday, Employee, CatalogPhase, formatISODate, computeEffectiveHours } from "@/types";
import { computeScheduledParts, overlapAllowedCodesOf } from "./schedule";

const STATUS_LABEL: Record<string, string> = {
  pending: "In attesa",
  "in-progress": "In lavorazione",
  done: "Completata",
};

/** Esporta il piano di produzione schedulato come file .xlsx. */
export function exportPlanXlsx(
  orders: Order[],
  holidays: Holiday[],
  saturdayWorking: boolean,
  employees: Employee[],
  catalogPhases: CatalogPhase[] = [],
): void {
  const parts = computeScheduledParts(orders, holidays, saturdayWorking, undefined, overlapAllowedCodesOf(catalogPhases));
  const orderNumber = (id: string) => orders.find((o) => o.id === id)?.orderNumber ?? "";
  const empName = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  const rows = parts.map((p) => ({
    Commessa: p.orderName,
    "N. Commessa": orderNumber(p.orderId),
    Lotto: p.lotName,
    Fase: p.name,
    Skill: p.requiredSkill,
    Linea: p.line,
    Stato: STATUS_LABEL[p.status] ?? p.status,
    "Ore stimate": Number(computeEffectiveHours(p).toFixed(1)),
    "Giorni lavorativi": p.workingDays,
    Inizio: formatISODate(p.startDate),
    Fine: formatISODate(p.endDate),
    Assegnati: p.assignedEmployeeIds.map(empName).join(", "),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 14 },
    { wch: 7 }, { wch: 14 }, { wch: 11 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Piano");
  XLSX.writeFile(wb, `piano-produzione-${formatISODate(new Date())}.xlsx`);
}
