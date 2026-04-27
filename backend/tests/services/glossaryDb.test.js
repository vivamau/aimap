const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { createGlossaryDb } = require('../../services/glossaryDb');

let tmpDir, dbPath, db;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-glossary-'));
  dbPath = path.join(tmpDir, 'ai-glossary.json');
  db = createGlossaryDb({ dbPath });
  db.load();
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

const sample = (over = {}) => ({
  term: 'Machine Learning',
  definition: 'A field of AI that learns from data.',
  notes: 'Also called ML.',
  links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/ML' }],
  relatedTerms: [],
  ...over,
});

describe('createGlossaryDb()', () => {
  test('starts empty when file does not exist', () => {
    expect(db.listTerms()).toEqual([]);
  });

  test('getTerm throws 404 for unknown id', () => {
    try { db.getTerm('nope'); } catch (e) { expect(e.status).toBe(404); }
  });

  test('creates a term and persists to disk', async () => {
    const created = await db.createTerm(sample());
    expect(created.id).toBe('machine-learning');
    expect(fs.existsSync(dbPath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    expect(onDisk.terms).toHaveLength(1);
    expect(onDisk.terms[0].term).toBe('Machine Learning');
  });

  test('rejects missing term', async () => {
    await expect(db.createTerm({ definition: 'x' })).rejects.toMatchObject({ status: 400 });
  });

  test('rejects missing definition', async () => {
    await expect(db.createTerm({ term: 'X' })).rejects.toMatchObject({ status: 400 });
  });

  test('rejects duplicate ids', async () => {
    await db.createTerm(sample());
    await expect(db.createTerm(sample())).rejects.toMatchObject({ status: 409 });
  });

  test('accepts custom id', async () => {
    const created = await db.createTerm(sample({ id: 'ml-custom' }));
    expect(created.id).toBe('ml-custom');
  });

  test('listTerms returns terms sorted alphabetically', async () => {
    await db.createTerm(sample({ term: 'Zebra Learning', definition: 'Z' }));
    await db.createTerm(sample({ term: 'Alpha Learning', definition: 'A' }));
    const list = db.listTerms();
    expect(list[0].term).toBe('Alpha Learning');
    expect(list[1].term).toBe('Zebra Learning');
  });

  test('stores links correctly', async () => {
    const t = await db.createTerm(sample());
    expect(t.links).toEqual([{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/ML' }]);
  });

  test('filters links without url', async () => {
    const t = await db.createTerm(sample({ links: [{ label: 'no-url' }, { label: 'ok', url: 'https://x.com' }] }));
    expect(t.links).toHaveLength(1);
    expect(t.links[0].label).toBe('ok');
  });

  test('defaults links to [] when not provided', async () => {
    const t = await db.createTerm(sample({ links: undefined }));
    expect(t.links).toEqual([]);
  });

  test('stores relatedTerms array', async () => {
    const t = await db.createTerm(sample({ relatedTerms: ['deep-learning'] }));
    expect(t.relatedTerms).toEqual(['deep-learning']);
  });

  test('defaults relatedTerms to [] when not an array', async () => {
    const t = await db.createTerm(sample({ relatedTerms: null }));
    expect(t.relatedTerms).toEqual([]);
  });

  test('sets updatedAt to today', async () => {
    const t = await db.createTerm(sample());
    expect(t.updatedAt).toBe(new Date().toISOString().slice(0, 10));
  });

  test('updates a term', async () => {
    await db.createTerm(sample());
    const updated = await db.updateTerm('machine-learning', { ...sample(), notes: 'edited' });
    expect(updated.notes).toBe('edited');
    expect(updated.term).toBe('Machine Learning');
  });

  test('updateTerm throws 404 for unknown id', async () => {
    await expect(db.updateTerm('nope', sample())).rejects.toMatchObject({ status: 404 });
  });

  test('deletes a term', async () => {
    await db.createTerm(sample());
    const r = await db.deleteTerm('machine-learning');
    expect(r).toEqual({ deleted: 'machine-learning' });
    expect(db.listTerms()).toEqual([]);
  });

  test('deleteTerm throws 404 for unknown id', async () => {
    await expect(db.deleteTerm('nope')).rejects.toMatchObject({ status: 404 });
  });

  test('atomic write — no .tmp lingers', async () => {
    await db.createTerm(sample());
    const files = await fsp.readdir(tmpDir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });

  test('reloads persisted data on a fresh instance', async () => {
    await db.createTerm(sample());
    const db2 = createGlossaryDb({ dbPath });
    db2.load();
    expect(db2.listTerms()).toHaveLength(1);
    expect(db2.getTerm('machine-learning').term).toBe('Machine Learning');
  });
});
