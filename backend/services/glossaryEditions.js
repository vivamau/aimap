const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { slugify } = require('../utilities/slugify');
const { HttpError } = require('../middleware/errorHandler');

const INDEX_FILE = 'index.json';

function createGlossaryEditionsStore({ editionsDir }) {
  const indexPath = path.join(editionsDir, INDEX_FILE);

  async function readIndex() {
    if (!fs.existsSync(indexPath)) return { editions: [] };
    return JSON.parse(await fsp.readFile(indexPath, 'utf8'));
  }

  async function writeIndex(data) {
    const tmp = indexPath + '.tmp';
    await fsp.mkdir(editionsDir, { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
    await fsp.rename(tmp, indexPath);
  }

  async function writeSnapshotFile(filename, snapshot) {
    const filePath = path.join(editionsDir, filename);
    const tmp = filePath + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(snapshot, null, 2));
    await fsp.rename(tmp, filePath);
  }

  function makeId(label) {
    const date = new Date().toISOString().slice(0, 10);
    const ts   = Date.now().toString(36);
    const slug = slugify(label).slice(0, 40) || 'edition';
    return `${date}_${slug}-${ts}`;
  }

  async function bootstrap() {
    await fsp.mkdir(editionsDir, { recursive: true });
    if (!fs.existsSync(indexPath)) await writeIndex({ editions: [] });
  }

  async function list() {
    return (await readIndex()).editions;
  }

  async function create(terms, { label, note = '' }) {
    if (!label || !label.trim()) throw new HttpError(400, 'Edition label is required');
    const id       = makeId(label.trim());
    const filename = `${id}.json`;
    const snapshot = {
      editionId:    id,
      editionLabel: label.trim(),
      editionNote:  note.trim(),
      date:         new Date().toISOString().slice(0, 10),
      terms,
    };

    await fsp.mkdir(editionsDir, { recursive: true });
    await writeSnapshotFile(filename, snapshot);

    const entry = {
      id,
      label: label.trim(),
      note:  note.trim(),
      date:  new Date().toISOString().slice(0, 10),
      terms: terms.length,
      file:  `glossary-editions/${filename}`,
    };

    const index = await readIndex();
    index.editions.unshift(entry);
    await writeIndex(index);
    return { ...entry };
  }

  async function get(id) {
    const { editions } = await readIndex();
    if (!editions.find(e => e.id === id)) throw new HttpError(404, `Edition "${id}" not found`);
    const filePath = path.join(editionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) throw new HttpError(404, `Edition file for "${id}" is missing`);
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
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
    try { await fsp.unlink(path.join(editionsDir, `${id}.json`)); } catch {}
    return { deleted: entry.id };
  }

  return { bootstrap, list, create, get, update, remove };
}

module.exports = { createGlossaryEditionsStore };
