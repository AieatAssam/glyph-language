// Process-level test of a CR LF line end through `check FILE` (RFC 0048 rule 2, RFC 0050 section 2).
// The conformance runner reads each .test file in text mode, which turns CR LF into LF before glyphc
// sees the source, so a conformance test cannot carry a CR. This test writes the bytes itself and
// checks the exact standard error and exit status of the real entry point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

test('check of a file with a CR LF line end writes one E0001 record at the CR and exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glyph-cr-'));
  const file = join(dir, 'prog.gl');
  writeFileSync(file, Buffer.from('fn main() io { }\r\n', 'utf8'));
  const p = spawnSync(process.execPath, [MAIN, 'check', file], { encoding: 'utf8' });
  assert.equal(p.status, 1, p.stderr);
  assert.equal(p.stdout, '');
  assert.equal(p.stderr, '{"code":"E0001","span":{"start":16,"end":17}}\n');
});
