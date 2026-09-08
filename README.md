# Production Flow Manager — DEMO

Schedulatore di produzione. **Versione demo con dati finti**: tutti i dati
vivono nel localStorage del browser, nessun servizio esterno richiesto.

## Avvio

Requisiti: Node.js 22+ e pnpm (`corepack enable pnpm`).

```bash
pnpm install
pnpm start          # apre il frontend su http://localhost:5173
```

## Account demo (password = nome utente)

| Utente | Tier | Può fare |
|---|---|---|
| `demo-viewer` | 1 — Visualizzatore | Sola lettura su tutto |
| `demo-operatore` | 2 — Operatore | + stato fasi, spostamenti Gantt, assegnazione persone |
| `demo-planner` | 3 — Pianificatore | + CRUD commesse/lotti/fasi, catalogo, dipendenti, festività, import, registro |
| `demo-admin` | 4 — Amministratore | + gestione utenti, svuotamento registro |

## Cosa mostrare in demo

1. **Gantt (scheda Pannello)**: trascinare le barre sposta le fasi senza più
   saltare alla scheda Commesse (bug corretto).
2. **Sovrapposizioni persona**: il Pannello mostra un alert ambra non
   bloccante (3 sovrapposizioni nei dati demo: Marco Rossi, Giorgio Esempio,
   Aldo Prova); badge rosso `!` sulle barre coinvolte; avviso live anche nel
   dialog di modifica fase.
3. **Import CSV/Excel** (`Importa`, da Pianificatore in su): file di esempio
   in `demo-data/` (fasi, articoli, matricole — `articoli_esempio.csv`
   contiene una riga errata apposta per mostrare la validazione). Anteprima
   prima della scrittura, merge per chiave.
4. **Tier**: uscire e rientrare con i 4 account per vedere menu e pulsanti
   cambiare; i permessi sono nascosti, non disabilitati.

Per ripartire da zero: svuotare il localStorage del browser (DevTools →
Application → Local Storage) e ricaricare.

## Struttura

- `artifacts/production-scheduler/` — frontend React + Vite (la demo)
- `artifacts/api-server/` — stub Express (non usato dalla demo)
- `reference/antigravity-backend/` — bozza backend Postgres/Drizzle + JWT
  (non compilata, mai collegata): base per la futura versione server con
  permessi verificati lato server
- `lib/db/` — schema Drizzle del modello dati futuro
- `demo-data/` — file CSV/XLSX di esempio per l'import

## Limiti noti della demo

- Login e permessi sono **solo client-side** (nessun server): adatti a una
  demo, non a una messa in produzione.
- I dati restano nel browser che li ha creati.
