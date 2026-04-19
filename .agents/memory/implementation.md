# Implementation log

## 2026-04-19 — initial static build
- `index.html`, `admin.html`, `assets/css/{atlas,desk}.css`, `assets/js/{atlas,desk}.js`, `data/ai-models.json`
- Editorial cartographic theme; D3 + TopoJSON map; admin used localStorage

## 2026-04-19 — backend + GeoJSON pipeline
**Moved:** `data/ai-models.json` → `backend/data/ai-models.json` (source of truth)
**Generated:** `data/ai-models.geojson` (FeatureCollection consumed by the viewer)

**Backend layout (`backend/`):**
- `app.js` — Express factory (used by tests too, no port binding)
- `index.js` — boots server, loads `.env`, exports geojson on startup
- `config/paths.js` — resolves DB + GeoJSON paths
- `services/db.js` — atomic JSON CRUD with validation (REQUIRED, TYPES, modality, lat/lng range)
- `services/geojsonExporter.js` — `toFeatureCollection`, `toFeature`, `exportTo` (atomic)
- `routes/{models,meta,exportRoute}.js` — REST routes; mutations call `exportTo` automatically
- `middleware/errorHandler.js` — `HttpError`, `notFound`, `errorHandler`
- `utilities/{loadEnv,slugify}.js`
- `swagger.json` — OpenAPI 3.0 spec served via `swagger-ui-express` at `/api/docs`
- `scripts/export-geojson.js` — standalone exporter for CI

**Frontend changes:**
- `atlas.js` — added `fromGeoJson()` adapter; URL switched to `./data/ai-models.geojson`
- `desk.js` — full rewrite around `fetch('/api/...')`; localStorage removed
- `admin.html` — toolbar buttons updated (Refresh / Meta / Download GeoJSON / Regenerate file / API docs)

**Tests (`backend/tests/`):** 42 specs, 94.7% line / 75% branch coverage. Stack: Jest + Supertest.

**Smoke-test results (port 3030):**
- `/api/health` → 200 `{ok:true}`
- `/api/models` → 22 entries
- POST/DELETE round-trip → regenerates `data/ai-models.geojson`
- `/api/docs` → 200 (Swagger UI)
- `/`, `/admin.html`, `/data/ai-models.geojson` → 200

## Known limitations
- No auth — exclude `admin.html` and `backend/` from public deploys
- Country-highlight on the map uses a bbox heuristic (not point-in-polygon)
