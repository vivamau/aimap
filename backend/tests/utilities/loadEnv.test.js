const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { loadEnv } = require('../../utilities/loadEnv');

let tmpDir;
beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'env-'));
});
afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
  delete process.env.__TEST_KEY_A;
  delete process.env.__TEST_KEY_B;
  delete process.env.__TEST_KEY_QUOTED;
});

test('loads KEY=VALUE pairs into process.env', () => {
  const file = path.join(tmpDir, '.env');
  fs.writeFileSync(file, '__TEST_KEY_A=alpha\n__TEST_KEY_B=beta\n');
  loadEnv(file);
  expect(process.env.__TEST_KEY_A).toBe('alpha');
  expect(process.env.__TEST_KEY_B).toBe('beta');
});

test('strips surrounding quotes', () => {
  const file = path.join(tmpDir, '.env');
  fs.writeFileSync(file, '__TEST_KEY_QUOTED="hello world"\n');
  loadEnv(file);
  expect(process.env.__TEST_KEY_QUOTED).toBe('hello world');
});

test('ignores comments and blank lines', () => {
  const file = path.join(tmpDir, '.env');
  fs.writeFileSync(file, '# a comment\n\n__TEST_KEY_A=ok\n');
  loadEnv(file);
  expect(process.env.__TEST_KEY_A).toBe('ok');
});

test('does not override pre-existing env vars', () => {
  process.env.__TEST_KEY_A = 'preset';
  const file = path.join(tmpDir, '.env');
  fs.writeFileSync(file, '__TEST_KEY_A=overwritten\n');
  loadEnv(file);
  expect(process.env.__TEST_KEY_A).toBe('preset');
});

test('quietly returns when file is absent', () => {
  expect(() => loadEnv(path.join(tmpDir, 'nope.env'))).not.toThrow();
});

test('skips malformed lines without "="', () => {
  const file = path.join(tmpDir, '.env');
  fs.writeFileSync(file, 'malformed-line\n__TEST_KEY_A=ok\n');
  loadEnv(file);
  expect(process.env.__TEST_KEY_A).toBe('ok');
});
