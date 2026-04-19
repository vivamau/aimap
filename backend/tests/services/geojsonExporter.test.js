const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { toFeatureCollection, toFeature, exportTo } = require('../../services/geojsonExporter');

const dataset = {
  meta: { edition: 'Vol. I', updated: '2026-04-19', compiler: 'x' },
  models: [
    { id: 'a', name: 'A', organization: 'X', country: 'Italy', city: 'Rome',
      lat: 41.9, lng: 12.5, type: 'open-weight', year: 2026, parameters: '7B',
      url: 'https://x', notes: '', modality: ['text'] },
    { id: 'b', name: 'B', organization: 'Y', country: 'Japan', city: 'Tokyo',
      lat: 35.7, lng: 139.7, type: 'proprietary', year: 2025, parameters: 'undisclosed',
      url: '', notes: '', modality: ['text', 'image'] },
  ],
};

describe('toFeature()', () => {
  test('converts model to GeoJSON Point with [lng, lat]', () => {
    const f = toFeature(dataset.models[0]);
    expect(f.type).toBe('Feature');
    expect(f.id).toBe('a');
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [12.5, 41.9] });
    expect(f.properties.lat).toBeUndefined();
    expect(f.properties.lng).toBeUndefined();
    expect(f.properties.name).toBe('A');
  });
});

describe('toFeatureCollection()', () => {
  test('wraps models in a FeatureCollection with meta', () => {
    const fc = toFeatureCollection(dataset);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.meta.edition).toBe('Vol. I');
  });
});

describe('exportTo()', () => {
  let tmpDir, outPath;
  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-geo-'));
    outPath = path.join(tmpDir, 'nested', 'ai-models.geojson');
  });
  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  test('writes file (creating parent dirs) and parses as valid JSON', async () => {
    await exportTo(outPath, dataset);
    expect(fs.existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.features).toHaveLength(2);
  });

  test('atomic write — no .tmp lingers', async () => {
    await exportTo(outPath, dataset);
    const files = await fsp.readdir(path.dirname(outPath));
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });
});
