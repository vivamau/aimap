const express = require('express');
const path = require('path');
const { exportTo } = require('../services/geojsonExporter');

function exportRouter({ db, geojsonPath }) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      const fc = await exportTo(geojsonPath, db.snapshot());
      res.json({
        ok: true,
        path: path.relative(process.cwd(), geojsonPath),
        features: fc.features.length,
      });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { exportRouter };
