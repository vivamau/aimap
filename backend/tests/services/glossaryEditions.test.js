const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { createGlossaryEditionsStore } = require('../../services/glossaryEditions');

let tmpDir, editionsDir, store;

const TERMS = [
  { id: 'ml-machine-learning', term: 'ML (Machine learning)', definition: 'A field of AI.', notes: '', links: [], relatedTerms: [], updatedAt: '2026-04-28' },
  { id: 'dl-deep-learning',    term: 'DL (Deep learning)',    definition: 'Neural nets.',   notes: '', links: [], relatedTerms: ['ml-machine-learning'], updatedAt: '2026-04-28' },
];

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-glossary-editions-'));
  editionsDir = path.join(tmpDir, 'glossary-editions');
  store = createGlossaryEditionsStore({ editionsDir });
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('list()', () => {
  test('returns empty array when index does not exist', async () => {
    expect(await store.list()).toEqual([]);
  });

  test('returns editions after creating one', async () => {
    await store.create(TERMS, { label: 'Glossary Vol. I', note: 'First.' });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('Glossary Vol. I');
    expect(list[0].terms).toBe(2);
    expect(list[0].id).toMatch(/^\d{4}-\d{2}-\d{2}_/);
    expect(list[0].file).toMatch(/^glossary-editions\//);
  });
});

describe('create()', () => {
  test('writes a JSON snapshot file in the editions dir', async () => {
    const ed = await store.create(TERMS, { label: 'Vol. I', note: '' });
    const filePath = path.join(editionsDir, `${ed.id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(parsed.editionId).toBe(ed.id);
    expect(parsed.editionLabel).toBe('Vol. I');
    expect(parsed.terms).toHaveLength(2);
  });

  test('stores metadata in index.json', async () => {
    await store.create(TERMS, { label: 'Vol. I', note: '' });
    const index = JSON.parse(fs.readFileSync(path.join(editionsDir, 'index.json'), 'utf8'));
    expect(index.editions).toHaveLength(1);
    expect(index.editions[0].terms).toBe(2);
  });

  test('throws 400 when label is missing', async () => {
    await expect(store.create(TERMS, { label: '', note: '' })).rejects.toMatchObject({ status: 400 });
  });

  test('appends to index on multiple creates', async () => {
    await store.create(TERMS, { label: 'Vol. I', note: '' });
    await store.create(TERMS, { label: 'Vol. II', note: '' });
    expect(await store.list()).toHaveLength(2);
  });

  test('uses unique ids even when labels are identical', async () => {
    const a = await store.create(TERMS, { label: 'Vol. I', note: '' });
    await new Promise(r => setTimeout(r, 5));
    const b = await store.create(TERMS, { label: 'Vol. I', note: '' });
    expect(a.id).not.toBe(b.id);
  });

  test('atomic write — no .tmp lingers', async () => {
    await store.create(TERMS, { label: 'Vol. I', note: '' });
    const files = await fsp.readdir(editionsDir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });
});

describe('get()', () => {
  test('returns the snapshot for a known id', async () => {
    const ed = await store.create(TERMS, { label: 'Vol. I', note: '' });
    const snap = await store.get(ed.id);
    expect(snap.editionId).toBe(ed.id);
    expect(snap.terms).toHaveLength(2);
  });

  test('throws 404 for unknown id', async () => {
    await expect(store.get('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('update()', () => {
  test('updates label and note in the index', async () => {
    const ed = await store.create(TERMS, { label: 'Vol. I', note: 'old' });
    const updated = await store.update(ed.id, { label: 'Vol. I — Revised', note: 'new' });
    expect(updated.label).toBe('Vol. I — Revised');
    expect(updated.note).toBe('new');
    const list = await store.list();
    expect(list[0].label).toBe('Vol. I — Revised');
  });

  test('throws 400 when label is empty', async () => {
    const ed = await store.create(TERMS, { label: 'Vol. I', note: '' });
    await expect(store.update(ed.id, { label: '', note: '' })).rejects.toMatchObject({ status: 400 });
  });

  test('throws 404 for unknown id', async () => {
    await expect(store.update('nope', { label: 'X', note: '' })).rejects.toMatchObject({ status: 404 });
  });

  test('does not change other editions', async () => {
    const a = await store.create(TERMS, { label: 'Vol. I', note: '' });
    await new Promise(r => setTimeout(r, 5));
    const b = await store.create(TERMS, { label: 'Vol. II', note: '' });
    await store.update(a.id, { label: 'Vol. I — Revised', note: '' });
    const bEntry = (await store.list()).find(e => e.id === b.id);
    expect(bEntry.label).toBe('Vol. II');
  });
});

describe('remove()', () => {
  test('removes from index and deletes file', async () => {
    const ed = await store.create(TERMS, { label: 'Vol. I', note: '' });
    const filePath = path.join(editionsDir, `${ed.id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
    await store.remove(ed.id);
    expect(await store.list()).toHaveLength(0);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('returns the deleted id', async () => {
    const ed = await store.create(TERMS, { label: 'Vol. I', note: '' });
    const result = await store.remove(ed.id);
    expect(result.deleted).toBe(ed.id);
  });

  test('throws 404 for unknown id', async () => {
    await expect(store.remove('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('bootstrap()', () => {
  test('creates the dir and an empty index.json', async () => {
    await store.bootstrap();
    expect(fs.existsSync(editionsDir)).toBe(true);
    const index = JSON.parse(fs.readFileSync(path.join(editionsDir, 'index.json'), 'utf8'));
    expect(index.editions).toEqual([]);
  });

  test('is idempotent — does not overwrite existing index', async () => {
    await store.create(TERMS, { label: 'Vol. I', note: '' });
    await store.bootstrap();
    expect(await store.list()).toHaveLength(1);
  });
});
