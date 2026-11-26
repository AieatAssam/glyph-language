// Tests for the front-end records of `check FILE` (RFC 0048 subtask 12, RFC 0004 section 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { diagnosticsOf } from './check.ts';

const at = (text: string) => diagnosticsOf(Buffer.from(text, 'utf8'), 'p.gl');

test('a file that lexes and parses gives no record', () => {
  assert.deepEqual(at('fn main() io { print(1) }\n'), []);
});

test('a keyword as the function name is one E0003 record at the keyword, with its line and column', () => {
  assert.deepEqual(at('fn let() io { }\n'), [{
    code: 'E0003',
    severity: 'error',
    message: 'keyword where a name is required',
    span: { file: 'p.gl', start: 3, end: 6, line: 1, column: 4 },
  }]);
});

test('a CR LF line end is one E0001 record at the CR, before any syntax check', () => {
  const r = at('fn main() io { }\r\n');
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'E0001');
  assert.deepEqual([r[0].span.start, r[0].span.end], [16, 17]);
});

test('a syntax error on a later line gives the line of the token', () => {
  const r = at('fn main() io {\n  put(1)\n');
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'E0100');
  assert.equal(r[0].span.line, 3);
  assert.equal(r[0].span.column, 1);
});
