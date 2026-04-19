# Implementation log

## 2026-04-19 — Session 1: initial static build
- `index.html`, `admin.html`, `assets/css/{atlas,desk}.css`, `assets/js/{atlas,desk}.js`, `data/ai-models.json`
- Editorial cartographic theme; D3 + TopoJSON map; admin used localStorage

## 2026-04-19 — Session 2: backend + GeoJSON pipeline
**Moved:** `data/ai-models.json` → `backend/data/ai-models.json` (source of truth)
**Generated:** `data/ai-models.geojson` (FeatureCollection consumed by the viewer)

**Backend layout (`backend/`):**
- `app.js` — Express factory (used by tests, no port binding)
- `index.js` — boots server, loads `.env`, bootstraps editions store, exports GeoJSON on startup
- `config/paths.js` — resolves DB, GeoJSON, and editions dir paths
- `services/db.js` — atomic JSON CRUD with field validation
- `services/geojsonExporter.js` — `toFeatureCollection`, `toFeature`, `exportTo` (atomic)
- `routes/{models,meta,exportRoute}.js` — REST routes; mutations auto-trigger `exportTo`
- `middleware/errorHandler.js` — `HttpError`, `notFound`, `errorHandler`
- `utilities/{loadEnv,slugify}.js`
- `swagger.json` — OpenAPI 3.0, served via `swagger-ui-express` at `/api/docs`
- `scripts/export-geojson.js` — standalone CLI exporter

**Frontend changes (Session 2):**
- `atlas.js` — added `fromGeoJson()` adapter; URL → `./data/ai-models.geojson`
- `desk.js` — full rewrite around `fetch('/api/...')`; localStorage removed
- `admin.html` — toolbar: Refresh / Meta / Download GeoJSON / Regenerate file / API docs

## 2026-04-19 — Session 3: editions feature

**New backend files:**
- `backend/services/editions.js` — `createEditionsStore({ editionsDir })`
  - `bootstrap()` — creates `data/editions/` dir and empty `index.json` if absent; idempotent
  - `list()` — reads `data/editions/index.json`, returns editions array (newest first)
  - `create(dataset, { label, note })` — writes `<id>.geojson` snapshot + updates index; requires label; unique ID = `YYYY-MM-DD_<slug>-<base36-timestamp>`
  - `get(id)` — returns parsed GeoJSON for a given edition id; 404 if missing
- `backend/routes/editions.js` — `GET /api/editions`, `POST /api/editions`, `GET /api/editions/:id`
- Updated `backend/app.js` — mounts editions router, exposes `editionsStore` on `app.locals`
- Updated `backend/index.js` — calls `editionsStore.bootstrap()` on startup
- Updated `backend/swagger.json` — `Edition` schema + 3 new paths
- Updated `backend/config/paths.js` — added `EDITIONS_DIR` constant

**Edition files on disk:**
- `data/editions/index.json` — manifest `{ editions: [{id, label, note, date, features, file}] }`
- `data/editions/<id>.geojson` — frozen FeatureCollection; carries `editionId`, `editionLabel`, `editionNote` fields at top level

**New tests:**
- `tests/services/editions.test.js` — 13 specs: bootstrap idempotency, create/list/get, validation, atomic writes, unique ids
- `tests/routes/editions.test.js` — 7 specs: list, create, 400/404 errors, GeoJSON retrieval

**Frontend changes (Session 3):**
- `admin.html` — "Save Edition ✦" gold button in toolbar; collapsible "Editions archive" drawer in left panel
- `desk.css` — `.edition-btn`, `.editions-list`, `.edition-item`, modal styles (`.modal-backdrop`, `.modal`, `.modal__head`, `.modal__body`)
- `desk.js`:
  - `state.editions[]` added
  - `refresh()` now also fetches `GET /api/editions`
  - `renderEditions()` — renders archive drawer with download links
  - `bindEditionsToggle()` — open/close drawer
  - `bindEditionModal()` / `openEditionModal()` / `closeEditionModal()` / `confirmSaveEdition()` — modal flow
- `atlas.css` — `.editions-block`, `.edition-switcher`, `.edition-opt` (live / archived / active states), `.archive-banner` + `.return-live`
- `atlas.js`:
  - `state.activeEditionId` (`'live'` or edition id), `state.editions[]`
  - `init()` now also fetches `data/editions/index.json` (graceful 404 fallback)
  - `renderEditionSwitcher()` — builds sidebar switcher buttons
  - `loadEdition(id)` — fetches `data/editions/<file>`, re-renders map/stats/filters/catalogue
  - `loadLiveEdition()` — re-fetches live GeoJSON, dismisses banner
  - `updateArchiveBanner(ed|null)` — shows/hides sticky banner
  - `bindArchiveBanner()` — wires "Return to live" button
  - `escapeHtml()` / `escapeAttr()` helpers added
- `index.html` — archive banner div + editions block in sidebar

## Test summary (as of Session 3)
| Suite | Specs |
|---|---|
| services/db | 14 |
| services/geojsonExporter | 6 |
| services/editions | 13 |
| routes/models | 14 |
| routes/editions | 7 |
| middleware/errorHandler | 6 |
| utilities/loadEnv | 6 |
| **Total** | **60** |

Coverage: 95.5% lines · 75.6% branches · 100% functions (all above CLAUDE.md thresholds: 85/70/85)

## Known limitations / deferred
- No auth on `admin.html` — exclude from public GitHub Pages deploy; run locally
- Country highlight on map uses bbox heuristic (not point-in-polygon)
- Edition deletion not implemented (editions are append-only by design)
