import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// One row per security-floored dependency. `min` is the lowest version that clears
// every advisory in DEPS-AUDIT-1 (smart-memory-ops/units/DEPS-AUDIT-1/report.md).
// Add a row when a new advisory sets a floor; vitest is a separate decision (major bump).
const FLOORS = [
  { section: 'devDependencies', pkg: 'vite', min: '6.4.3' },
];

const root = resolve(__dirname, '../..');
const readJson = (rel) => JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) throw new Error(`not a plain semver: ${v}`);
  return m.slice(1).map(Number);
};
const lt = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

describe('dependency security floors', () => {
  const manifest = readJson('package.json');

  it.each(FLOORS)('$pkg declared range floor is >= $min', ({ section, pkg, min }) => {
    const range = manifest[section][pkg];
    expect(range, `${pkg} missing from ${section}`).toBeTruthy();
    const lower = range.replace(/^[\^~>=\s]+/, '');
    expect(lt(lower, min), `${pkg} ${range} allows versions below ${min}`).toBe(false);
  });

  it.each(FLOORS)('$pkg installed version is >= $min', ({ pkg, min }) => {
    const { version } = readJson(`node_modules/${pkg}/package.json`);
    expect(lt(version, min), `${pkg}@${version} is below ${min}`).toBe(false);
  });
});
