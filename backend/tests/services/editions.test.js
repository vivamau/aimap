const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const {
  createEditionsStore,
} = require('../../services/editions');

let tmpDir, editionsDir, store;

const DATASET = {
  meta: { edition: 'Vol. I', updated: '2026-04-19', compiler: 'test' },
  models: [
    {
      id: 'gpt-4o', name: 'GPT-4o', organization: 'OpenAI',
      country: 'United States', city: 'San Francisco',
      lat: 37.77, lng: -122.41, type: 'proprietary', year: 2024,
      parameters: 'undisclosed', url: 'https://openai.com', notes: '', modality: ['text'],
    },
  ],
};

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-editions-'));
  editionsDir = path.join(tmpDir, 'editions');
  store = createEditionsStore({ editionsDir });
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('createEditionsStore.list()', () => {
  test('returns empty array when index does not exist yet', async () => {
    const list = await store.list();
    expect(list).toEqual([]);
  });

  test('returns editions from index after creating one', async () => {
    await store.create(DATASET, { label: 'Vol. I — MMXXVI', note: 'First release.' });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('Vol. I — MMXXVI');
    expect(list[0].note).toBe('First release.');
    expect(list[0].features).toBe(1);
    expect(list[0].id).toMatch(/^\d{4}-\d{2}-\d{2}_/);
    expect(list[0].file).toMatch(/^editions\//);
  });
});

describe('createEditionsStore.create()', () => {
  test('writes a geojson file in the editions dir', async () => {
    const ed = await store.create(DATASET, { label: 'Vol. I', note: '' });
    const filePath = path.join(path.dirname(editionsDir), ed.file);
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.features).toHaveLength(1);
  });

  test('stores edition metadata in index.json', async () => {
    await store.create(DATASET, { label: 'Vol. I', note: 'a' });
    const index = JSON.parse(
      fs.readFileSync(path.join(editionsDir, 'index.json'), 'utf8')
    );
    expect(index.editions).toHaveLength(1);
  });

  test('throws 400 when label is missing', async () => {
    await expect(store.create(DATASET, { label: '', note: '' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('appends to index on multiple creates', async () => {
    await store.create(DATASET, { label: 'Vol. I', note: '' });
    await store.create(DATASET, { label: 'Vol. II', note: '' });
    const list = await store.list();
    expect(list).toHaveLength(2);
  });

  test('uses unique ids even if labels are identical', async () => {
    const a = await store.create(DATASET, { label: 'Vol. I', note: '' });
    await new Promise(r => setTimeout(r, 5)); // ensure different timestamp
    const b = await store.create(DATASET, { label: 'Vol. I', note: '' });
    expect(a.id).not.toBe(b.id);
  });

  test('atomic write — no .tmp lingers', async () => {
    await store.create(DATASET, { label: 'Vol. I', note: '' });
    const files = await fsp.readdir(editionsDir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });
});

describe('createEditionsStore.get()', () => {
  test('returns the GeoJSON for a known edition', async () => {
    const ed = await store.create(DATASET, { label: 'Vol. I', note: '' });
    const fc = await store.get(ed.id);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
  });

  test('throws 404 for unknown id', async () => {
    await expect(store.get('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('createEditionsStore.update()', () => {
  test('updates label and note in the index', async () => {
    const ed = await store.create(DATASET, { label: 'Vol. I', note: 'old note' });
    const updated = await store.update(ed.id, { label: 'Vol. I — Revised', note: 'new note' });
    expect(updated.label).toBe('Vol. I — Revised');
    expect(updated.note).toBe('new note');
    const list = await store.list();
    expect(list[0].label).toBe('Vol. I — Revised');
  });

  test('throws 400 when label is empty', async () => {
    const ed = await store.create(DATASET, { label: 'Vol. I', note: '' });
    await expect(store.update(ed.id, { label: '', note: '' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('throws 404 for unknown id', async () => {
    await expect(store.update('nope', { label: 'X', note: '' }))
      .rejects.toMatchObject({ status: 404 });
  });

  test('does not change other editions', async () => {
    const a = await store.create(DATASET, { label: 'Vol. I', note: '' });
    await new Promise(r => setTimeout(r, 5));
    const b = await store.create(DATASET, { label: 'Vol. II', note: '' });
    await store.update(a.id, { label: 'Vol. I — Revised', note: '' });
    const list = await store.list();
    const bEntry = list.find(e => e.id === b.id);
    expect(bEntry.label).toBe('Vol. II');
  });
});

describe('createEditionsStore.remove()', () => {
  test('removes edition from index and deletes the file', async () => {
    const ed = await store.create(DATASET, { label: 'Vol. I', note: '' });
    const filePath = path.join(editionsDir, `${ed.id}.geojson`);
    expect(fs.existsSync(filePath)).toBe(true);
    await store.remove(ed.id);
    const list = await store.list();
    expect(list).toHaveLength(0);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('returns the deleted id', async () => {
    const ed = await store.create(DATASET, { label: 'Vol. I', note: '' });
    const result = await store.remove(ed.id);
    expect(result.deleted).toBe(ed.id);
  });

  test('throws 404 for unknown id', async () => {
    await expect(store.remove('nope')).rejects.toMatchObject({ status: 404 });
  });

  test('does not remove other editions', async () => {
    const a = await store.create(DATASET, { label: 'Vol. I', note: '' });
    await new Promise(r => setTimeout(r, 5));
    const b = await store.create(DATASET, { label: 'Vol. II', note: '' });
    await store.remove(a.id);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b.id);
  });
});

describe('createEditionsStore.bootstrap()', () => {
  test('creates the editions dir and an empty index.json if absent', async () => {
    await store.bootstrap();
    expect(fs.existsSync(editionsDir)).toBe(true);
    const index = JSON.parse(
      fs.readFileSync(path.join(editionsDir, 'index.json'), 'utf8')
    );
    expect(index.editions).toEqual([]);
  });

  test('is idempotent — does not overwrite existing index', async () => {
    await store.create(DATASET, { label: 'Vol. I', note: '' });
    await store.bootstrap();
    const list = await store.list();
    expect(list).toHaveLength(1);
  });
});
