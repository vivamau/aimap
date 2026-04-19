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

  // ── submodels ──────────────────────────────────────────────

  const sampleSubmodel = (over = {}) => ({
    name: 'test-model:7b',
    version: '1.0',
    parameters: '7B',
    ollamaUrl: 'https://ollama.com/library/test-model:7b',
    huggingfaceUrl: 'https://huggingface.co/TestLab/test-model-7b',
    addedAt: '2026-04-19',
    ...over,
  });

  test('saves submodels array with a model', async () => {
    const m = await db.createModel(sample({ submodels: [sampleSubmodel()] }));
    expect(m.submodels).toHaveLength(1);
    expect(m.submodels[0].name).toBe('test-model:7b');
    expect(m.submodels[0].parameters).toBe('7B');
  });

  test('defaults to empty submodels array when not provided', async () => {
    const m = await db.createModel(sample());
    expect(m.submodels).toEqual([]);
  });

  test('persists submodels to disk', async () => {
    await db.createModel(sample({ submodels: [sampleSubmodel()] }));
    const onDisk = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    expect(onDisk.models[0].submodels).toHaveLength(1);
  });

  test('updates submodels via updateModel', async () => {
    await db.createModel(sample({ submodels: [sampleSubmodel()] }));
    const updated = await db.updateModel('test-model', {
      submodels: [sampleSubmodel(), sampleSubmodel({ name: 'test-model:14b', parameters: '14B' })],
    });
    expect(updated.submodels).toHaveLength(2);
    expect(updated.submodels[1].parameters).toBe('14B');
  });

  test('filters out submodels with no name and no parameters', async () => {
    const m = await db.createModel(sample({
      submodels: [sampleSubmodel(), { name: '', parameters: '', version: '' }],
    }));
    expect(m.submodels).toHaveLength(1);
  });

  test('sanitises each submodel field to a string', async () => {
    const m = await db.createModel(sample({
      submodels: [{ name: 'x', version: 2, parameters: 7, ollamaUrl: null }],
    }));
    expect(typeof m.submodels[0].version).toBe('string');
    expect(typeof m.submodels[0].parameters).toBe('string');
    expect(m.submodels[0].ollamaUrl).toBe('');
  });

  test('stamps today as addedAt when not provided', async () => {
    const m = await db.createModel(sample({
      submodels: [{ name: 'test-model:3b', parameters: '3B' }],
    }));
    expect(m.submodels[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
