# Decisions

## 2026-04-19 — Static viewer + Node.js admin backend
The public viewer (`index.html`) stays fully static so it can ship to GitHub Pages. A Node.js Express backend in `backend/` powers the admin (`admin.html`) and persists changes to a flat-JSON store at `backend/data/ai-models.json`. Every mutation regenerates `data/ai-models.geojson`, which is the file the viewer reads.

## 2026-04-19 — Flat JSON over SQLite
User requested a JSON-based store. CLAUDE.md mentions SQLite; we deviate intentionally because the dataset is small (tens to low-hundreds of entries) and a single committed JSON file removes a runtime dep and makes diffs reviewable in Git.

## 2026-04-19 — Hard delete (not logical delete)
CLAUDE.md says "Deletion is always logical" but that rule was written for SQLite. With a tiny editorially-curated JSON file we hard-delete; soft-delete state would only add noise to the file and the rendered GeoJSON.

## 2026-04-19 — Auth deferred
No auth on the admin yet. Intended to be run locally or behind a private deployment. To publish: deploy only `index.html`, `assets/`, `data/ai-models.geojson` to GitHub Pages — leave `backend/` and `admin.html` out of the public build.

## 2026-04-19 — D3 + TopoJSON for the map
Loaded from CDN. No build step.

## 2026-04-19 — Aesthetic: editorial cartographic
Display: Instrument Serif italic. UI: Geist. Data: Geist Mono. Palette: deep ink (#0d0b08), parchment (#ede4cc), aged gold (#c9a544), rust (#b14a2c), verdigris (#4a8474).
