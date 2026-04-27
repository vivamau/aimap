const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const request = require('supertest');
const { createApp } = require('../../app');

let tmpDir, vocabDbPath, app;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-glossary-api-'));
  vocabDbPath = path.join(tmpDir, 'ai-glossary.json');
  app = createApp({ vocabDbPath, staticRoot: tmpDir });
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

const sample = (over = {}) => ({
  term: 'Machine Learning',
  definition: 'A field of AI that learns from data.',
  notes: 'Also called ML.',
  links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/ML' }],
  relatedTerms: [],
  ...over,
});

describe('GET /api/glossary', () => {
  test('returns empty list initially', async () => {
    const r = await request(app).get('/api/glossary');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ terms: [] });
  });

  test('returns terms sorted alphabetically', async () => {
    await request(app).post('/api/glossary').send(sample({ term: 'Zebra', definition: 'Z' }));
    await request(app).post('/api/glossary').send(sample({ term: 'Alpha', definition: 'A' }));
    const r = await request(app).get('/api/glossary');
    expect(r.status).toBe(200);
    expect(r.body.terms[0].term).toBe('Alpha');
    expect(r.body.terms[1].term).toBe('Zebra');
  });
});

describe('POST /api/glossary', () => {
  test('creates a term and returns 201', async () => {
    const r = await request(app).post('/api/glossary').send(sample());
    expect(r.status).toBe(201);
    expect(r.body.id).toBe('machine-learning');
    expect(r.body.term).toBe('Machine Learning');
  });

  test('stores links and relatedTerms', async () => {
    const r = await request(app).post('/api/glossary').send(
      sample({ relatedTerms: ['deep-learning'] })
    );
    expect(r.status).toBe(201);
    expect(r.body.links).toHaveLength(1);
    expect(r.body.relatedTerms).toEqual(['deep-learning']);
  });

  test('400 on missing term', async () => {
    const r = await request(app).post('/api/glossary').send({ definition: 'x' });
    expect(r.status).toBe(400);
  });

  test('400 on missing definition', async () => {
    const r = await request(app).post('/api/glossary').send({ term: 'X' });
    expect(r.status).toBe(400);
  });

  test('409 on duplicate id', async () => {
    await request(app).post('/api/glossary').send(sample());
    const r = await request(app).post('/api/glossary').send(sample());
    expect(r.status).toBe(409);
  });
});

describe('GET /api/glossary/:id', () => {
  test('returns single term', async () => {
    await request(app).post('/api/glossary').send(sample());
    const r = await request(app).get('/api/glossary/machine-learning');
    expect(r.status).toBe(200);
    expect(r.body.term).toBe('Machine Learning');
  });

  test('404 for unknown id', async () => {
    const r = await request(app).get('/api/glossary/nope');
    expect(r.status).toBe(404);
  });
});

describe('PUT /api/glossary/:id', () => {
  test('updates a term', async () => {
    await request(app).post('/api/glossary').send(sample());
    const r = await request(app)
      .put('/api/glossary/machine-learning')
      .send(sample({ notes: 'edited notes' }));
    expect(r.status).toBe(200);
    expect(r.body.notes).toBe('edited notes');
    expect(r.body.term).toBe('Machine Learning');
  });

  test('404 for unknown id', async () => {
    const r = await request(app).put('/api/glossary/nope').send(sample());
    expect(r.status).toBe(404);
  });
});

describe('DELETE /api/glossary/:id', () => {
  test('deletes a term', async () => {
    await request(app).post('/api/glossary').send(sample());
    const r = await request(app).delete('/api/glossary/machine-learning');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ deleted: 'machine-learning' });
    const list = await request(app).get('/api/glossary');
    expect(list.body.terms).toHaveLength(0);
  });

  test('404 when missing', async () => {
    const r = await request(app).delete('/api/glossary/nope');
    expect(r.status).toBe(404);
  });
});
