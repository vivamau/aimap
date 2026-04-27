/**
 * JSON-file backed store for glossary terms.
 * Mirrors the pattern used by db.js / toolsDb.js.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { slugify } = require('../utilities/slugify');
const { HttpError } = require('../middleware/errorHandler');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sanitiseLinks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(l => ({ label: String(l.label || '').trim(), url: String(l.url || '').trim() }))
    .filter(l => l.url);
}

function sanitiseTerm(input) {
  const term = String(input.term || '').trim();
  if (!term) throw new HttpError(400, '"term" is required');
  const definition = String(input.definition || '').trim();
  if (!definition) throw new HttpError(400, '"definition" is required');
  const relatedTerms = Array.isArray(input.relatedTerms)
    ? input.relatedTerms.filter(id => typeof id === 'string' && id.trim())
    : [];
  return {
    term,
    definition,
    notes: String(input.notes || '').trim(),
    links: sanitiseLinks(input.links),
    relatedTerms,
    updatedAt: today(),
  };
}

function createGlossaryDb({ dbPath }) {
  let cache = null;

  function load() {
    if (!fs.existsSync(dbPath)) {
      cache = { terms: [] };
      return cache;
    }
    const raw = fs.readFileSync(dbPath, 'utf8');
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.terms)) cache.terms = [];
    return cache;
  }

  async function persist() {
    const tmp = dbPath + '.tmp';
    await fsp.mkdir(path.dirname(dbPath), { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(cache, null, 2));
    await fsp.rename(tmp, dbPath);
  }

  function ensureLoaded() {
    if (!cache) load();
    return cache;
  }

  function listTerms() {
    return [...ensureLoaded().terms].sort((a, b) =>
      a.term.localeCompare(b.term, undefined, { sensitivity: 'base' })
    );
  }

  function getTerm(id) {
    const t = ensureLoaded().terms.find(x => x.id === id);
    if (!t) throw new HttpError(404, `Term "${id}" not found`);
    return { ...t };
  }

  async function createTerm(input) {
    ensureLoaded();
    const sanitised = sanitiseTerm(input);
    const id = input.id || slugify(sanitised.term);
    if (!id) throw new HttpError(400, 'Cannot derive id from term');
    if (cache.terms.some(x => x.id === id)) {
      throw new HttpError(409, `Term id "${id}" already exists`);
    }
    const entry = { id, ...sanitised };
    cache.terms.push(entry);
    await persist();
    return { ...entry };
  }

  async function updateTerm(id, input) {
    ensureLoaded();
    const idx = cache.terms.findIndex(x => x.id === id);
    if (idx === -1) throw new HttpError(404, `Term "${id}" not found`);
    const sanitised = sanitiseTerm(input);
    cache.terms[idx] = { id, ...sanitised };
    await persist();
    return { ...cache.terms[idx] };
  }

  async function deleteTerm(id) {
    ensureLoaded();
    const idx = cache.terms.findIndex(x => x.id === id);
    if (idx === -1) throw new HttpError(404, `Term "${id}" not found`);
    const [removed] = cache.terms.splice(idx, 1);
    await persist();
    return { deleted: removed.id };
  }

  return { load, listTerms, getTerm, createTerm, updateTerm, deleteTerm };
}

module.exports = { createGlossaryDb };
