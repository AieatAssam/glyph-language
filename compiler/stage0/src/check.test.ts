// Tests for lexRecord and checkRecord, the lexical and syntax parts of check (RFC 0004 sections 2
// and 3). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { checkRecord, lexRecord } from './check.ts';

const src = (text: string) => lexRecord(Buffer.from(text, 'utf8'));

test('a source that lexes gives no record', () => {
  assert.equal(src('main io{put 1}'), null);
});

test('a lexical error gives one record with its code and byte span, and no fix', () => {
  assert.equal(src('main io{put 1;put 2}'), '{"code":"E0001","span":{"start":13,"end":14}}');
});

test('a fix is written with a nested span, as RFC 0004 section 2 gives it', () => {
  assert.equal(
    src('007'),
    '{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}',
  );
});

test('the first lexical error is the only record', () => {
  assert.equal(src('main io{put 1;put 2;}'), '{"code":"E0001","span":{"start":13,"end":14}}');
});

// checkRecord adds syntax errors (RFC 0109 P1 and the RFC 0104 grammar) after the lexical ones.
const chk = (text: string) => checkRecord(Buffer.from(text, 'utf8'));

test('checkRecord: a program that parses gives no record', () => {
  assert.equal(chk('main io{put 1}'), null);
});

test('checkRecord: a keyword as a declaration name is E0100 at the name, with no fix', () => {
  assert.equal(chk('fn main io{}'), '{"code":"E0100","span":{"start":3,"end":7}}');
});

test('checkRecord: a comma in put is E0100 at the comma', () => {
  assert.equal(chk('main io{put(1,2)}'), '{"code":"E0100","span":{"start":13,"end":14}}');
});

test('checkRecord: a lexical error is reported before a syntax error that comes later', () => {
  assert.equal(chk('fn main io{put 1;}'), '{"code":"E0001","span":{"start":16,"end":17}}');
});
