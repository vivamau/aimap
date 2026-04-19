const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { createDb } = require('../../services/db');

let tmpDir, dbPath, db;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-db-'));
  dbPath = path.join(tmpDir, 'ai-models.json');
  db = createDb({ dbPath });
  db.load();
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

const sample = (over = {}) => ({
  name: 'Test Model',
  organization: 'Test Lab',
  country: 'Italy',
  city: 'Rome',
  lat: 41.9,
  lng: 12.5,
  type: 'open-weight',
  year: 2026,
  parameters: '7B',
  url: 'https://example.com',
  notes: 'A small example.',
  modality: ['text'],
  ...over,
});

describe('createDb()', () => {
  test('starts empty when file does not exist', () => {
    expect(db.listModels()).toEqual([]);
    expect(db.getMeta()).toMatchObject({ edition: expect.any(String) });
  });

  test('creates a model and persists to disk', async () => {
    const created = await db.createModel(sample());
    expect(created.id).toBe('test-model');
    expect(fs.existsSync(dbPath)).toBe(true);

    const onDisk = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    expect(onDisk.models).toHaveLength(1);
    expect(onDisk.models[0].name).toBe('Test Model');
  });

  test('rejects duplicate ids', async () => {
    await db.createModel(sample());
    await expect(db.createModel(sample())).rejects.toMatchObject({ status: 409 });
  });

  test('rejects invalid coordinates', async () => {
    await expect(db.createModel(sample({ lat: 200 }))).rejects.toMatchObject({ status: 400 });
    await expect(db.createModel(sample({ lng: 'abc' }))).rejects.toMatchObject({ status: 400 });
  });

  test('rejects invalid type', async () => {
    await expect(db.createModel(sample({ type: 'bogus' }))).rejects.toMatchObject({ status: 400 });
  });

  test('updates a model', async () => {
    await db.createModel(sample());
    const updated = await db.updateModel('test-model', { notes: 'edited' });
    expect(updated.notes).toBe('edited');
    expect(updated.name).toBe('Test Model');
  });

  test('update on missing id throws 404', async () => {
    await expect(db.updateModel('nope', { name: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  test('deletes a model', async () => {
    await db.createModel(sample());
    const r = await db.deleteModel('test-model');
    expect(r).toEqual({ id: 'test-model', deleted: true });
    expect(db.listModels()).toEqual([]);
  });

  test('delete on missing id throws 404', async () => {
    await expect(db.deleteModel('nope')).rejects.toMatchObject({ status: 404 });
  });

  test('getModel throws 404 when absent', () => {
    expect(() => db.getModel('nope')).toThrow();
  });

  test('updateMeta merges fields and stamps updated date', async () => {
    const next = await db.updateMeta({ edition: 'Vol. II — MMXXVI' });
    expect(next.edition).toBe('Vol. II — MMXXVI');
    expect(next.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('snapshot returns a defensive copy', async () => {
    await db.createModel(sample());
    const snap = db.snapshot();
    snap.models[0].name = 'Mutated';
    expect(db.getModel('test-model').name).toBe('Test Model');
  });

  test('falls back to default modality when none provided', async () => {
    const m = await db.createModel(sample({ modality: undefined }));
    expect(m.modality).toEqual(['text']);
  });

  test('atomic write — no .tmp lingers', async () => {
    await db.createModel(sample());
    const files = await fsp.readdir(tmpDir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });
});
