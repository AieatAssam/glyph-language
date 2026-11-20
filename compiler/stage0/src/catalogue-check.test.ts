// Tests for the catalogue check (RFC 0004 section 4). Fixture catalogues only; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCatalogue } from './catalogue-check.ts';

const entry = (code: string, retired?: boolean) =>
  retired === undefined
    ? { code, message: 'm', meaning: 'm' }
    : { code, message: 'm', meaning: 'm', retired };

const kinds = (problems: { kind: string; code: string | null }[]) =>
  problems.map((p) => `${p.kind}:${p.code}`);

test('every emitted code catalogued and active gives no problems', () => {
  const catalogue = [entry('E0001'), entry('E0100'), entry('E0300')];
  assert.deepEqual(checkCatalogue(catalogue, ['E0001', 'E0300']), []);
});

test('an empty catalogue and no emitted codes gives no problems', () => {
  assert.deepEqual(checkCatalogue([], []), []);
});

test('an emitted code that is not in the catalogue is missing', () => {
  const problems = checkCatalogue([entry('E0001')], ['E0001', 'E0100']);
  assert.deepEqual(kinds(problems), ['missing:E0100']);
});

test('a missing code emitted several times is reported once', () => {
  const problems = checkCatalogue([], ['E0100', 'E0100', 'E0100']);
  assert.deepEqual(kinds(problems), ['missing:E0100']);
});

test('an emitted code whose entry is retired is reported as retired', () => {
  const problems = checkCatalogue([entry('E0101', true)], ['E0101']);
  assert.deepEqual(kinds(problems), ['retired:E0101']);
});

test('a retired code that is not emitted is not a problem', () => {
  assert.deepEqual(checkCatalogue([entry('E0101', true)], []), []);
  assert.deepEqual(checkCatalogue([entry('E0101', true), entry('E0100')], ['E0100']), []);
});

test('an entry with retired false is active', () => {
  assert.deepEqual(checkCatalogue([entry('E0100', false)], ['E0100']), []);
});

test('a code listed twice in the catalogue is repeated, once, even when listed three times', () => {
  const catalogue = [entry('E0100'), entry('E0100'), entry('E0100')];
  const problems = checkCatalogue(catalogue, []);
  assert.deepEqual(kinds(problems), ['repeated:E0100']);
  assert.equal(problems[0].detail, 'E0100 is listed 3 times');
});

test('a code listed twice is retired if emitted and one entry is retired', () => {
  const catalogue = [entry('E0100'), entry('E0100', true)];
  assert.deepEqual(kinds(checkCatalogue(catalogue, ['E0100'])), ['repeated:E0100', 'retired:E0100']);
});

test('the same code emitted at many spans is not reported', () => {
  assert.deepEqual(checkCatalogue([entry('E0100')], ['E0100', 'E0100', 'E0100']), []);
});

test('an entry with no string code is malformed, and the other entries are still checked', () => {
  const catalogue = [entry('E0100'), { message: 'm', meaning: 'm' }, 7, null];
  const problems = checkCatalogue(catalogue, ['E0200']);
  assert.deepEqual(problems.map((p) => p.kind), ['malformed', 'malformed', 'malformed', 'missing']);
  assert.deepEqual(problems.map((p) => p.code), [null, null, null, 'E0200']);
  assert.equal(problems[0].detail, 'entry 1 has no string code');
});

test('a catalogue that is not an array throws a TypeError', () => {
  assert.throws(() => checkCatalogue(entry('E0100'), []), TypeError);
  assert.throws(() => checkCatalogue(null, []), TypeError);
});

test('problems come out in a fixed order: catalogue first, then emitted codes in emitted order', () => {
  const catalogue = [entry('E0100'), entry('E0100'), entry('E0101', true)];
  const problems = checkCatalogue(catalogue, ['E0300', 'E0101', 'E0200']);
  assert.deepEqual(kinds(problems), [
    'repeated:E0100',
    'missing:E0300',
    'retired:E0101',
    'missing:E0200',
  ]);
});

test('checking twice gives the same result and does not change the inputs', () => {
  const catalogue = [entry('E0100'), entry('E0100'), entry('E0101', true)];
  const emitted = ['E0101', 'E0300'];
  const before = JSON.stringify([catalogue, emitted]);
  const first = checkCatalogue(catalogue, emitted);
  assert.deepEqual(checkCatalogue(catalogue, emitted), first);
  assert.equal(JSON.stringify([catalogue, emitted]), before);
});
