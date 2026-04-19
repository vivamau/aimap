#!/usr/bin/env node
/**
 * Standalone exporter — reads the JSON DB and writes the GeoJSON file.
 * Useful in CI or as a pre-commit hook.
 *   $ node scripts/export-geojson.js
 */
const path = require('path');
const { loadEnv } = require('../utilities/loadEnv');
loadEnv(path.join(__dirname, '..', '.env'));

const { createDb } = require('../services/db');
const { exportTo } = require('../services/geojsonExporter');
const { DB_PATH, GEOJSON_PATH } = require('../config/paths');

(async () => {
  const db = createDb({ dbPath: DB_PATH });
  db.load();
  const fc = await exportTo(GEOJSON_PATH, db.snapshot());
  console.log(`✦ wrote ${fc.features.length} features → ${GEOJSON_PATH}`);
})().catch(err => { console.error(err); process.exit(1); });
