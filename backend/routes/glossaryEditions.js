const express = require('express');

function glossaryEditionsRouter({ vocabDb, glossaryEditionsStore }) {
  const router = express.Router();

  router.get('/', async (_req, res, next) => {
    try { res.json({ editions: await glossaryEditionsStore.list() }); }
    catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { label, note = '' } = req.body || {};
      const terms = vocabDb.listTerms();
      res.status(201).json(await glossaryEditionsStore.create(terms, { label, note }));
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try { res.json(await glossaryEditionsStore.get(req.params.id)); }
    catch (err) { next(err); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const { label, note } = req.body || {};
      res.json(await glossaryEditionsStore.update(req.params.id, { label, note }));
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try { res.json(await glossaryEditionsStore.remove(req.params.id)); }
    catch (err) { next(err); }
  });

  return router;
}

module.exports = { glossaryEditionsRouter };
