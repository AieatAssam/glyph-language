// Tests for the front-end records of `check FILE` (RFC 0048 subtask 12, RFC 0050 section 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { diagnosticsOf } from './check.ts';

const at = (text: string) => diagnosticsOf(Buffer.from(text, 'utf8'));

test('a file that lexes and parses gives no record', () => {
  assert.deepEqual(at('fn main() io { print(1) }\n'), []);
});

test('a keyword as the function name is one E0003 record at the keyword, with only code and span', () => {
  assert.deepEqual(at('fn let() io { }\n'), [{
    code: 'E0003',
    span: { start: 3, end: 6 },
  }]);
});

test('a CR LF line end is one E0001 record at the CR, before any syntax check', () => {
  const r = at('fn main() io { }\r\n');
  assert.deepEqual(r, [{ code: 'E0001', span: { start: 16, end: 17 } }]);
});

test('a syntax error at the end of the file gives its record at the end of the file', () => {
  // The file is 24 bytes; the missing closing brace is at the end, where the EOF token sits.
  assert.deepEqual(at('fn main() io {\n  put(1)\n'), [{ code: 'E0100', span: { start: 24, end: 24 } }]);
});
