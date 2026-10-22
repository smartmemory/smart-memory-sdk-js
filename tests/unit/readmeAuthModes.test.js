import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// DEV-ONBOARD-FU-SDKJS-README-ORDER-1 / DEV-ONBOARD-FU-DOCS-DRIFT-1: the README is the first page a server-side
// developer reads. One row per claim class: API key mode comes first, every auth mode the source supports is
// listed, and the README never hard-codes a package version (it drifted to 0.6.0 while the package was 1.x).
const readme = readFileSync(resolve(__dirname, '../../README.md'), 'utf8');
const authCore = readFileSync(resolve(__dirname, '../../src/auth/AuthCore.js'), 'utf8');
const at = (needle) => readme.indexOf(needle);

describe('README auth modes', () => {
  const ORDER = [
    ['API key quick start precedes SSO', '### API Key Mode', '### SSO Mode'],
    ['API key quick start is the first quick start', '## Quick Start', '### API Key Mode'],
  ];
  it.each(ORDER)('%s', (_name, first, second) => {
    expect(at(first)).toBeGreaterThan(-1);
    expect(at(second)).toBeGreaterThan(at(first));
  });

  const MODES = [
    ['apiKey', "mode = 'apiKey'", /apiKey:/],
    ['sso', "mode === 'sso'", /mode: 'sso'/],
    ['custom', null, /'custom'/],
  ];
  it.each(MODES)('%s mode is listed in the README', (_name, sourceHint, pattern) => {
    if (sourceHint) expect(authCore).toContain(sourceHint);
    expect(pattern.test(readme)).toBe(true);
  });

  it('does not hard-code a package version', () => {
    expect(readme).not.toMatch(/\*\*Version:\*\*\s*v?\d+\.\d+\.\d+/);
  });
});
