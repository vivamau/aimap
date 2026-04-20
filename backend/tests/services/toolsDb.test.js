const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { createToolsDb } = require('../../services/toolsDb');

let tmpDir, dbPath, db;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-tools-'));
  dbPath = path.join(tmpDir, 'ai-tools.json');
  db = createToolsDb({ dbPath });
  db.load();
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

const sample = (over = {}) => ({
  name: 'Test Tool',
  organization: 'Test Org',
  country: 'Italy',
  city: 'Rome',
  lat: 41.9,
  lng: 12.5,
  category: 'devtool',
  year: 2024,
  url: 'https://example.com',
  notes: 'A test tool.',
  builtOn: [],
  ...over,
});

describe('createToolsDb()', () => {
  test('starts empty when file does not exist', () => {
    expect(db.listTools()).toEqual([]);
  });

  test('getTool throws 404 for unknown id', () => {
    expect(() => db.getTool('nope')).toThrow();
    try { db.getTool('nope'); } catch (e) { expect(e.status).toBe(404); }
  });

  test('creates a tool and persists to disk', async () => {
    const created = await db.createTool(sample());
    expect(created.id).toBe('test-tool');
    expect(fs.existsSync(dbPath)).toBe(true);

    const onDisk = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    expect(onDisk.tools).toHaveLength(1);
    expect(onDisk.tools[0].name).toBe('Test Tool');
  });

  test('rejects missing required fields', async () => {
    await expect(db.createTool({})).rejects.toMatchObject({ status: 400 });
    await expect(db.createTool({ name: 'X', organization: 'Y', lat: 0 })).rejects.toMatchObject({ status: 400 });
  });

  test('rejects lat out of range', async () => {
    await expect(db.createTool(sample({ lat: 200 }))).rejects.toMatchObject({ status: 400 });
  });

  test('rejects lng out of range', async () => {
    await expect(db.createTool(sample({ lng: -200 }))).rejects.toMatchObject({ status: 400 });
  });

  test('rejects invalid category', async () => {
    await expect(db.createTool(sample({ category: 'bogus' }))).rejects.toMatchObject({ status: 400 });
  });

  test('rejects duplicate ids', async () => {
    await db.createTool(sample());
    await expect(db.createTool(sample())).rejects.toMatchObject({ status: 409 });
  });

  test('updates a tool', async () => {
    await db.createTool(sample());
    const updated = await db.updateTool('test-tool', { notes: 'edited' });
    expect(updated.notes).toBe('edited');
    expect(updated.name).toBe('Test Tool');
  });

  test('updateTool throws 404 for unknown id', async () => {
    await expect(db.updateTool('nope', { name: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  test('deletes a tool', async () => {
    await db.createTool(sample());
    const r = await db.deleteTool('test-tool');
    expect(r).toEqual({ id: 'test-tool', deleted: true });
    expect(db.listTools()).toEqual([]);
  });

  test('deleteTool throws 404 for unknown id', async () => {
    await expect(db.deleteTool('nope')).rejects.toMatchObject({ status: 404 });
  });

  test('stores builtOn array', async () => {
    const t = await db.createTool(sample({ builtOn: ['gpt-4o', 'claude-3-5-sonnet'] }));
    expect(t.builtOn).toEqual(['gpt-4o', 'claude-3-5-sonnet']);
  });

  test('defaults builtOn to []', async () => {
    const t = await db.createTool(sample({ builtOn: undefined }));
    expect(t.builtOn).toEqual([]);
  });

  test('defaults category to devtool when not provided', async () => {
    const t = await db.createTool(sample({ category: undefined }));
    expect(t.category).toBe('devtool');
  });

  test('defaults year to current year when not provided', async () => {
    const t = await db.createTool(sample({ year: undefined }));
    expect(t.year).toBe(new Date().getFullYear());
  });

  test('atomic write — no .tmp lingers', async () => {
    await db.createTool(sample());
    const files = await fsp.readdir(tmpDir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });
});
