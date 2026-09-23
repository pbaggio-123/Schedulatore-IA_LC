import { useLocalStorage } from "./useLocalStorage";
import { Order, Employee, Holiday, CatalogPhase, CatalogProduct, AfanEntry } from "../types";
import { initialAfanEntries } from "../data/afanSeed";

// Dati IALC serramenti reali (roster + catalogo lavorazioni). Le competenze,
// le fasi standard e i dipendenti rispecchiano gli screen forniti dal cliente.
// I dipendenti portano il codice matricola tra parentesi nel nome.
const initialEmployees: Employee[] = [
  { id: "e1",  name: "Cappellari Francesco (049)",   skills: ["Programmi", "CNC"] },
  { id: "e2",  name: "Lando Luca (116)",             skills: ["Taglio Alluminio", "Rullatura e Pellicolatura"] },
  { id: "e3",  name: "Mezzalira Davide (133)",       skills: ["Taglio Alluminio", "Rullatura e Pellicolatura"] },
  { id: "e4",  name: "Nazifoski Ilhan (339)",        skills: ["Taglio Alluminio", "CNC"] },
  { id: "e5",  name: "Dalla Pria Davide (022)",      skills: ["Assemblaggio"] },
  { id: "e6",  name: "Cerato Davide (043)",          skills: ["Assemblaggio"] },
  { id: "e7",  name: "Ceccato Christian (075)",      skills: ["Assemblaggio"] },
  { id: "e8",  name: "Lanzarini Roberto (288)",      skills: ["Assemblaggio"] },
  { id: "e9",  name: "Fraccaro Alessandro (149)",    skills: ["Assemblaggio"] },
  { id: "e10", name: "Parolin Fabio (153)",          skills: ["Assemblaggio"] },
  { id: "e11", name: "Lessio Alberto Giovanni (295)", skills: ["CNC"] },
];

const year = new Date().getFullYear();

// Nessuna commessa demo: le commesse reali vengono create/importate dal cliente.
const initialOrders: Order[] = [];

const initialHolidays: Holiday[] = [
  { id: "h01", date: `${year}-01-01`, name: "Capodanno",              recurring: true },
  { id: "h02", date: `${year}-01-06`, name: "Epifania",               recurring: true },
  { id: "h03", date: `${year}-04-25`, name: "Liberazione",            recurring: true },
  { id: "h04", date: `${year}-05-01`, name: "Festa del Lavoro",       recurring: true },
  { id: "h05", date: `${year}-06-02`, name: "Festa della Repubblica", recurring: true },
  { id: "h06", date: `${year}-08-15`, name: "Ferragosto",             recurring: true },
  { id: "h07", date: `${year}-11-01`, name: "Ognissanti",             recurring: true },
  { id: "h08", date: `${year}-12-08`, name: "Immacolata",             recurring: true },
  { id: "h09", date: `${year}-12-25`, name: "Natale",                 recurring: true },
  { id: "h10", date: `${year}-12-26`, name: "S. Stefano",             recurring: true },
];

export const initialCatalogPhases: CatalogPhase[] = [
  { id: "cp1",  name: "32A - TAGLIO PRF.FINESTRA IN PZ",      skill: "Taglio Alluminio",          hoursPerUnit: 0.25, unit: "pz" },
  { id: "cp2",  name: "32D - TAGLIO PRF.FACC.E COPERTUR. PZ", skill: "Taglio Alluminio",          hoursPerUnit: 0.40, unit: "pz" },
  { id: "cp3",  name: "11C - PROGRAMMI X CENTRI LAVORO",      skill: "Programmi",                 hoursPerUnit: 1.50, unit: "pz" },
  { id: "cp4",  name: "37A - RULLATURA PROFILI IN VG",        skill: "Rullatura e Pellicolatura", hoursPerUnit: 0.75, unit: "VG" },
  { id: "cp5",  name: "37B - NASTRATURA PROFILI IN VG",       skill: "Rullatura e Pellicolatura", hoursPerUnit: 0.33, unit: "VG" },
  { id: "cp6",  name: "36I - LAV.CNC.PRF.FINESTRE IN PZ.",    skill: "CNC",                       hoursPerUnit: 2.00, unit: "pz" },
  { id: "cp7",  name: "36A - LAV.CNC.MONTANTI FACCIATA PZ",   skill: "CNC",                       hoursPerUnit: 0.50, unit: "pz" },
  { id: "cp8",  name: "34J - ASSIEMAGGIO FINESTRE AWS75",     skill: "Assemblaggio",              hoursPerUnit: 2.00, unit: "pz" },
  { id: "cp9",  name: "34K - CIANFR.TELAI-ANTE FINES. IN PZ", skill: "Assemblaggio",              hoursPerUnit: 0.50, unit: "pz" },
  { id: "cp10", name: "35B - Applicazione Acc. Mont. Trav",   skill: "Assemblaggio",              hoursPerUnit: 0.50, unit: "pz" },
];

// Nessun articolo/prodotto demo: vengono definiti dal cliente nel Catalogo.
export const initialCatalogProducts: CatalogProduct[] = [];

const initialSkills: string[] = [
  "Taglio Alluminio", "Assemblaggio", "Programmi", "Rullatura e Pellicolatura", "CNC",
];

export function useSchedulerData() {
  // suffisso _ialc: forza il caricamento dei nuovi dati demo IALC anche su
  // browser che avevano già usato l'app con i dati precedenti
  const [employees,         setEmployees]         = useLocalStorage<Employee[]>      ("scheduler_employees_ialc",       initialEmployees);
  const [orders,            setOrders]            = useLocalStorage<Order[]>          ("scheduler_orders_ialc",          initialOrders);
  const [holidays,          setHolidays]          = useLocalStorage<Holiday[]>        ("scheduler_holidays",             initialHolidays);
  const [catalogPhases,     setCatalogPhases]     = useLocalStorage<CatalogPhase[]>   ("scheduler_catalog_phases_ialc",  initialCatalogPhases);
  const [catalogProducts,   setCatalogProducts]   = useLocalStorage<CatalogProduct[]> ("scheduler_catalog_products_ialc", initialCatalogProducts);
  const [saturdayWorking,   setSaturdayWorking]   = useLocalStorage<boolean>          ("scheduler_saturday_working",     false);
  const [skills,            setSkills]            = useLocalStorage<string[]>         ("scheduler_skills_ialc",          initialSkills);
  const [afanEntries,       setAfanEntries]       = useLocalStorage<AfanEntry[]>      ("scheduler_afan_ialc",            initialAfanEntries);

  return {
    employees,         setEmployees,
    orders,            setOrders,
    holidays,          setHolidays,
    catalogPhases,     setCatalogPhases,
    catalogProducts,   setCatalogProducts,
    saturdayWorking,   setSaturdayWorking,
    skills,            setSkills,
    afanEntries,       setAfanEntries,
  };
}
