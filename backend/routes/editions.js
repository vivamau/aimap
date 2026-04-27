const express = require('express');

function editionsRouter({ db, toolsDb, editionsStore }) {
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
      const dataset = { ...db.snapshot(), tools: toolsDb.listTools() };
      const entry = await editionsStore.create(dataset, { label, note });
      res.status(201).json(entry);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const fc = await editionsStore.get(req.params.id);
      res.json(fc);
    } catch (err) { next(err); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const { label, note } = req.body || {};
      const updated = await editionsStore.update(req.params.id, { label, note });
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await editionsStore.remove(req.params.id);
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { editionsRouter };
