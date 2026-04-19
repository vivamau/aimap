# Lessons learned

## Testing
- Run tests from `backend/` — the root has no `package.json`. Always `cd backend && npm test`.
- Port conflicts (EADDRINUSE) happen if a previous test server wasn't killed. Prefer `createApp()` factory + Supertest (no `.listen()`) for integration tests; only bind a port in `index.js`.
- Coverage thresholds in `package.json` fail the Jest process even when all tests pass — check `--coverage` output separately if a CI gate fails.

## Atomic file writes
- Write to `<file>.tmp` then `fs.rename()`. Never write directly to the target path — a crash mid-write corrupts the file. Applied to: `db.js`, `geojsonExporter.js`, `editions.js`.

## GeoJSON coordinate order
- GeoJSON spec mandates `[longitude, latitude]` — the reverse of the intuitive `(lat, lng)` order. D3 projection functions also expect `[lng, lat]`. Always destructure explicitly: `const { lat, lng, ...properties } = model`.

## Static + API on one Express server
- `express.static(repoRoot)` serves `data/editions/index.json` and individual edition GeoJSON files automatically — no extra route needed. The viewer can fetch them directly.
- Tests override `staticRoot` to a temp dir so they never touch real data files.

## Editions index must be bootstrapped before first use
- The viewer fetches `data/editions/index.json` on init. If the file doesn't exist the fetch 404s. Solution: seed an empty `{"editions":[]}` file in the repo AND call `editionsStore.bootstrap()` on server startup so the index always exists regardless of deploy order.
