const express = require('express');
const fsp = require('fs/promises');
const path = require('path');

async function writePublicGlossary(terms, publicPath) {
  if (!publicPath) return;
  await fsp.mkdir(path.dirname(publicPath), { recursive: true });
  const tmp = publicPath + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify({ terms }, null, 2));
  await fsp.rename(tmp, publicPath);
}

function glossaryRouter({ vocabDb, glossaryPublicPath }) {
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
      await writePublicGlossary(vocabDb.listTerms(), glossaryPublicPath);
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const updated = await vocabDb.updateTerm(req.params.id, req.body || {});
      await writePublicGlossary(vocabDb.listTerms(), glossaryPublicPath);
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await vocabDb.deleteTerm(req.params.id);
      await writePublicGlossary(vocabDb.listTerms(), glossaryPublicPath);
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { glossaryRouter, writePublicGlossary };
