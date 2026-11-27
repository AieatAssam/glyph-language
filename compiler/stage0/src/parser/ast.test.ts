// Tests for the AST node types (RFC 0109 Design; RFC 0104 grammar). The sample is the RFC 0109
// Summary program, 73 bytes, and its spans are counted by hand from byte 0. The slices of the
// source check each span against the text it should cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { NODE_KINDS, type Decl, type Stmt } from './ast.ts';

const SRC = 'sq(n Int)Int{ret n*n}ex sq(3)==9 main io{var i=1 wh i<=3{put sq(i)i=i+1}}';

const sq: Decl = {
  kind: 'decl', start: 0, end: 21,
  name: { kind: 'ident', text: 'sq', start: 0, end: 2 },
  params: [{
    kind: 'param', start: 3, end: 8,
    name: { kind: 'ident', text: 'n', start: 3, end: 4 },
    type: { kind: 'ident', text: 'Int', start: 5, end: 8 },
  }],
  result: { kind: 'ident', text: 'Int', start: 9, end: 12 },
  io: null,
  body: {
    kind: 'block', start: 12, end: 21,
    stmts: [{
      kind: 'ret', start: 13, end: 20,
      value: {
        kind: 'binary', op: '*', start: 17, end: 20,
        left: { kind: 'name', text: 'n', start: 17, end: 18 },
        right: { kind: 'name', text: 'n', start: 19, end: 20 },
      },
    }],
  },
  examples: [{
    kind: 'example', start: 21, end: 32,
    expr: {
      kind: 'binary', op: '==', start: 24, end: 32,
      left: {
        kind: 'call', start: 24, end: 29,
        callee: { kind: 'ident', text: 'sq', start: 24, end: 26 },
        args: [{ kind: 'int', text: '3', start: 27, end: 28 }],
      },
      right: { kind: 'int', text: '9', start: 31, end: 32 },
    },
  }],
};

const mainWh: Stmt = {
  kind: 'wh', start: 49, end: 72,
  cond: {
    kind: 'binary', op: '<=', start: 52, end: 56,
    left: { kind: 'name', text: 'i', start: 52, end: 53 },
    right: { kind: 'int', text: '3', start: 55, end: 56 },
  },
  body: {
    kind: 'block', start: 56, end: 72,
    stmts: [
      {
        kind: 'put', start: 57, end: 66,
        value: {
          kind: 'call', start: 61, end: 66,
          callee: { kind: 'ident', text: 'sq', start: 61, end: 63 },
          args: [{ kind: 'name', text: 'i', start: 64, end: 65 }],
        },
      },
      {
        kind: 'assign', start: 66, end: 71,
        target: { kind: 'ident', text: 'i', start: 66, end: 67 },
        value: {
          kind: 'binary', op: '+', start: 68, end: 71,
          left: { kind: 'name', text: 'i', start: 68, end: 69 },
          right: { kind: 'int', text: '1', start: 70, end: 71 },
        },
      },
    ],
  },
};

const main: Decl = {
  kind: 'decl', start: 33, end: 73,
  name: { kind: 'ident', text: 'main', start: 33, end: 37 },
  params: null,
  result: null,
  io: { start: 38, end: 40 },
  body: {
    kind: 'block', start: 40, end: 73,
    stmts: [
      {
        kind: 'var', start: 41, end: 48,
        name: { kind: 'ident', text: 'i', start: 45, end: 46 },
        value: { kind: 'int', text: '1', start: 47, end: 48 },
      },
      mainWh,
    ],
  },
  examples: [],
};

// Every node in a tree, found by walking every property. A node is an object with a kind and a start.
function nodesOf(value: unknown, out: { kind: string; start: number; end: number }[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) nodesOf(item, out);
  } else if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.kind === 'string' && typeof obj.start === 'number') {
      out.push(obj as { kind: string; start: number; end: number });
    }
    for (const key of Object.keys(obj)) if (key !== 'kind') nodesOf(obj[key], out);
  }
  return out;
}

test('the sample is 73 bytes, and the declarations have the spans RFC 0109 gives them', () => {
  assert.equal(Buffer.byteLength(SRC, 'utf8'), 73);
  assert.deepEqual([sq.start, sq.end], [0, 21]);
  assert.deepEqual([main.start, main.end], [33, 73]);
  assert.deepEqual([sq.body.start, sq.body.end], [12, 21]);
  assert.deepEqual([main.body.start, main.body.end], [40, 73]);
});

test('each name and type span covers exactly its text in the sample', () => {
  assert.equal(SRC.slice(sq.name.start, sq.name.end), 'sq');
  assert.equal(SRC.slice(sq.params![0].name.start, sq.params![0].name.end), 'n');
  assert.equal(SRC.slice(sq.params![0].type.start, sq.params![0].type.end), 'Int');
  assert.equal(SRC.slice(sq.result!.start, sq.result!.end), 'Int');
  assert.equal(SRC.slice(main.name.start, main.name.end), 'main');
  assert.equal(SRC.slice(main.io!.start, main.io!.end), 'io');
});

test('the statements and expressions of the sample have the spans counted by hand', () => {
  assert.equal(SRC.slice(sq.examples[0].start, sq.examples[0].end), 'ex sq(3)==9');
  assert.equal(SRC.slice(mainWh.start, mainWh.end), 'wh i<=3{put sq(i)i=i+1}');
  assert.equal(SRC.slice(mainWh.cond.start, mainWh.cond.end), 'i<=3');
  assert.equal(SRC.slice(mainWh.body.start, mainWh.body.end), '{put sq(i)i=i+1}');
  assert.equal(SRC.slice(mainWh.body.stmts[0].start, mainWh.body.stmts[0].end), 'put sq(i)');
  assert.equal(SRC.slice(mainWh.body.stmts[1].start, mainWh.body.stmts[1].end), 'i=i+1');
});

test('every node of the sample has start < end, inside the source, and a kind listed once', () => {
  const nodes = [sq, main].flatMap((d) => nodesOf(d));
  assert.ok(nodes.length > 30);
  for (const node of nodes) {
    assert.ok(node.start < node.end, `${node.kind} ${node.start}..${node.end}`);
    assert.ok(node.start >= 0 && node.end <= SRC.length, `${node.kind} ${node.start}..${node.end}`);
    assert.ok((NODE_KINDS as readonly string[]).includes(node.kind), node.kind);
  }
});

test('NODE_KINDS lists each kind once, and the list has the twenty kinds of the union', () => {
  assert.equal(NODE_KINDS.length, 20);
  assert.equal(new Set(NODE_KINDS).size, NODE_KINDS.length);
  for (const kind of ['decl', 'param', 'ident', 'example', 'block', 'let', 'var', 'assign',
    'call-stmt', 'put', 'if', 'wh', 'ret', 'int', 'bool', 'text', 'name', 'call', 'unary', 'binary']) {
    assert.ok((NODE_KINDS as readonly string[]).includes(kind), kind);
  }
});
