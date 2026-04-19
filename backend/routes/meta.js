const express = require('express');
const { exportTo } = require('../services/geojsonExporter');

function metaRouter({ db, geojsonPath }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.getMeta());
  });

  router.put('/', async (req, res, next) => {
    try {
      const next_ = await db.updateMeta(req.body || {});
      await exportTo(geojsonPath, db.snapshot());
      res.json(next_);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { metaRouter };
