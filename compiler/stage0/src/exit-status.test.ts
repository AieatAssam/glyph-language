// Tests that spec/core/diagnostic.md gives the exit status of a run that writes diagnostics, that
// spec/core/name.md refers to it for E0010, and that stage0 exits with that status (issue #610).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from './cli.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const diagnostic = readFileSync(`${here}../../../spec/core/diagnostic.md`, 'utf8');
const name = readFileSync(`${here}../../../spec/core/name.md`, 'utf8');

// The body of the `## Exit status` section, up to the next heading.
function exitStatusSection(): string {
  const m = /^## Exit status\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(diagnostic);
  assert.ok(m, 'spec/core/diagnostic.md has no "## Exit status" section');
  return m[1] ?? '';
}

function statusFor(argv: string[]): number {
  const sink = { write: () => true };
  return run(argv, { stdout: sink, stderr: sink });
}

test('the diagnostic section gives status 0 for no errors and 1 for a run that writes an error record', () => {
  const body = exitStatusSection();
  assert.ok(body.includes('no errors writes no diagnostic lines and exits with status 0'), body);
  assert.ok(body.includes('writes one or more records with severity `error` exits with status 1'), body);
});

test('the name section refers to the Exit status part for E0010 instead of saying only nonzero', () => {
  assert.ok(name.includes('`E0010` and exits as the Exit status part of the diagnostic section defines'), name);
  assert.ok(!name.includes('exits nonzero'), name);
});

test('stage0 exits with the specified status 1 when it writes the E0010 record', () => {
  for (const argv of [['check', 'prog.txt'], ['run', 'prog.txt'], ['build', 'prog.txt', '-o', 'out.wasm']]) {
    assert.equal(statusFor(argv), 1, argv.join(' '));
  }
});
