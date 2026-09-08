# IALC — Schedulatore di produzione (Production Flow Manager)

> **Leggi questo file per primo.** È il passaggio di consegne dello sviluppo:
> contiene stato del progetto, come si avvia, come si mette in produzione e le
> trappole già pagate. Aggiornalo tu stesso a ogni sviluppo settimanale
> (sezione "Diario" in fondo): è la memoria del progetto per la prossima sessione.

Consegnato da Lukas Ferrazzi (Sharazad / Tacita) — ultimo sviluppo 29/06/2026.
Questa cartella è il pacchetto ridotto: contiene **solo** ciò che serve a far
girare e mettere in produzione https://ialc-schedulatore-demo.vercel.app
(sono stati esclusi la bozza di backend Antigravity, lo stub Express, la
sandbox mockup e i residui Replit).
Il `README.md` accanto descrive la demo dal punto di vista dell'utente finale
(account, cosa mostrare); questo file è per chi sviluppa.

---

## 1. Cos'è

Web app di pianificazione produzione per IALC Serramenti: commesse → lotti →
parti/fasi, piazzate su un Gantt per linea. Aggiunte poi: turni, capacità e
saturazione per persona, import CSV/Excel, registro attività, sincronizzazione
multi-utente.

Nata come demo Replit di Paolo Baggio, evoluta in app condivisa online con
persistenza server. **Non è ancora un gestionale in produzione**: login e
permessi sono verificati sul server solo per la scrittura dei dati (token
HMAC + tier), non c'è una vera anagrafica utenti.

Live: https://ialc-schedulatore-demo.vercel.app

## 2. Stack e struttura

Monorepo pnpm (eredità Replit).

- `artifacts/production-scheduler/` — **il frontend, qui vive il 95% del codice**.
  React 18 + Vite 7 + TypeScript + Tailwind + shadcn/ui, react-router.
- `api/` — funzioni serverless Vercel (Node, CommonJS): `state.ts` (dati),
  `auth.ts` (token), `presence.ts`, `audit.ts`.
- `lib/` — pacchetti di libreria del monorepo, fra cui lo schema Drizzle del
  modello dati "futuro" (typecheckano, non usati a runtime dalla app).
- `demo-data/` — CSV/XLSX di esempio per l'import.

File chiave del frontend:

| File | Cosa fa |
|---|---|
| `src/lib/schedule.ts` | Motore di scheduling: calcola dove cade ogni fase (clock a ore per linea), colori per fase, sovrapposizioni persona. **Cuore del prodotto.** |
| `src/sync/SyncProvider.tsx` | Sincronizzazione cloud: poll 5s, push in debounce, calcolo del patch minimo da inviare. |
| `src/hooks/useSchedulerData.ts` | Dati + seed iniziale (dipendenti, catalogo fasi). |
| `src/hooks/useAuth.tsx` | Login demo, tier 1-4, capability, token di sync. |
| `src/hooks/useLocalStorage.ts` | Storage reattivo (eventi custom) — tutte le pagine si aggiornano senza reload. |
| `src/components/GanttChart.tsx` | Gantt, drag delle fasi. |
| `src/pages/` | Pannello, Commesse, CommessaDetail, Catalogo, Dipendenti, Turni, Capacità, Importa, Registro, Utenti, Login. |
| `src/lib/capacity.ts` | Carico/saturazione per persona (usa le ore reali dei turni). |
| `src/types.ts` | Modello dati + costanti turni (`SHIFT_HOURS`, `DEFAULT_SHIFT`). |

## 3. Avvio locale

Node 22+ e pnpm (`corepack enable pnpm`).

```bash
pnpm install
pnpm start          # http://localhost:5173
```

Lo script imposta `PORT` e `BASE_PATH`, che `vite.config` pretende: lanciando
`vite` a mano senza quelle env non parte.

Account demo, **password = nome utente**: `demo-viewer` (tier 1, sola lettura),
`demo-operatore` (2), `demo-planner` (3, CRUD completo), `demo-admin` (4).
Se ti sembra che l'app sia "in sola visualizzazione", sei loggato come viewer.

## 4. Architettura della sincronizzazione (leggi prima di toccarla)

I dati stanno nel localStorage del browser **e** su Postgres (Neon), in un
singolo documento JSON `scheduler_state(id='default', doc jsonb, rev)`.

- Il client tiene 8 chiavi `scheduler_*_ialc` (vedi `SYNCED_KEYS` in
  `SyncProvider.tsx`). Tema, sessione e account non si sincronizzano.
- Push: il client **non manda il documento intero**, manda un patch minimo
  (`op:"patch"` con upsert/delete per `id`, campi scalari cambiati, figli
  ricorsivi). Il server lo applica in un loop ottimistico
  (`SELECT rev → applyMergeNode → UPDATE WHERE rev=curRev`, retry fino a 6).
- Granularità del merge: fino alla **singola parte** di un lotto. Due
  pianificatori su parti diverse della stessa commessa salvano entrambi.
  Lo schema di annidamento (`MERGE_SCHEMA`) è **duplicato identico** in
  `SyncProvider.tsx` e in `api/state.ts`: se cambi il modello dati, aggiornalo
  in **entrambi** o le modifiche annidate si perdono silenziosamente.
- Difese anti perdita dati (aggiunte dopo un incidente reale, vedi §7):
  flag `scheduler_dirty_ialc` (il pull non sovrascrive modifiche locali non
  ancora pushate), concorrenza ottimistica lato server, guardia sul bundle
  vuoto (un `{}` non azzera il database). **Non rimuoverle.**
- Auth: `POST /api/auth` restituisce un token HMAC (TTL 30 giorni, secret
  `DEMO_AUTH_SECRET`). Tutti gli endpoint, **anche in lettura**, richiedono
  `Authorization: Bearer <token>`. Scrittura solo da tier ≥ 2.

## 5. Deploy

**Il repo non è collegato a Git su Vercel.** Non esiste un `git push` che
deploya. Si mette in produzione solo dalla CLI, dalla radice del progetto:

```bash
vercel whoami            # controlla di essere sull'account giusto
vercel deploy --prod --yes
```

Env var necessarie sul progetto Vercel (production + preview + development):

| Nome | Cosa è |
|---|---|
| `DATABASE_URL` | stringa di connessione Postgres/Neon (usare la stringa **pooler**) |
| `DEMO_AUTH_SECRET` | segreto per firmare i token HMAC (una stringa casuale) |

Senza queste due l'app si apre ma ogni chiamata a `/api/*` risponde errore e
la sincronizzazione resta spenta. `.env` e `.vercel` sono in `.gitignore`:
i segreti non devono mai finire in un file committato.

### 5.1 Primo deploy sull'account IALC (da fare una volta)

Il progetto Vercel e il database attuali stanno sull'account personale di
Lukas. Alla prima apertura si ricrea tutto sull'account IALC: **il codice non
va toccato**, cambiano solo progetto Vercel ed env var.

```bash
# 1. Vercel: login e nuovo progetto legato a questa cartella
vercel login
vercel link            # crea un progetto nuovo (es. "ialc-schedulatore")
                       # framework: Other/None — la configurazione sta in vercel.json

# 2. Database: creare un progetto Postgres su Neon (neon.tech, free tier basta:
#    0.5 GB, scale-to-zero, nessuna carta) e copiare la connection string pooler

# 3. Creare le 3 tabelle sul database nuovo (SQL Editor di Neon)
```

```sql
create table if not exists scheduler_state (
  id         text primary key,
  doc        jsonb       not null default '{}'::jsonb,
  rev        integer     not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);
create table if not exists presence (
  name      text primary key,
  tier      integer     not null,
  last_seen timestamptz not null default now()
);
create table if not exists audit (
  id       text primary key,
  ts       timestamptz not null default now(),
  username text,
  entry    jsonb       not null
);
```

```bash
# 4. Env var (una alla volta, incolla il valore quando le chiede)
vercel env add DATABASE_URL production
vercel env add DATABASE_URL preview
vercel env add DATABASE_URL development
#    segreto dei token: generane uno nuovo, non serve farselo dare
openssl rand -hex 32
vercel env add DEMO_AUTH_SECRET production
vercel env add DEMO_AUTH_SECRET preview
vercel env add DEMO_AUTH_SECRET development

# 5. Deploy
vercel deploy --prod --yes
```

Poi verifica, sostituendo l'URL restituito dal deploy:

```bash
# login → deve restituire un token
curl -s -X POST https://<tuo-url>/api/auth \
  -H 'content-type: application/json' \
  -d '{"username":"demo-planner","password":"demo-planner"}'

# lettura dei dati col token → deve restituire { rev, doc }
curl -s https://<tuo-url>/api/state -H "Authorization: Bearer <token>"
```

Se `/api/state` risponde 401 il token è sbagliato o scaduto; se risponde 500
la `DATABASE_URL` è sbagliata o le tabelle non esistono ancora.

Note importanti:

- **L'URL cambia.** `ialc-schedulatore-demo.vercel.app` resta sull'account di
  Lukas: dopo il deploy comunica il nuovo indirizzo a chi usa l'app.
- **Il database nuovo parte vuoto**: al primo accesso l'app pubblica il seed
  del codice (11 dipendenti e 10 fasi reali IALC, commesse e articoli vuoti).
  Se invece si vogliono portare i dati già inseriti in produzione, chiedi a
  Lukas il contenuto del documento (`select doc from scheduler_state where
  id = 'default'`) e inseriscilo nel database nuovo:
  `insert into scheduler_state (id, doc, rev, updated_by) values ('default', '<json>'::jsonb, 1, 'migrazione');`
- Cambiando `DEMO_AUTH_SECRET` i token già emessi non valgono più: chi era
  loggato rifà il login. Normale.
- Prima di rifare tutto, controlla con `vercel whoami` di non essere ancora
  loggato con l'account di Lukas.

Riferimento del vecchio ambiente (account Lukas, per la migrazione): progetto
Vercel `ialc-schedulatore-demo`, progetto Neon `gentle-bread-42589761`,
db `neondb`, tabelle `scheduler_state`, `presence`, `audit`.

## 6. Regole di lavoro su questo progetto

1. **Non lanciare `tsc` / `pnpm run build` in locale per validare**: su Mac
   metteva 13 minuti (vite 7 + @types/node 25). Il build su Vercel è di ~15s.
   Per un controllo veloce dei tipi usa il binario locale
   `node_modules/.bin/tsc` (mai `npx tsc`, si impianta) oppure valida la
   sintassi con `esbuild.transform`. Il build di produzione usa `vite build`
   puro: esbuild butta via i tipi, quindi **un errore di tipo non blocca il
   deploy** — controlla tu.
2. **Il server è autoritativo.** Cambiare il seed in `useSchedulerData.ts`
   **non** cambia i dati dell'app live: il documento su Neon ha `rev > 0` e
   vince. Per cambiare i contenuti in produzione bisogna riscrivere il doc
   (`UPDATE ... doc = ..., rev = rev+1`), altrimenti i client non fanno il pull.
3. Dopo un deploy, se un collega dice "non è cambiato niente": fagli fare un
   **hard refresh** (Ctrl/Cmd+Shift+R). È già successo di rincorrere un bug
   che era solo cache.
4. Funzioni in `api/`: tieni `module: NodeNext` in `api/tsconfig.json`. Con
   `ESNext` emette ESM, Vercel le esegue come CJS e crashano
   (`FUNCTION_INVOCATION_FAILED`). Gli helper condivisi vanno **inline** nella
   funzione: gli import fuori da `api/` non sempre vengono tracciati.
5. Query Neon con tagged template `sql`: intervalli e costanti vanno scritti
   **dentro** la stringa, non passati con `${}`.
6. È un'app **Vite + React SPA**. Se un suggerimento parla di Next.js, app
   router o middleware, è fuori contesto: ignoralo.
7. Nomi di aziende e persone nei dati demo sono fittizi; il roster e il
   catalogo fasi attuali invece sono **reali IALC** (11 dipendenti, 10 fasi con
   codice tipo `32A - TAGLIO PRF.FINESTRA IN PZ`, 5 competenze). Trattali come
   dati del cliente.

## 7. Cose già rotte una volta (non ripeterle)

- **Perdita dati (24/06)**: il pull applicava il server sopra modifiche locali
  non ancora inviate → l'utente riapriva l'app e trovava il seed. Non
  recuperabili: non erano mai arrivate al server. Risolto con dirty-flag +
  concorrenza ottimistica + wipe-guard (§4).
- **"Il collega vede solo i suoi dati" (29/06)**: token con TTL 12h e sessione
  ripristinata al reload senza rinnovarlo → 401 → client offline in silenzio,
  modifiche solo locali. Risolto: TTL 30 giorni + rinnovo del token al mount in
  `useAuth.tsx`. Se ricompare: guarda **prima** la scadenza del token, non il
  database.
- **Fase che "sparisce" trascinandola**: drag su sabato/domenica → nessun
  giorno lavorativo nel range → zero segmenti da disegnare. Risolto con
  `firstWorkingDay()` in `schedule.ts`.
- **Testo sovrapposto nei Select**: serviva `min-w-0` sia sulla cella della
  griglia **sia** sullo `<span>` interno del trigger (`components/ui/select.tsx`).

## 8. Stato attuale e punti aperti

Fatto e in produzione: sync multi-utente con merge fino alla parte, presenza
utenti, registro attività, capacità/saturazione con ore dei turni, modulo
turni (giornata 8h di default, mezza giornata mattina/pomeriggio 4h, notte),
colore per tipo di fase (automatico + picker in Catalogo → Fasi), packing di
più fasi corte nello stesso giorno sulla stessa linea (eccezione: i codici
`34K`, `34J`, `35B` occupano giornate intere), export Excel e stampa/PDF,
import CSV/Excel, rebrand IALC con logo reale.

Da fare / da verificare:

- [ ] **Smoke test reale a due browser**: modifica su un device → compare
      sull'altro; chiudi e riapri → i dati restano. Il layer API è verificato
      via curl, l'interfaccia a quattro mani no.
- [ ] Verificare con Paolo/cliente il resto del feedback sulla presentazione.
- [ ] Le commesse e gli articoli sono **vuoti** per scelta: li inserisce o
      importa il cliente.
- [ ] Permessi: la UI nasconde i comandi per tier, il server valida solo
      scrittura/tier. Per un uso vero servono utenti reali con password, non
      gli account demo.
- [ ] I turni non alimentano il Gantt (solo la pagina Capacità li legge).

## 9. Diario degli sviluppi

Aggiungi qui una riga per sessione: data, cosa hai cambiato, file toccati,
deployment. Serve alla sessione dopo (tua o di chiunque altro).

- **29/06/2026** — colore per fase + picker in Catalogo, più fasi brevi nello
  stesso giorno, fix fase invisibile se trascinata nel weekend, fix Select
  sovrapposto, token 30 giorni. Deploy in produzione.
- **24/06/2026** — merge della sincronizzazione fino alla singola parte, difese
  anti perdita dati, ore dei turni nella saturazione, dati reali IALC.
- **16/06/2026** — sincronizzazione cloud (Vercel + Neon), presenza, registro,
  capacità, export, rebrand IALC, modulo turni.
- **12/06/2026** — base Replit, fix drag Gantt, alert sovrapposizioni, import
  CSV/Excel, tier 1-4.
