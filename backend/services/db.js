/**
 * JSON-file backed "database".
 * - Atomic writes (write to .tmp then rename).
 * - In-memory cache reloaded on process boot.
 * - Single source of truth for the catalogue.
 *
 * After every mutation, callers should invoke `geojsonExporter.exportTo(...)`
 * — the model service does so automatically.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { slugify } = require('../utilities/slugify');
const { HttpError } = require('../middleware/errorHandler');

const REQUIRED = ['name', 'organization', 'lat', 'lng'];
const TYPES = new Set(['proprietary', 'open-weight']);
const VALID_MODALITIES = new Set(['text', 'image', 'audio', 'video', 'code', '3d']);

function createDb({ dbPath }) {
  let cache = null;

  function load() {
    if (!fs.existsSync(dbPath)) {
      cache = {
        meta: { edition: 'Vol. I', updated: today(), compiler: '' },
        models: [],
      };
      return cache;
    }
    const raw = fs.readFileSync(dbPath, 'utf8');
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.models)) cache.models = [];
    if (!cache.meta) cache.meta = { edition: 'Vol. I', updated: today(), compiler: '' };
    return cache;
  }

  async function persist() {
    cache.meta.updated = today();
    const tmp = dbPath + '.tmp';
    await fsp.mkdir(path.dirname(dbPath), { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(cache, null, 2));
    await fsp.rename(tmp, dbPath);
  }

  function ensureLoaded() {
    if (!cache) load();
    return cache;
  }

  // ─── meta ───
  function getMeta() { return { ...ensureLoaded().meta }; }
  async function updateMeta(partial) {
    ensureLoaded();
    cache.meta = { ...cache.meta, ...sanitiseMeta(partial) };
    await persist();
    return getMeta();
  }

  // ─── models ───
  function listModels() { return [...ensureLoaded().models]; }
  function getModel(id) {
    const m = ensureLoaded().models.find(x => x.id === id);
    if (!m) throw new HttpError(404, `Model "${id}" not found`);
    return { ...m };
  }
  async function createModel(input) {
    ensureLoaded();
    const model = sanitiseModel(input);
    if (!model.id) model.id = slugify(model.name);
    if (!model.id) throw new HttpError(400, 'Cannot derive id from name');
    if (cache.models.some(x => x.id === model.id)) {
      throw new HttpError(409, `Model id "${model.id}" already exists`);
    }
    cache.models.unshift(model);
    await persist();
    return { ...model };
  }
  async function updateModel(id, input) {
    ensureLoaded();
    const i = cache.models.findIndex(x => x.id === id);
    if (i === -1) throw new HttpError(404, `Model "${id}" not found`);
    const merged = sanitiseModel({ ...cache.models[i], ...input, id });
    cache.models[i] = merged;
    await persist();
    return { ...merged };
  }
  async function deleteModel(id) {
    ensureLoaded();
    const before = cache.models.length;
    cache.models = cache.models.filter(x => x.id !== id);
    if (cache.models.length === before) {
      throw new HttpError(404, `Model "${id}" not found`);
    }
    await persist();
    return { id, deleted: true };
  }

  function snapshot() {
    ensureLoaded();
    return { meta: { ...cache.meta }, models: cache.models.map(m => ({ ...m })) };
  }

  return {
    load, snapshot,
    getMeta, updateMeta,
    listModels, getModel, createModel, updateModel, deleteModel,
  };
}

// ─── helpers ───────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }

function sanitiseMeta(m) {
  const out = {};
  if (typeof m.edition === 'string')  out.edition  = m.edition.trim();
  if (typeof m.compiler === 'string') out.compiler = m.compiler.trim();
  return out;
}

function sanitiseModel(input) {
  const errors = [];
  for (const k of REQUIRED) {
    if (input[k] === undefined || input[k] === null || input[k] === '') {
      errors.push(`Missing required field "${k}"`);
    }
  }
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (Number.isNaN(lat) || lat < -90  || lat > 90)  errors.push('lat must be between -90 and 90');
  if (Number.isNaN(lng) || lng < -180 || lng > 180) errors.push('lng must be between -180 and 180');

  const type = input.type || 'proprietary';
  if (!TYPES.has(type)) errors.push(`type must be one of: ${[...TYPES].join(', ')}`);

  const modality = Array.isArray(input.modality) && input.modality.length
    ? input.modality.filter(m => VALID_MODALITIES.has(m))
    : ['text'];

  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  const submodels = Array.isArray(input.submodels)
    ? input.submodels
        .filter(s => s.name || s.parameters)
        .map(sanitiseSubmodel)
    : [];

  return {
    id: input.id ? slugify(input.id) : slugify(input.name),
    name: String(input.name).trim(),
    organization: String(input.organization).trim(),
    country: String(input.country || '').trim(),
    city: String(input.city || '').trim(),
    lat, lng,
    type,
    year: input.year != null ? parseInt(input.year, 10) : new Date().getFullYear(),
    parameters: String(input.parameters || 'undisclosed').trim(),
    url: String(input.url || '').trim(),
    notes: String(input.notes || '').trim(),
    modality,
    submodels,
  };
}

function sanitiseSubmodel(s) {
  return {
    name:           String(s.name           ?? '').trim(),
    version:        String(s.version        ?? '').trim(),
    parameters:     String(s.parameters     ?? '').trim(),
    ollamaUrl:      String(s.ollamaUrl      ?? '').trim(),
    huggingfaceUrl: String(s.huggingfaceUrl ?? '').trim(),
    addedAt:        String(s.addedAt        ?? today()).trim(),
  };
}

module.exports = { createDb, sanitiseModel };
