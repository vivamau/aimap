/**
 * JSON-file backed store for AI tools.
 * - Atomic writes (write to .tmp then rename).
 * - In-memory cache reloaded on process boot.
 *
 * After every mutation, callers should invoke `geojsonExporter.exportTo(...)`
 * — the tools route does so automatically.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { slugify } = require('../utilities/slugify');
const { HttpError } = require('../middleware/errorHandler');

const REQUIRED = ['name', 'organization', 'lat', 'lng'];
const VALID_CATEGORIES = new Set(['assistant', 'search', 'ide', 'codegen', 'devtool', 'text-to-image', 'text-to-speech', 'text-to-video', 'music','local LLM tool']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function createToolsDb({ dbPath }) {
  let cache = null;

  function load() {
    if (!fs.existsSync(dbPath)) {
      cache = { tools: [] };
      return cache;
    }
    const raw = fs.readFileSync(dbPath, 'utf8');
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.tools)) cache.tools = [];
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

  // ─── tools ───
  function listTools() { return [...ensureLoaded().tools]; }

  function getTool(id) {
    const t = ensureLoaded().tools.find(x => x.id === id);
    if (!t) throw new HttpError(404, `Tool "${id}" not found`);
    return { ...t };
  }

  async function createTool(input) {
    ensureLoaded();
    const tool = sanitiseTool(input);
    if (!tool.id) tool.id = slugify(tool.name);
    if (!tool.id) throw new HttpError(400, 'Cannot derive id from name');
    if (cache.tools.some(x => x.id === tool.id)) {
      throw new HttpError(409, `Tool id "${tool.id}" already exists`);
    }
    cache.tools.unshift(tool);
    await persist();
    return { ...tool };
  }

  async function updateTool(id, input) {
    ensureLoaded();
    const i = cache.tools.findIndex(x => x.id === id);
    if (i === -1) throw new HttpError(404, `Tool "${id}" not found`);
    const merged = sanitiseTool({ ...cache.tools[i], ...input, id });
    cache.tools[i] = merged;
    await persist();
    return { ...merged };
  }

  async function deleteTool(id) {
    ensureLoaded();
    const before = cache.tools.length;
    cache.tools = cache.tools.filter(x => x.id !== id);
    if (cache.tools.length === before) {
      throw new HttpError(404, `Tool "${id}" not found`);
    }
    await persist();
    return { id, deleted: true };
  }

  return {
    load,
    listTools, getTool, createTool, updateTool, deleteTool,
  };
}

// ─── helpers ───────────────────────────────────────────────

function sanitiseTool(input) {
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

  const category = input.category || 'devtool';
  if (!VALID_CATEGORIES.has(category)) {
    errors.push(`category must be one of: ${[...VALID_CATEGORIES].join(', ')}`);
  }

  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  const builtOn = Array.isArray(input.builtOn) ? input.builtOn.map(String) : [];
  const links = Array.isArray(input.links)
    ? input.links.filter(l => l && l.url).map(l => ({ label: String(l.label || '').trim(), url: String(l.url).trim() }))
    : [];

  const releaseDate = input.releaseDate && ISO_DATE.test(input.releaseDate)
    ? input.releaseDate : '';
  const retiredDate = input.retiredDate && ISO_DATE.test(input.retiredDate)
    ? input.retiredDate : '';

  return {
    id: input.id ? slugify(input.id) : slugify(input.name),
    name: String(input.name).trim(),
    organization: String(input.organization).trim(),
    country: String(input.country || '').trim(),
    city: String(input.city || '').trim(),
    lat, lng,
    category,
    year: input.year != null ? parseInt(input.year, 10) : new Date().getFullYear(),
    releaseDate,
    retiredDate,
    url: String(input.url || '').trim(),
    notes: String(input.notes || '').trim(),
    builtOn,
    links,
  };
}

module.exports = { createToolsDb, sanitiseTool };
