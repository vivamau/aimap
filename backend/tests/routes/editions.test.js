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

describe('PUT /api/editions/:id', () => {
  test('updates label and note, returns updated entry', async () => {
    const created = await request(app).post('/api/editions')
      .send({ label: 'Vol. I', note: 'old' });
    const id = created.body.id;
    const r = await request(app).put(`/api/editions/${id}`)
      .send({ label: 'Vol. I — Revised', note: 'new note' });
    expect(r.status).toBe(200);
    expect(r.body.label).toBe('Vol. I — Revised');
    expect(r.body.note).toBe('new note');
  });

  test('change is reflected in the list', async () => {
    const created = await request(app).post('/api/editions')
      .send({ label: 'Vol. I', note: '' });
    await request(app).put(`/api/editions/${created.body.id}`)
      .send({ label: 'Vol. I — Revised', note: '' });
    const list = await request(app).get('/api/editions');
    expect(list.body.editions[0].label).toBe('Vol. I — Revised');
  });

  test('400 when label is missing', async () => {
    const created = await request(app).post('/api/editions')
      .send({ label: 'Vol. I', note: '' });
    const r = await request(app).put(`/api/editions/${created.body.id}`)
      .send({ label: '', note: '' });
    expect(r.status).toBe(400);
  });

  test('404 for unknown id', async () => {
    const r = await request(app).put('/api/editions/nope')
      .send({ label: 'X', note: '' });
    expect(r.status).toBe(404);
  });
});

describe('DELETE /api/editions/:id', () => {
  test('removes the edition and returns deleted id', async () => {
    const created = await request(app).post('/api/editions')
      .send({ label: 'Vol. I', note: '' });
    const id = created.body.id;
    const r = await request(app).delete(`/api/editions/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.deleted).toBe(id);
  });

  test('edition no longer appears in list after deletion', async () => {
    const created = await request(app).post('/api/editions')
      .send({ label: 'Vol. I', note: '' });
    await request(app).delete(`/api/editions/${created.body.id}`);
    const list = await request(app).get('/api/editions');
    expect(list.body.editions).toHaveLength(0);
  });

  test('404 for unknown id', async () => {
    const r = await request(app).delete('/api/editions/nope');
    expect(r.status).toBe(404);
  });
});
