const express = require('express');

function glossaryRouter({ vocabDb }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ terms: vocabDb.listTerms() });
  });

  router.get('/:id', (req, res, next) => {
    try { res.json(vocabDb.getTerm(req.params.id)); }
    catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const created = await vocabDb.createTerm(req.body || {});
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const updated = await vocabDb.updateTerm(req.params.id, req.body || {});
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await vocabDb.deleteTerm(req.params.id);
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { glossaryRouter };
