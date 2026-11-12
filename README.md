# Transmission Portal

Internal portal for the Network Engineering — Transmission team at Tely.

## Structure

```
transmission-portal/
├── index.html                  # Main entry point
├── assets/
│   ├── css/
│   │   ├── base.css            # Reset, variables, topbar, buttons, forms
│   │   ├── home.css            # Hero, client cards
│   │   ├── demands.css         # Note board, demand chips
│   │   ├── timeline.css        # Case list, case detail, timeline entries
│   │   ├── notifications.css   # Bell, panel, demand/case items
│   │   └── skeleton.css        # Shimmer loading animations
│   ├── js/
│   │   ├── utils.js            # pad(), esc(), fmtCountdown()
│   │   ├── database.js         # localStorage helpers (cases + demands)
│   │   ├── navigation.js       # showPage(), openRFO(), openTLList()
│   │   ├── skeleton.js         # Skeleton builders and init
│   │   ├── demands.js          # Note board, chips, timers
│   │   ├── timeline.js         # Cases, circuits, events
│   │   ├── notifications.js    # Bell toggle, panel render, tickers
│   │   └── app.js              # DOMContentLoaded bootstrap
│   └── images/
│       ├── logo-tely.jpg
│       ├── amazon-leo-card.jpg
│       ├── amazon-leo-banner.jpg
│       ├── starlink-card.jpg
│       └── starlink-banner.jpg
└── rfo/
    └── index.html              # RFO Generator (standalone page, loaded in iframe)
```

## React islands (dock, network events, demands)

Three parts of the portal are React + TypeScript + Tailwind v4 (shadcn structure);
everything else stays plain HTML/CSS/JS. Each one mounts into a placeholder in `index.html`:

| Island | Placeholder | What it is |
|---|---|---|
| Floating dock | `#dock-root` | Main navigation fixed at the bottom (RMAs, Lambdas, LOA, RFO, Almoxarifado, Amazon Leo, Starlink) |
| Network events | `#events-root` | Home dashboard: active network events + Padtec alarms |
| Demands | `#demands-root` | Demands as a row of notepads (hover, open, comment, finish) |

```
src/
├── main.tsx                          # mounts each island into its placeholder
├── portal.css                        # Tailwind (no global preflight, utilities only for src/) + notepad paper
├── components/
│   ├── ui/floating-dock.tsx          # Aceternity FloatingDock, adapted to the portal theme
│   ├── ui/notepad.tsx                # notepad object (layers, 3D hover, fanning sheets)
│   ├── portal-dock.tsx               # dock items (hash routes) + active route
│   ├── network-events.tsx            # events dashboard
│   └── demands-board.tsx             # demands board (uses the notepad)
├── data/network-events.ts            # ⚠ events/alarms data source — SIMULATED for now
├── lib/demands-store.ts              # bridge to the existing demands data (database.js → /api/demands)
├── lib/utils.ts                      # cn()
└── hooks/use-now.ts                  # live clock + duration formatting
```

**Network events data:** segments (trechos) are real — the Zabbix webhook (`/api/zabbix/webhook`)
sends every event that doesn't match Amazon Leo (circuit ids / `SLZ501` / `CPV501` in host, trigger,
opdata or tags) to the `netalarms` collection. `server/netevents.js` reads the segment from the router
names (`UF-LOC-SITE-…`): host `PE-AIN-A01-BHM-RT-001` + trigger `… Core: PE-TIU-A01-BKB-RT-001 … down`
→ segment `PE-AIN x PE-TIU`; both ends of a link land on the same segment. Locality names (UF + Anatel
code → city) come from the DWDM map plus the **Localidades** page (`#/localidades`, `localities`
collection), which also lists codes seen in alarms that have no name yet. Padtec alarms come from the
NMS API (`server/padtec.js`, every 60 s, same `NMS_TOKEN` / `data/nms-token.txt` as the Rx collector):
active alarms whose name has "Via A"/"Via B" or "Falha interna de alimentação" (energia), "Temperatura" or "Tempo de resposta".

**DWDM Padtec alarms:** every Zabbix event of a host in the host group **PADTEC** goes to the
`dwdmalarms` collection (`GET /api/network/dwdm`) instead of trechos / Amazon Leo, and is shown in
"Alarmes DWDM Padtec" with one color per severity. The Zabbix media type must send the parameter
`host_groups` = `{TRIGGER.HOSTGROUP.NAME}` (the group name can be changed with env `DWDM_GROUP`).

**Janelas programadas** (`#/janelas`): maintenance windows from the Excel sheet
`Janelas_Programadas.xlsx` (OneDrive). A Power Automate flow lists the rows of the sheet's table
(Excel Online Business) and sends each one through the standard RSS connector:
`GET /api/janelas/sync?token=<feed token>&run=<run id>&row=<row JSON>`, then
`…&run=<run id>&end=1&count=<rows>` — when every row arrived, windows no longer in the sheet are
removed (`server/janelas.js`, same token as the Amazon Leo feed). Times are read as Brasília time.

**Demands:** the notepads read and write the same data as before (`dmdGetAll`/`dmdSave` in
`assets/js/database.js`, synced to `/api/demands` and polled every 8s); only the rendering moved to React.

Vite builds everything into `assets/react/portal.js` + `portal.css`, which `index.html` loads.
`assets/react/` is a build output (git-ignored): **run the build before serving the site**.

```bash
npm ci
npm run build     # one-off build
npm run dev       # rebuild on every change in src/
```

**Christmas theme** (`src/components/xmas/`): snow, lights under the topbar, a Santa hat on the dock,
snow on the banners and the two Santas (`assets/images/xmas/`) taking turns on screen. It turns itself on
between `SEASON.from` and `SEASON.to` in `season.ts` (Nov 1 – Jan 6) and each viewer can switch it off
with the ❄ button in the topbar (saved in the browser).

To add or change a dock item, edit `NAV` in `src/components/portal-dock.tsx` (icons from `@tabler/icons-react`).

## Running locally

Build the dock first (`npm ci && npm run build`), then you need a local server — browsers block `file://` cross-origin requests for JS modules.

**Option 1 — VS Code Live Server**
Install the "Live Server" extension, right-click `index.html` → "Open with Live Server".

**Option 2 — Python**
```bash
cd transmission-portal
python3 -m http.server 8080
# Open http://localhost:8080
```

**Option 3 — Node**
```bash
npx serve .
```

## Adding a new client

1. Add a new page `<div id="pg-CLIENTNAME" class="page">` in `index.html`
2. Add the client banner image in `assets/images/`
3. If the client needs new tools, create a new JS file in `assets/js/` and include it
4. Add the client to the dock (`NAV` in `src/components/portal-dock.tsx`) and rebuild

## Data storage

Cases and demands are stored server-side (`server/`) so every user sees the same data, shared via a small Node API (`GET`/`PUT` on `/api/cases` and `/api/demands`, backed by JSON files in `server/data/`). The browser also keeps a `localStorage` mirror (`net_cases`, `net_demands`) as an offline fallback and for instant first paint; it resyncs from the server on load and polls every 8s to pick up changes from other users.

Running the frontend without the API (e.g. `python3 -m http.server`) still works — it just falls back to the local-only cache, same as before.

In production the API runs under PM2 on the VPS, proxied by nginx at `/api/` on the same port as the site (see `server/server.js`). When deploying with PM2, run `npm ci && npm run build` after each `git pull` so `assets/react/` exists.

## Claude Code usage

Open this folder in Claude Code:
```bash
claude
```

Describe what you want to change and Claude Code will edit the right files directly.

---
Made by **Antony Araújo** — Network Engineering (Transmission)

## Docker

The whole portal (static site + data API) runs in one container. The image builds the dock in a
build stage (`npm ci && npm run build`); the runtime stage has no npm dependencies.

```bash
mkdir -p data                    # persistent data (JSON collections + Zabbix token)
docker compose up -d --build     # http://<host>:5454
docker compose logs -f
```

Data lives in `./data` (mounted at `/app/server/data`). To migrate from the current VPS, copy
`server/data/` into `./data` before the first `up`; keeping `zabbix-token.txt` means the Zabbix
media type only needs its `url` changed.

Full documentation (architecture, API, Zabbix integration, Amazon Leo dashboard, deployment,
backup): `docs/Transmission-Portal-Documentacao.pdf` (regenerate with `python docs/build_doc.py`).
