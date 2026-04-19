/**
 * Minimal .env loader — no dependency.
 * Reads KEY=VALUE pairs from the given path and sets them on process.env
 * unless already defined. Quiet if file is missing.
 */
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const target = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  if (!fs.existsSync(target)) return;
  const text = fs.readFileSync(target, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

module.exports = { loadEnv };
