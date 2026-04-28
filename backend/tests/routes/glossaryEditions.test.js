const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const request = require('supertest');
const { createApp } = require('../../app');

let tmpDir, vocabDbPath, glossaryEditionsDir, app;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-glossary-editions-api-'));
  vocabDbPath          = path.join(tmpDir, 'ai-glossary.json');
  glossaryEditionsDir  = path.join(tmpDir, 'glossary-editions');
  app = createApp({ vocabDbPath, glossaryEditionsDir, staticRoot: tmpDir });

  // seed a term so snapshots are non-empty
  await request(app).post('/api/glossary').send({
    term: 'Machine Learning', definition: 'A field of AI.',
  });
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('GET /api/glossary-editions', () => {
  test('returns empty list initially', async () => {
    const r = await request(app).get('/api/glossary-editions');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ editions: [] });
  });
});

describe('POST /api/glossary-editions', () => {
  test('creates an edition and returns metadata', async () => {
    const r = await request(app).post('/api/glossary-editions')
      .send({ label: 'Glossary Vol. I', note: 'First release.' });
    expect(r.status).toBe(201);
    expect(r.body.label).toBe('Glossary Vol. I');
    expect(r.body.note).toBe('First release.');
    expect(r.body.terms).toBe(1);
    expect(r.body.file).toMatch(/^glossary-editions\//);
  });

  test('400 when label is missing', async () => {
    const r = await request(app).post('/api/glossary-editions').send({ note: 'no label' });
    expect(r.status).toBe(400);
  });

  test('edition appears in the list', async () => {
    await request(app).post('/api/glossary-editions').send({ label: 'Vol. I', note: '' });
    const r = await request(app).get('/api/glossary-editions');
    expect(r.body.editions).toHaveLength(1);
  });
});

describe('GET /api/glossary-editions/:id', () => {
  test('returns the snapshot for a known edition', async () => {
    const created = await request(app).post('/api/glossary-editions')
      .send({ label: 'Vol. I', note: '' });
    const r = await request(app).get(`/api/glossary-editions/${created.body.id}`);
    expect(r.status).toBe(200);
    expect(r.body.editionId).toBe(created.body.id);
    expect(r.body.terms).toHaveLength(1);
  });

  test('404 for unknown id', async () => {
    const r = await request(app).get('/api/glossary-editions/nope');
    expect(r.status).toBe(404);
  });
});

describe('PUT /api/glossary-editions/:id', () => {
  test('updates label and note', async () => {
    const created = await request(app).post('/api/glossary-editions')
      .send({ label: 'Vol. I', note: 'old' });
    const r = await request(app).put(`/api/glossary-editions/${created.body.id}`)
      .send({ label: 'Vol. I — Revised', note: 'new note' });
    expect(r.status).toBe(200);
    expect(r.body.label).toBe('Vol. I — Revised');
    expect(r.body.note).toBe('new note');
  });

  test('400 when label is missing', async () => {
    const created = await request(app).post('/api/glossary-editions')
      .send({ label: 'Vol. I', note: '' });
    const r = await request(app).put(`/api/glossary-editions/${created.body.id}`)
      .send({ label: '', note: '' });
    expect(r.status).toBe(400);
  });

  test('404 for unknown id', async () => {
    const r = await request(app).put('/api/glossary-editions/nope')
      .send({ label: 'X', note: '' });
    expect(r.status).toBe(404);
  });
});

describe('DELETE /api/glossary-editions/:id', () => {
  test('removes the edition', async () => {
    const created = await request(app).post('/api/glossary-editions')
      .send({ label: 'Vol. I', note: '' });
    const r = await request(app).delete(`/api/glossary-editions/${created.body.id}`);
    expect(r.status).toBe(200);
    expect(r.body.deleted).toBe(created.body.id);
    const list = await request(app).get('/api/glossary-editions');
    expect(list.body.editions).toHaveLength(0);
  });

  test('404 when missing', async () => {
    const r = await request(app).delete('/api/glossary-editions/nope');
    expect(r.status).toBe(404);
  });
});
