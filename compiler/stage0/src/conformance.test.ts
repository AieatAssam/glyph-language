// Runs every conformance/**/*.test through the real CLI. Container format: SPEC section 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const main = join(here, 'main.ts');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.test') ? [p] : [];
  });
}

function sections(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let cur = '';
  for (const line of text.split('\n')) {
    const m = /^--- (\S+)$/.exec(line);
    if (m) { cur = m[1]!; out.set(cur, ''); continue; }
    if (cur) out.set(cur, out.get(cur) + line + '\n');
  }
  return out;
}

const tests = walk(join(root, 'conformance'));
test('conformance files exist', () => assert.ok(tests.length >= 4));

for (const file of tests) {
  test(file.replace(root + '/', ''), () => {
    const s = sections(readFileSync(file, 'utf8'));
    const kind = /kind: (\S+)/.exec(s.get('meta') ?? '')?.[1];
    const dir = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'conf-'));
    const src = join(dir, 'main.toy');
    writeFileSync(src, s.get('source') ?? '');
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', main, kind === 'compile-error' ? 'check' : 'run', src, '--json'],
      { input: s.get('stdin') ?? '', encoding: 'utf8' });
    const exit = Number((s.get('expect-exit') ?? '0').trim());
    if (kind === 'compile-error') {
      const got = r.stdout.trim().split('\n').filter(Boolean)
        .map((l) => JSON.parse(l)).map((d) => `${d.code} ${d.span.start[0]}`);
      assert.deepEqual(got, (s.get('expect-errors') ?? '').trim().split('\n').filter(Boolean));
      assert.equal(r.status, exit);
      return;
    }
    assert.equal(r.stdout, s.get('expect-stdout') ?? '');
    assert.equal(r.status, exit);
  });
}
