// Tests for writeTrap (RFC 0004 section 5): exact bytes, one line, no code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeTrap, type TrapSink } from './trap.ts';

// A sink that records each write call, so tests can check the exact bytes and the call count.
function recorder(): { sink: TrapSink; calls: string[] } {
  const calls: string[] = [];
  return { sink: { write: (chunk: string) => calls.push(chunk) }, calls };
}

test('writes exactly "trap: <kind>" and one LF', () => {
  const { sink, calls } = recorder();
  writeTrap('divide-by-zero', sink);
  assert.equal(calls.join(''), 'trap: divide-by-zero\n');
});

test('the bytes are the same when encoded as UTF-8', () => {
  const { sink, calls } = recorder();
  writeTrap('divide-by-zero', sink);
  assert.deepEqual(Buffer.from(calls.join(''), 'utf8'), Buffer.from('trap: divide-by-zero\n', 'utf8'));
});

test('the whole line is written in one call', () => {
  const { sink, calls } = recorder();
  writeTrap('divide-by-zero', sink);
  assert.deepEqual(calls, ['trap: divide-by-zero\n']);
});

test('the kind is written as given, with no code and no span added', () => {
  const { sink, calls } = recorder();
  writeTrap('out-of-bounds', sink);
  assert.equal(calls.join(''), 'trap: out-of-bounds\n');
  assert.equal(/E\d{4}/.test(calls.join('')), false);
});

test('a kind containing a line feed is refused and nothing is written', () => {
  const { sink, calls } = recorder();
  assert.throws(() => writeTrap('bad\nkind', sink), RangeError);
  assert.deepEqual(calls, []);
});

test('a kind containing a carriage return is refused and nothing is written', () => {
  const { sink, calls } = recorder();
  assert.throws(() => writeTrap('bad\rkind', sink), RangeError);
  assert.deepEqual(calls, []);
});
