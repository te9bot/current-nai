# কারেন্ট Koi?

A community-reported electricity / load-shedding status tracker for Bangladesh. People
report whether their area currently has power or is in load-shedding, and everyone can
browse a live, filterable board of reports.

**Live:** https://current-nai-k2e1.onrender.com (free tier — spins down after 15 minutes
of inactivity, so the first request after a while can take ~30-60s to wake up)

## Stack

- **Frontend:** React + Vite + TypeScript, Tailwind CSS
- **i18n:** react-i18next (English ⇄ বাংলা, persisted in localStorage)
- **Backend:** Express + `node:sqlite` (Node's built-in SQLite module — no native
  build step, no external DB to install)

## Running locally

Requires **Node.js 22.5+** (for `node:sqlite`) — Node 24 is recommended.

```bash
npm install
npm run dev
```

This starts two processes together (via `concurrently`):

- the Vite dev server at **http://localhost:5173** (the app)
- the Express API at **http://localhost:4000** (proxied under `/api` by Vite)

On first run the API seeds the SQLite database (`server/current-nai.sqlite`) with a
handful of sample reports across different divisions so the board isn't empty. The
database file is created automatically and gitignored; delete it to reset to a fresh
seeded state.

Other scripts:

```bash
npm run build     # type-check + production build of the frontend
npm run server    # run only the API server
npm run seed      # manually (re-)seed if the reports table is empty
```

## The load-shedding ledger

Beyond the live board, the app keeps a public accountability record of what the
community has reported — the same idea as a crowdsourced public ledger, applied to
outages instead of money:

- **Electricity provider** on every report (DPDC, DESCO, BPDB, Palli Bidyut/REB, NESCO,
  WZPDCL, or "not sure"), so outages can be attributed to a distributor.
- **Outage duration**, computed from the start/end window. A report with no end time is
  still ongoing and is measured up to now (capped at 24h so a stale report can't inflate
  totals forever).
- **"Also affected" confirmations** — anyone can corroborate a report they're
  experiencing too. One confirmation per browser per report (tracked in `localStorage`),
  which is the pragmatic limit for a no-accounts, anonymous app.
- **Aggregate stats**: total outage time reported, average outage length, how many are
  still unresolved (and what share of all outages that is), total confirmations, and
  coverage across divisions and providers.
- **Provider × division breakdown table** with proportional bars, so you can see where
  outage time is concentrated. Toggle between "By provider" and "By division".
- **Sorting**: latest, longest outage, or most confirmed. Plus filters by division,
  status, provider, and free-text search.

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/reports` | List reports. Query: `division`, `status`, `provider`, `q`, `sort` (`latest`/`longest`/`confirmed`) |
| `GET /api/summary` | Power-on / load-shedding / total counts |
| `GET /api/stats` | Aggregate ledger stats + `byProvider` / `byDivision` breakdowns |
| `POST /api/reports` | Create a report |
| `POST /api/reports/:id/confirm` | Increment a report's confirmation count |

## Project structure

```
data/locations.json      Bangladesh divisions/districts (English + Bangla names) —
                          shared source of truth for both frontend and backend
data/providers.json      Electricity distribution companies (English + Bangla)
server/                  Express API + SQLite schema/seed
src/
  api/                   fetch() wrappers for the reports API
  components/            UI components (Header, Splash, Board, ReportForm, ...)
  data/locations.ts      typed helpers over data/locations.json
  hooks/useReports.ts    polls the API every ~17s
  i18n/                  react-i18next bootstrap + language detection
  locales/en.json        English strings
  locales/bn.json        Bangla strings
  utils/time.ts          relative-time formatting + Bangla digit localization
```

## Adding or editing translation strings

1. Add the new key to **both** `src/locales/en.json` and `src/locales/bn.json`, at the
   same nested path (e.g. `form.newField`).
2. Use it in a component with `useTranslation()`:
   ```tsx
   const { t } = useTranslation();
   t("form.newField")
   ```
3. For strings with a variable count (pluralization), suffix the key with `_one` /
   `_other` in both files — see `board.reportsCount_one` / `_other` for an example.
4. Division and district names are **not** in the translation files — they live in
   `data/locations.json` with `en` and `bn` fields per entry, and are resolved with
   `localizedName(entity, i18n.language)` from `src/data/locations.ts` so the underlying
   stored id never changes when the UI language is switched.
5. The language toggle lives in the header (`src/components/LanguageToggle.tsx`) and
   is available on every screen. The chosen language is cached in `localStorage`
   (`current-nai-language`) and restored on return visits; a first-time visitor whose
   browser locale is `bn-*` defaults to Bangla.

## Design notes

- Dark "substation control panel" aesthetic: near-black backgrounds, a green accent for
  "Power On" and a rust red for "Load-shedding", Plus Jakarta Sans for display/UI text,
  JetBrains Mono for timestamps and data, and Hind Siliguri / Noto Sans Bengali for
  Bangla text (swapped in automatically via `html[lang="bn"]` in `src/index.css`).
- The status picker (`BreakerToggle`) is a custom breaker-switch-style control, not a
  plain radio group.
- The landing/splash screen (`Splash.tsx`) uses a decorative map background image with
  a subtle mouse-driven parallax effect plus an ambient auto-pan animation for touch
  devices.
- `MapBackdrop.tsx` renders the same basemap fixed behind the whole app, so every
  section sits over it rather than on flat black. It drifts at 12% of scroll speed for
  a parallax cue, and skips that work entirely under `prefers-reduced-motion` or on
  touch devices. Sections use the `.panel` class (translucent ink + 12px blur) so the
  map stays visible without hurting text contrast.

## Mobile

- The page never scrolls horizontally: `overflow-x: hidden` on `body`, and wide content
  (the ledger table, the ticker) scrolls inside its own `overflow-x: auto` container.
- Smooth in-page scrolling with iOS momentum, and `overscroll-behavior-y: none` to stop
  rubber-band bounce.
- On coarse pointers, controls get a 40px minimum height and inputs are set to 16px,
  which stops iOS Safari from zooming the viewport when a field is focused.
- Filters stack vertically on small screens and wrap into a row from `sm` up; stat tiles
  go 2-up on mobile and 4-up on large screens.
