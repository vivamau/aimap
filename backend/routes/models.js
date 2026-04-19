const express = require('express');
const { exportTo } = require('../services/geojsonExporter');

function modelsRouter({ db, geojsonPath }) {
  const router = express.Router();

  const exportGeo = () => exportTo(geojsonPath, db.snapshot());

  router.get('/', (req, res) => {
    res.json({ models: db.listModels() });
  });

  router.get('/:id', (req, res, next) => {
    try { res.json(db.getModel(req.params.id)); }
    catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const created = await db.createModel(req.body || {});
      await exportGeo();
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const updated = await db.updateModel(req.params.id, req.body || {});
      await exportGeo();
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await db.deleteModel(req.params.id);
      await exportGeo();
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { modelsRouter };
