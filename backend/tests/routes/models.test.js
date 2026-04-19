const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const request = require('supertest');
const { createApp } = require('../../app');

let tmpDir, dbPath, geojsonPath, app;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-api-'));
  dbPath = path.join(tmpDir, 'ai-models.json');
  geojsonPath = path.join(tmpDir, 'public', 'ai-models.geojson');
  app = createApp({ dbPath, geojsonPath, staticRoot: tmpDir });
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
  notes: 'note',
  modality: ['text'],
  ...over,
});

describe('GET /api/health', () => {
  test('returns ok', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe('GET /api/models', () => {
  test('returns empty list initially', async () => {
    const r = await request(app).get('/api/models');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ models: [] });
  });
});

describe('POST /api/models', () => {
  test('creates a model and writes the geojson file', async () => {
    const r = await request(app).post('/api/models').send(sample());
    expect(r.status).toBe(201);
    expect(r.body.id).toBe('test-model');
    expect(fs.existsSync(geojsonPath)).toBe(true);
    const fc = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toEqual([12.5, 41.9]);
  });

  test('400 on validation failure', async () => {
    const r = await request(app).post('/api/models').send(sample({ lat: 200 }));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/validation/i);
  });

  test('409 on duplicate id', async () => {
    await request(app).post('/api/models').send(sample());
    const r = await request(app).post('/api/models').send(sample());
    expect(r.status).toBe(409);
  });
});

describe('GET /api/models/:id', () => {
  test('returns single model', async () => {
    await request(app).post('/api/models').send(sample());
    const r = await request(app).get('/api/models/test-model');
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Test Model');
  });
  test('404 when missing', async () => {
    const r = await request(app).get('/api/models/nope');
    expect(r.status).toBe(404);
  });
});

describe('PUT /api/models/:id', () => {
  test('updates and re-exports', async () => {
    await request(app).post('/api/models').send(sample());
    const r = await request(app).put('/api/models/test-model').send({ notes: 'edited' });
    expect(r.status).toBe(200);
    expect(r.body.notes).toBe('edited');
    const fc = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
    expect(fc.features[0].properties.notes).toBe('edited');
  });
});

describe('DELETE /api/models/:id', () => {
  test('removes the model and re-exports', async () => {
    await request(app).post('/api/models').send(sample());
    const r = await request(app).delete('/api/models/test-model');
    expect(r.status).toBe(200);
    expect(r.body.deleted).toBe(true);
    const fc = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
    expect(fc.features).toHaveLength(0);
  });
  test('404 when missing', async () => {
    const r = await request(app).delete('/api/models/nope');
    expect(r.status).toBe(404);
  });
});

describe('GET/PUT /api/meta', () => {
  test('returns and updates meta', async () => {
    const g = await request(app).get('/api/meta');
    expect(g.status).toBe(200);
    expect(g.body.edition).toBeTruthy();

    const p = await request(app).put('/api/meta').send({ edition: 'Vol. II' });
    expect(p.status).toBe(200);
    expect(p.body.edition).toBe('Vol. II');
  });
});

describe('POST /api/export', () => {
  test('forces regeneration of the geojson file', async () => {
    const r = await request(app).post('/api/export');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(fs.existsSync(geojsonPath)).toBe(true);
  });
});

describe('GET /api/docs', () => {
  test('serves swagger ui', async () => {
    const r = await request(app).get('/api/docs/').redirects(1);
    expect([200, 301]).toContain(r.status);
  });
});
