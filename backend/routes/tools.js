const express = require('express');
const { exportTo } = require('../services/geojsonExporter');

function toolsRouter({ toolsDb, toolsGeojsonPath }) {
  const router = express.Router();

  const exportGeo = () =>
    exportTo(toolsGeojsonPath, { meta: {}, models: toolsDb.listTools() });

  router.get('/', (req, res) => {
    res.json({ tools: toolsDb.listTools() });
  });

  router.get('/:id', (req, res, next) => {
    try { res.json(toolsDb.getTool(req.params.id)); }
    catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const created = await toolsDb.createTool(req.body || {});
      await exportGeo();
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const updated = await toolsDb.updateTool(req.params.id, req.body || {});
      await exportGeo();
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await toolsDb.deleteTool(req.params.id);
      await exportGeo();
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { toolsRouter };
