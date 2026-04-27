/**
 * Express app factory — kept separate from `index.js` so tests can import
 * the app without binding to a port.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');

const { STATIC_ROOT, DB_PATH, GEOJSON_PATH, EDITIONS_DIR, TOOLS_DB_PATH, TOOLS_GEOJSON_PATH } = require('./config/paths');
const { createDb } = require('./services/db');
const { createToolsDb } = require('./services/toolsDb');
const { exportTo } = require('./services/geojsonExporter');
const { createEditionsStore } = require('./services/editions');
const { modelsRouter } = require('./routes/models');
const { metaRouter } = require('./routes/meta');
const { exportRouter } = require('./routes/exportRoute');
const { editionsRouter } = require('./routes/editions');
const { toolsRouter } = require('./routes/tools');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const swaggerDoc = require('./swagger.json');

function createApp(opts = {}) {
  const dbPath          = opts.dbPath          || DB_PATH;
  const geojsonPath     = opts.geojsonPath     || GEOJSON_PATH;
  const staticRoot      = opts.staticRoot      || STATIC_ROOT;
  const editionsDir     = opts.editionsDir     || EDITIONS_DIR;
  const toolsDbPath     = opts.toolsDbPath     || TOOLS_DB_PATH;
  const toolsGeojsonPath = opts.toolsGeojsonPath || TOOLS_GEOJSON_PATH;

  const db            = createDb({ dbPath });
  const editionsStore = createEditionsStore({ editionsDir });
  const toolsDb       = createToolsDb({ dbPath: toolsDbPath });
  db.load();
  toolsDb.load();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  const origins = (process.env.CORS_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (origins.length) app.use(cors({ origin: origins, credentials: true }));

  // ─── API ───
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api/meta',     metaRouter     ({ db, geojsonPath }));
  app.use('/api/models',   modelsRouter   ({ db, geojsonPath }));
  app.use('/api/export',   exportRouter   ({ db, geojsonPath }));
  app.use('/api/editions', editionsRouter ({ db, toolsDb, editionsStore }));
  app.use('/api/tools',    toolsRouter    ({ toolsDb, toolsGeojsonPath }));

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customSiteTitle: 'Atlas of AI — API',
  }));

  // ─── static site (index.html, admin.html, /assets, /data) ───
  app.use(express.static(staticRoot, { extensions: ['html'] }));
  app.get('/admin', (_req, res) => res.sendFile(path.join(staticRoot, 'admin.html')));

  app.use(notFound);
  app.use(errorHandler);

  // expose for tests / scripts
  app.locals.db             = db;
  app.locals.editionsStore  = editionsStore;
  app.locals.geojsonPath    = geojsonPath;
  app.locals.exportGeojson  = () => exportTo(geojsonPath, db.snapshot());
  app.locals.toolsDb        = toolsDb;

  return app;
}

module.exports = { createApp };
