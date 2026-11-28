// Tests for lexRecord, the lexical part of check (RFC 0004 sections 2 and 3). Each case is one byte
// string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lexRecord } from './check.ts';

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
