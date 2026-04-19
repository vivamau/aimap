const express = require('express');

function editionsRouter({ db, editionsStore }) {
  const router = express.Router();

  router.get('/', async (_req, res, next) => {
    try {
      const editions = await editionsStore.list();
      res.json({ editions });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { label, note = '' } = req.body || {};
      const entry = await editionsStore.create(db.snapshot(), { label, note });
      res.status(201).json(entry);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const fc = await editionsStore.get(req.params.id);
      res.json(fc);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { editionsRouter };
