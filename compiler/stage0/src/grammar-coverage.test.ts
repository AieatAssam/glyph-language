// Coverage of the core grammar (RFC 0104, Grammar; plan subtask 12). Every production in the
// grammar block of spec/core/grammar.md must be named by the parser or by a parser test.
//
// A production is covered when one of two things holds:
//   - a function in compiler/stage0/src/parser/ (not a test file) has its camelCase name, so
//     `and_expr` is `andExpr`, or `parse` plus its name, so `decl` is `parseDecl`; or
//   - its name appears as a word in a test title (`test('...')`) in compiler/stage0/src/parser/.
//
// This is a name check. It shows the production is written in the parser and named by a test. It
// does not show that every alternative of the production is exercised. No coverage script for
// spec/core exists under tools/check/: the gate's rule 10 reads spec/grammar.peg, which is a
// separate file (its update is not part of this test). So this test does the check itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const grammar = readFileSync(`${here}../../../spec/core/grammar.md`, 'utf8');
const parserDir = `${here}parser/`;

// The production names: the lines of the first code block that start with `name =`.
function productions(): string[] {
  const block = grammar.match(/```\n([\s\S]*?)```/);
  assert.ok(block, 'spec/core/grammar.md has a grammar code block');
  return [...block[1].matchAll(/^([a-z_]+)\s*=/gm)].map((m) => m[1]);
}

const parserFiles = readdirSync(parserDir).filter((f) => f.endsWith('.ts'));
const read = (f: string) => readFileSync(`${parserDir}${f}`, 'utf8');
const implText = parserFiles.filter((f) => !f.endsWith('.test.ts')).map(read).join('\n');
const titles = parserFiles
  .filter((f) => f.endsWith('.test.ts'))
  .flatMap((f) => [...read(f).matchAll(/^test\('((?:[^'\\]|\\.)*)'/gm)].map((m) => m[1]))
  .join('\n');

const camel = (name: string) => name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
// A function is named for the production as `and_expr` -> `andExpr`, or as `parse` + the name, so
// `decl` -> `parseDecl`.
const isFunction = (name: string) => {
  const c = camel(name);
  const p = `parse${c.charAt(0).toUpperCase()}${c.slice(1)}`;
  return new RegExp(`\\bfunction\\s+(${c}|${p})\\b`).test(implText);
};
const isInTitle = (name: string) => new RegExp(`\\b${name}\\b`).test(titles);

test('the grammar block lists productions, so the checks below are not vacuous', () => {
  assert.ok(productions().length > 0);
});

for (const name of productions()) {
  test(`production ${name} is named by a parser function or a parser test`, () => {
    assert.ok(
      isFunction(name) || isInTitle(name),
      `production ${name} has no parser function ${camel(name)} and no parser test title naming it`,
    );
  });
}
