const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const request = require('supertest');
const { createApp } = require('../../app');

let tmpDir, toolsDbPath, toolsGeojsonPath, app;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-tools-api-'));
  toolsDbPath = path.join(tmpDir, 'ai-tools.json');
  toolsGeojsonPath = path.join(tmpDir, 'public', 'ai-tools.geojson');
  app = createApp({ toolsDbPath, toolsGeojsonPath, staticRoot: tmpDir });
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
  notes: 'note',
  builtOn: [],
  ...over,
});

describe('GET /api/tools', () => {
  test('returns empty list initially', async () => {
    const r = await request(app).get('/api/tools');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ tools: [] });
  });
});

describe('POST /api/tools', () => {
  test('creates a tool and writes the geojson file', async () => {
    const r = await request(app).post('/api/tools').send(sample());
    expect(r.status).toBe(201);
    expect(r.body.id).toBe('test-tool');
    expect(fs.existsSync(toolsGeojsonPath)).toBe(true);
    const fc = JSON.parse(fs.readFileSync(toolsGeojsonPath, 'utf8'));
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toEqual([12.5, 41.9]);
  });

  test('400 on missing required fields', async () => {
    const r = await request(app).post('/api/tools').send({ name: 'X' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/validation/i);
  });

  test('409 on duplicate id', async () => {
    await request(app).post('/api/tools').send(sample());
    const r = await request(app).post('/api/tools').send(sample());
    expect(r.status).toBe(409);
  });
});

describe('GET /api/tools/:id', () => {
  test('returns single tool', async () => {
    await request(app).post('/api/tools').send(sample());
    const r = await request(app).get('/api/tools/test-tool');
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Test Tool');
  });

  test('404 for unknown id', async () => {
    const r = await request(app).get('/api/tools/nope');
    expect(r.status).toBe(404);
  });
});

describe('PUT /api/tools/:id', () => {
  test('updates tool and re-exports geojson', async () => {
    await request(app).post('/api/tools').send(sample());
    const r = await request(app).put('/api/tools/test-tool').send({ notes: 'edited' });
    expect(r.status).toBe(200);
    expect(r.body.notes).toBe('edited');
    const fc = JSON.parse(fs.readFileSync(toolsGeojsonPath, 'utf8'));
    expect(fc.features[0].properties.notes).toBe('edited');
  });
});

describe('DELETE /api/tools/:id', () => {
  test('removes the tool and re-exports', async () => {
    await request(app).post('/api/tools').send(sample());
    const r = await request(app).delete('/api/tools/test-tool');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: 'test-tool', deleted: true });
    const fc = JSON.parse(fs.readFileSync(toolsGeojsonPath, 'utf8'));
    expect(fc.features).toHaveLength(0);
  });

  test('404 when missing', async () => {
    const r = await request(app).delete('/api/tools/nope');
    expect(r.status).toBe(404);
  });
});
