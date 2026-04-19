const path = require('path');
const { loadEnv } = require('./utilities/loadEnv');
loadEnv(path.join(__dirname, '.env'));

const { createApp } = require('./app');
const { GEOJSON_PATH } = require('./config/paths');

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = createApp();

(async () => {
  try {
    await app.locals.editionsStore.bootstrap();
    console.log('[bootstrap] editions store ready');
  } catch (err) {
    console.error('[bootstrap] failed to bootstrap editions store', err);
  }

  try {
    await app.locals.exportGeojson();
    console.log(`[bootstrap] regenerated GeoJSON → ${GEOJSON_PATH}`);
  } catch (err) {
    console.error('[bootstrap] failed initial GeoJSON export', err);
  }

  app.listen(PORT, () => {
    console.log(`\n  ATLAS · Editorial Desk listening on http://localhost:${PORT}`);
    console.log(`  ├── Public viewer  →  http://localhost:${PORT}/`);
    console.log(`  ├── Editorial Desk →  http://localhost:${PORT}/admin.html`);
    console.log(`  └── API docs       →  http://localhost:${PORT}/api/docs\n`);
  });
})();
