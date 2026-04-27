const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function resolvePublicGeojsonPath(p) {
  const rel = p || process.env.PUBLIC_GEOJSON_PATH || 'data/ai-models.geojson';
  return path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
}

module.exports = {
  REPO_ROOT,
  BACKEND_ROOT,
  STATIC_ROOT: REPO_ROOT,
  DB_PATH: path.join(BACKEND_ROOT, 'data', 'ai-models.json'),
  GEOJSON_PATH: resolvePublicGeojsonPath(),
  EDITIONS_DIR: path.join(REPO_ROOT, 'data', 'editions'),
  TOOLS_DB_PATH: path.join(BACKEND_ROOT, 'data', 'ai-tools.json'),
  TOOLS_GEOJSON_PATH: path.join(REPO_ROOT, 'data', 'ai-tools.geojson'),
  GLOSSARY_DB_PATH: path.join(BACKEND_ROOT, 'data', 'ai-glossary.json'),
  resolvePublicGeojsonPath,
};
