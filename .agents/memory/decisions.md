# Decisions

## 2026-04-19 — Static viewer + Node.js admin backend
The public viewer (`index.html`) stays fully static for GitHub Pages. A Node.js Express backend in `backend/` powers the admin and persists changes to a flat-JSON store at `backend/data/ai-models.json`. Every mutation regenerates `data/ai-models.geojson`, which the viewer reads.

## 2026-04-19 — Flat JSON over SQLite
User requested a JSON-based store. CLAUDE.md mentions SQLite; we deviate intentionally. The dataset is small (tens to low-hundreds of entries) and a single committed JSON file makes diffs readable in Git.

## 2026-04-19 — Hard delete (not logical delete)
CLAUDE.md says "Deletion is always logical" (written for SQLite). For a tiny editorially-curated JSON file hard-delete is cleaner; soft-delete would add noise to the GeoJSON. Deviation documented.

## 2026-04-19 — Auth deferred
No auth on the admin. Intended to be run locally or behind a private deployment. For public GitHub Pages: deploy only `index.html`, `assets/`, `data/` — keep `backend/` and `admin.html` out of the public build.

## 2026-04-19 — Editions are append-only / no deletion
Once saved, an edition is a historical record. There is intentionally no `DELETE /api/editions/:id` endpoint. Editions can only be added; this preserves the integrity of the archive.

## 2026-04-19 — Edition IDs use timestamp suffix for uniqueness
Format: `YYYY-MM-DD_<slug>-<base36-ms>`. The timestamp suffix ensures two editions with identical labels on the same day never collide, even in rapid succession.

## 2026-04-19 — editions/index.json path is relative to data root
The `file` field in each edition entry is relative to the `data/` directory (e.g. `editions/2026-04-19_vol-i.geojson`). This lets the static viewer fetch `./data/<file>` directly from GitHub Pages without any path translation.

## 2026-04-19 — D3 + TopoJSON for the map
Loaded from CDN. No build step required.

## 2026-04-19 — Aesthetic: editorial cartographic
Display: Instrument Serif italic. UI: Geist. Data: Geist Mono.
Palette: ink `#0d0b08`, parchment `#ede4cc`, aged gold `#c9a544`, rust `#b14a2c`, verdigris `#4a8474`.
