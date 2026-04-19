const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const request = require('supertest');
const { createApp } = require('../../app');

let tmpDir, dbPath, geojsonPath, editionsDir, app;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-editions-api-'));
  dbPath      = path.join(tmpDir, 'ai-models.json');
  geojsonPath = path.join(tmpDir, 'public', 'ai-models.geojson');
  editionsDir = path.join(tmpDir, 'public', 'editions');
  app = createApp({ dbPath, geojsonPath, editionsDir, staticRoot: tmpDir });

  // seed a model so snapshots are non-empty
  await request(app).post('/api/models').send({
    name: 'Test Model', organization: 'Test Lab',
    country: 'Italy', city: 'Rome',
    lat: 41.9, lng: 12.5,
    type: 'open-weight', year: 2026,
    parameters: '7B', url: 'https://x', notes: '', modality: ['text'],
  });
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('GET /api/editions', () => {
  test('returns empty list initially', async () => {
    const r = await request(app).get('/api/editions');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ editions: [] });
  });
});

describe('POST /api/editions', () => {
  test('creates an edition and returns metadata', async () => {
    const r = await request(app).post('/api/editions')
      .send({ label: 'Vol. I — Spring 2026', note: 'First release.' });
    expect(r.status).toBe(201);
    expect(r.body.label).toBe('Vol. I — Spring 2026');
    expect(r.body.note).toBe('First release.');
    expect(r.body.features).toBe(1);
    expect(r.body.file).toMatch(/^editions\//);
  });

  test('400 when label is missing', async () => {
    const r = await request(app).post('/api/editions').send({ note: 'no label' });
    expect(r.status).toBe(400);
  });

  test('edition appears in the list', async () => {
    await request(app).post('/api/editions')
      .send({ label: 'Vol. I', note: '' });
    const r = await request(app).get('/api/editions');
    expect(r.status).toBe(200);
    expect(r.body.editions).toHaveLength(1);
  });
});

describe('GET /api/editions/:id', () => {
  test('returns the GeoJSON for a known edition', async () => {
    const created = await request(app).post('/api/editions')
      .send({ label: 'Vol. I', note: '' });
    const id = created.body.id;
    const r = await request(app).get(`/api/editions/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.type).toBe('FeatureCollection');
    expect(r.body.features).toHaveLength(1);
  });

  test('404 for unknown id', async () => {
    const r = await request(app).get('/api/editions/nope');
    expect(r.status).toBe(404);
  });
});
