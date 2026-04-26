/**
 * Editions store — manages named GeoJSON snapshots of the catalogue.
 *
 * Layout on disk (inside `editionsDir`):
 *   index.json          — manifest: array of edition metadata
 *   YYYY-MM-DD_<slug>.geojson — individual snapshot files
 *
 * The `file` field in each entry is relative to the parent of `editionsDir`
 * (i.e. the public data root) so the static viewer can fetch it directly:
 *   fetch('./data/editions/2026-04-19_vol-i.geojson')
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { toFeatureCollection } = require('./geojsonExporter');
const { slugify } = require('../utilities/slugify');
const { HttpError } = require('../middleware/errorHandler');

const INDEX_FILE = 'index.json';

function createEditionsStore({ editionsDir }) {
  const indexPath = path.join(editionsDir, INDEX_FILE);

  // ── private helpers ────────────────────────────────────────

  async function readIndex() {
    if (!fs.existsSync(indexPath)) return { editions: [] };
    const raw = await fsp.readFile(indexPath, 'utf8');
    return JSON.parse(raw);
  }

  async function writeIndex(data) {
    const tmp = indexPath + '.tmp';
    await fsp.mkdir(editionsDir, { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
    await fsp.rename(tmp, indexPath);
  }

  async function writeEditionFile(filename, fc) {
    const filePath = path.join(editionsDir, filename);
    const tmp = filePath + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(fc, null, 2));
    await fsp.rename(tmp, filePath);
  }

  function makeId(label) {
    const date = new Date().toISOString().slice(0, 10);
    const ts   = Date.now().toString(36);
    const slug = slugify(label).slice(0, 40) || 'edition';
    return `${date}_${slug}-${ts}`;
  }

  // ── public API ────────────────────────────────────────────

  async function bootstrap() {
    await fsp.mkdir(editionsDir, { recursive: true });
    if (!fs.existsSync(indexPath)) {
      await writeIndex({ editions: [] });
    }
  }

  async function list() {
    const { editions } = await readIndex();
    return editions;
  }

  async function create(dataset, { label, note = '' }) {
    if (!label || !label.trim()) {
      throw new HttpError(400, 'Edition label is required');
    }
    const id       = makeId(label.trim());
    const filename = `${id}.geojson`;
    const fc       = toFeatureCollection(dataset);
    fc.editionId   = id;
    fc.editionLabel = label.trim();
    fc.editionNote  = note.trim();

    await fsp.mkdir(editionsDir, { recursive: true });
    await writeEditionFile(filename, fc);

    const entry = {
      id,
      label: label.trim(),
      note: note.trim(),
      date: new Date().toISOString().slice(0, 10),
      features: fc.features.length,
      file: `editions/${filename}`,
    };

    const index = await readIndex();
    index.editions.unshift(entry); // newest first
    await writeIndex(index);

    return { ...entry };
  }

  async function get(id) {
    const { editions } = await readIndex();
    const entry = editions.find(e => e.id === id);
    if (!entry) throw new HttpError(404, `Edition "${id}" not found`);

    const filePath = path.join(editionsDir, `${id}.geojson`);
    if (!fs.existsSync(filePath)) {
      throw new HttpError(404, `Edition file for "${id}" is missing`);
    }
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  }

  async function update(id, { label, note = '' }) {
    if (!label || !label.trim()) throw new HttpError(400, 'Edition label is required');
    const index = await readIndex();
    const entry = index.editions.find(e => e.id === id);
    if (!entry) throw new HttpError(404, `Edition "${id}" not found`);
    entry.label = label.trim();
    entry.note  = note.trim();
    await writeIndex(index);
    return { ...entry };
  }

  async function remove(id) {
    const index = await readIndex();
    const idx = index.editions.findIndex(e => e.id === id);
    if (idx === -1) throw new HttpError(404, `Edition "${id}" not found`);
    const [entry] = index.editions.splice(idx, 1);
    await writeIndex(index);
    const filePath = path.join(editionsDir, `${id}.geojson`);
    try { await fsp.unlink(filePath); } catch {}
    return { deleted: entry.id };
  }

  return { bootstrap, list, create, get, update, remove };
}

module.exports = { createEditionsStore };
