# Progress

## 2026-04-19 — Session 1: Initial build
- Static "Atlas of AI" viewer (`index.html`) + admin (`admin.html`) with editorial cartographic aesthetic
- D3 Natural Earth world map, sortable catalogue table, slide-in dossier panel
- Admin initially used localStorage (no backend)

## 2026-04-19 — Session 2: Node.js backend + GeoJSON pipeline
- Replaced localStorage with Express backend in `backend/`
- Flat-JSON "database" at `backend/data/ai-models.json` (atomic writes)
- API: `GET/POST/PUT/DELETE /api/models`, `GET/PUT /api/meta`, `POST /api/export`, `GET /api/health`
- Swagger UI at `/api/docs`
- Every mutation regenerates `data/ai-models.geojson` (public GeoJSON FeatureCollection)
- `atlas.js` reads GeoJSON; `desk.js` calls REST API
- Tests: 42 specs, 94.7% line coverage

## 2026-04-19 — Session 3: Editions feature
- New `backend/services/editions.js` — named snapshots of the catalogue
- New routes: `GET/POST /api/editions`, `GET /api/editions/:id`
- Snapshot files written to `data/editions/<id>.geojson`; manifest at `data/editions/index.json`
- Server bootstraps editions store on startup
- Admin: "Save Edition ✦" button → modal (label + note) → `POST /api/editions`
- Admin: collapsible "Editions archive" drawer in left panel with download links
- Viewer: edition switcher in sidebar (Live + archived editions)
- Viewer: sticky archive banner when a past edition is active; "Return to live" restores live state
- Tests: 60 specs total (18 new for editions), 95.5% line / 75.6% branch coverage — all thresholds met
- Smoke-tested: create edition, list, fetch GeoJSON by id, static file serving — all passing

## Current state
- Backend running via `cd backend && npm start` (default port 3000)
- 22 seed models in `backend/data/ai-models.json`
- `data/ai-models.geojson` generated on every boot + mutation
- `data/editions/` directory seeded with empty `index.json`
