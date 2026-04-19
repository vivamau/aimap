# Progress

## 2026-04-19
- Initial scaffold of the static "Atlas of AI" viewer + admin (localStorage)
- Replaced localStorage with a Node.js Express backend in `backend/`
- Flat-JSON "database" at `backend/data/ai-models.json` with atomic writes
- API: GET/POST/PUT/DELETE `/api/models`, GET/PUT `/api/meta`, POST `/api/export`, GET `/api/health`
- Swagger UI served at `/api/docs`
- Every mutation regenerates the public `data/ai-models.geojson` (FeatureCollection)
- `index.html` (atlas.js) now reads the GeoJSON; admin.html (desk.js) talks to the API
- Tests: 42 Jest + Supertest specs, 94.7% line coverage, branches 75% (above 70 threshold)
- Smoke-tested live: health, list, create, delete, geojson regen, swagger, static routes — all 200
