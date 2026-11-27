// Tests for NewlineStage (RFC 0014 rules 14 and 15). Each case feeds a list of events in source
// order: a token kind, or 'eol' for a line end. Event i occupies bytes i to i+1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from './index.ts';
import { NewlineStage } from './newline.ts';
import { Kind, type Token } from './token.ts';

type Event = Kind | 'eol';

// Feeds the events, then finishes the file at the length of the event list.
function feed(events: Event[]): Token[] {
  const stage = new NewlineStage();
  events.forEach((ev, i) => {
    if (ev === 'eol') stage.lineEnd({ start: i, end: i + 1 });
    else stage.token({ kind: ev, start: i, end: i + 1 });
  });
  return stage.finish(events.length);
}

const NAME = new Map<number, string>(Object.entries(Kind).map(([name, value]) => [value, name]));

// The kinds as names, so a failing assertion reads as a list of token names.
const names = (tokens: Token[]): string[] => tokens.map((t) => NAME.get(t.kind) ?? '?');

const A = Kind.IDENT;
const LP = Kind.LPAREN;
const RP = Kind.RPAREN;

test('a line end between two tokens gives one NEWLINE, and the file end adds the last one', () => {
  assert.deepEqual(names(feed([A, 'eol', A])), ['IDENT', 'NEWLINE', 'IDENT', 'NEWLINE', 'EOF']);
});

test('several blank lines give one NEWLINE, and a final line end does not add a second', () => {
  assert.deepEqual(
    names(feed([A, 'eol', 'eol', 'eol', A, 'eol'])),
    ['IDENT', 'NEWLINE', 'IDENT', 'NEWLINE', 'EOF'],
  );
});

test('blank lines at the start of the file give no NEWLINE', () => {
  assert.deepEqual(names(feed(['eol', 'eol', A])), ['IDENT', 'NEWLINE', 'EOF']);
});

test('a file with no tokens gives only EOF', () => {
  assert.deepEqual(names(feed([])), ['EOF']);
  assert.deepEqual(names(feed(['eol', 'eol'])), ['EOF']);
});

test('a line end inside parentheses gives no NEWLINE, and the group closes before the next one', () => {
  assert.deepEqual(
    names(feed([LP, A, 'eol', A, RP, 'eol', A])),
    ['LPAREN', 'IDENT', 'IDENT', 'RPAREN', 'NEWLINE', 'IDENT', 'NEWLINE', 'EOF'],
  );
});

test('a right parenthesis at depth zero leaves the depth at zero, so the next line end gives NEWLINE', () => {
  assert.deepEqual(
    names(feed([A, RP, RP, 'eol', A])),
    ['IDENT', 'RPAREN', 'RPAREN', 'NEWLINE', 'IDENT', 'NEWLINE', 'EOF'],
  );
});

test('a file with no final line end still gets the final NEWLINE, with zero width at the end', () => {
  const tokens = feed([A, A]);
  assert.deepEqual(names(tokens), ['IDENT', 'IDENT', 'NEWLINE', 'EOF']);
  assert.deepEqual(tokens[2], { kind: Kind.NEWLINE, start: 2, end: 2 });
  assert.deepEqual(tokens[3], { kind: Kind.EOF, start: 2, end: 2 });
});

test('a file that ends inside parentheses gets no NEWLINE from that end, and EOF is last', () => {
  assert.deepEqual(names(feed([LP, A, 'eol'])), ['LPAREN', 'IDENT', 'EOF']);
  assert.deepEqual(names(feed([LP, A])), ['LPAREN', 'IDENT', 'EOF']);
  const tokens = feed([LP, A, 'eol', A, 'eol']);
  assert.equal(tokens[tokens.length - 1].kind, Kind.EOF);
  assert.equal(tokens.filter((t) => t.kind === Kind.EOF).length, 1);
});

test('a NEWLINE takes the span of the line end it came from', () => {
  const stage = new NewlineStage();
  stage.token({ kind: A, start: 0, end: 1 });
  stage.lineEnd({ start: 1, end: 3 });
  assert.deepEqual(stage.tokens[1], { kind: Kind.NEWLINE, start: 1, end: 3 });
});

test('a second line end straight after a NEWLINE adds nothing', () => {
  const stage = new NewlineStage();
  stage.token({ kind: A, start: 0, end: 1 });
  stage.lineEnd({ start: 1, end: 2 });
  stage.lineEnd({ start: 2, end: 3 });
  assert.deepEqual(names(stage.finish(3)), ['IDENT', 'NEWLINE', 'EOF']);
});

test('the driver may not feed NEWLINE or EOF tokens', () => {
  const stage = new NewlineStage();
  assert.throws(() => stage.token({ kind: Kind.NEWLINE, start: 0, end: 0 }), /made by this stage/);
  assert.throws(() => stage.token({ kind: Kind.EOF, start: 0, end: 0 }), /made by this stage/);
});

// RFC 0104 rule 4 and rule 3: a line feed outside text is part of a gap, and a gap that is not the
// canonical gap is E0002 with a fix. These cases run the whole lexer on one program each.
const e0002 = (start: number, end: number, replacement: string) => ({
  tokens: [],
  error: { code: 'E0002', start, end, fix: { start, end, replacement } },
});

test('a line feed inside a block is E0002 at the line feed, with empty replacement', () => {
  assert.deepEqual(lex(Buffer.from('main io{\nput 1}')), e0002(8, 9, ''));
});

test('two spaces before an int are E0002 over both spaces, replaced by one space', () => {
  assert.deepEqual(lex(Buffer.from('main io{put  1}')), e0002(11, 13, ' '));
});

test('a missing space between put and 1put is a zero-length E0002 at the point, replaced by one space', () => {
  assert.deepEqual(lex(Buffer.from('main io{put 1put 2}')), e0002(13, 13, ' '));
});

test('a space before a parenthesis is E0002 at that space, with empty replacement', () => {
  assert.deepEqual(lex(Buffer.from('main io{put (1)}')), e0002(11, 12, ''));
});

test('a space before the first token is E0002 at byte 0', () => {
  assert.deepEqual(lex(Buffer.from(' main io{}')), e0002(0, 1, ''));
});

test('a line feed after the last token is E0002 at that line feed', () => {
  assert.deepEqual(lex(Buffer.from('main io{}\n')), e0002(9, 10, ''));
});

test('a tab in a gap is E0001 at the tab, and no E0002 is reported', () => {
  assert.deepEqual(lex(Buffer.from('main io{put\t1}')), {
    tokens: [],
    error: { code: 'E0001', start: 11, end: 12 },
  });
});

test('canonical layout gives tokens and no error', () => {
  assert.equal(lex(Buffer.from('main io{put 1}')).error, null);
});
