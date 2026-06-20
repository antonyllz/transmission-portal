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

## Running locally

You need a local server — browsers block `file://` cross-origin requests for JS modules.

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

1. Add a card in `index.html` inside `.clients-grid`
2. Add a new page `<div id="pg-CLIENTNAME" class="page">` in `index.html`
3. Add the client banner image in `assets/images/`
4. If the client needs new tools, create a new JS file in `assets/js/` and include it

## Data storage

All data is persisted in `localStorage`:
- `net_cases` — Case Timeline tickets (JSON array)
- `net_demands` — Active demands (JSON array)

To clear all data: open DevTools → Application → Local Storage → delete keys.

## Claude Code usage

Open this folder in Claude Code:
```bash
claude
```

Describe what you want to change and Claude Code will edit the right files directly.

---
Made by **Antony Araújo** — Network Engineering (Transmission)
