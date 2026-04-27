/**
 * Converts the internal {meta, models} dataset into a GeoJSON FeatureCollection
 * and writes it to disk atomically. The public-facing index.html reads this file.
 */

const fsp = require('fs/promises');
const path = require('path');

function toFeatureCollection({ meta, models, tools = [] }) {
  const fc = {
    type: 'FeatureCollection',
    meta: { ...meta },
    features: models.map(toFeature),
  };
  if (tools.length > 0) {
    fc.toolFeatures = tools.map(t => {
      const { lat, lng, ...properties } = t;
      return {
        type: 'Feature',
        id: t.id,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties,
      };
    });
  }
  return fc;
}

function toFeature(model) {
  const { lat, lng, ...properties } = model;
  return {
    type: 'Feature',
    id: model.id,
    geometry: {
      type: 'Point',
      coordinates: [lng, lat], // GeoJSON is [lng, lat]
    },
    properties,
  };
}

async function exportTo(outputPath, dataset) {
  const fc = toFeatureCollection(dataset);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const tmp = outputPath + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(fc, null, 2));
  await fsp.rename(tmp, outputPath);
  return fc;
}

module.exports = { toFeatureCollection, toFeature, exportTo };
