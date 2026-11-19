// Stage 0 compiler core for the toy language (M1). Pure: no Node APIs, so the CLI (main.ts) and the
// playground entry (browser.ts) share it. Erasable TypeScript only, run by Node 24.
// Language: lines of `print EXPR`, EXPR over i32 with + - * / and parentheses.
import { ModuleBuilder, Op } from '../../../toolkit/wasm-encoder.ts';

export type Span = { line: number; col: number };
export type Diagnostic = { code: string; message: string; span: Span; file: string };
export type Expr = { k: 'num'; v: number } | { k: 'bin'; op: '+' | '-' | '*' | '/'; l: Expr; r: Expr };
export type Stmt = { line: number; e: Expr };
export type Result = { ok: true; bytes: Uint8Array } | { ok: false; diagnostics: Diagnostic[] };

type Tok = { t: 'int' | 'op' | 'lp' | 'rp' | 'print' | 'nl' | 'eof'; text: string; span: Span; v?: number };

class CompileError extends Error {
  code: string;
  span: Span;
  constructor(code: string, message: string, span: Span) {
    super(message);
    this.code = code;
    this.span = span;
  }
}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let line = 1, col = 1, i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const span = { line, col };
    if (c === '\n') { out.push({ t: 'nl', text: '\n', span }); line++; col = 1; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { col++; i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && src[j]! >= '0' && src[j]! <= '9') j++;
      const text = src.slice(i, j);
      const v = Number(text);
      if (v > 2147483647) throw new CompileError('E0004', `integer literal ${text} does not fit in i32`, span);
      out.push({ t: 'int', text, span, v }); col += j - i; i = j; continue;
    }
    if (/[a-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-z]/.test(src[j]!)) j++;
      const word = src.slice(i, j);
      if (word !== 'print') throw new CompileError('E0001', `unknown word "${word}"`, span);
      out.push({ t: 'print', text: word, span }); col += j - i; i = j; continue;
    }
    if ('+-*/'.includes(c)) { out.push({ t: 'op', text: c, span }); col++; i++; continue; }
    if (c === '(') { out.push({ t: 'lp', text: c, span }); col++; i++; continue; }
    if (c === ')') { out.push({ t: 'rp', text: c, span }); col++; i++; continue; }
    throw new CompileError('E0001', `unexpected character "${c}"`, span);
  }
  out.push({ t: 'eof', text: '', span: { line, col } });
  return out;
}

function parse(toks: Tok[]): Stmt[] {
  let p = 0;
  const peek = () => toks[p]!;
  const take = () => toks[p++]!;
  const expr = (): Expr => {
    let l = term();
    while (peek().t === 'op' && (peek().text === '+' || peek().text === '-')) {
      const op = take().text as '+' | '-';
      l = { k: 'bin', op, l, r: term() };
    }
    return l;
  };
  const term = (): Expr => {
    let l = atom();
    while (peek().t === 'op' && (peek().text === '*' || peek().text === '/')) {
      const op = take().text as '*' | '/';
      l = { k: 'bin', op, l, r: atom() };
    }
    return l;
  };
  const atom = (): Expr => {
    const t = peek();
    if (t.t === 'int') { take(); return { k: 'num', v: t.v! }; }
    if (t.t === 'lp') {
      take();
      const e = expr();
      if (peek().t !== 'rp') throw new CompileError('E0003', 'expected ")"', peek().span);
      take();
      return e;
    }
    throw new CompileError('E0002', 'expected expression', t.span);
  };
  const stmts: Stmt[] = [];
  while (peek().t !== 'eof') {
    if (peek().t === 'nl') { take(); continue; }
    const kw = peek();
    if (kw.t !== 'print') throw new CompileError('E0002', 'expected "print"', kw.span);
    take();
    const e = expr();
    stmts.push({ line: kw.span.line, e });
    if (peek().t !== 'nl' && peek().t !== 'eof') throw new CompileError('E0003', 'expected end of line after expression', peek().span);
  }
  return stmts;
}

const OPCODE = { '+': 0x6a, '-': 0x6b, '*': 0x6c, '/': 0x6d } as const;

// print(v): writes decimal v and a newline to fd 1. Digits are built as non-positive values
// so that INT_MIN does not overflow.
function printFunc(mb: ModuleBuilder, fdWrite: number): number {
  const b = new Op();
  // memory: iovec at 0 (base at 0, len at 4), buffer ends at 31 with newline
  b.i32Const(31).i32Const(10).emit(0x3a, 0x00, 0x00);     // mem8[31] = '\n'
  b.i32Const(31).localSet(1);                              // p = 31
  b.localGet(0).localSet(2);                               // n = v
  b.localGet(0).i32Const(0).emit(0x4a).if_();              // if v > 0: n = -v
  b.i32Const(0).localGet(0).emit(0x6b).localSet(2).end();
  b.loop();
  b.localGet(1).i32Const(1).emit(0x6b).localSet(1);        // p -= 1
  b.localGet(1);                                           // address
  b.i32Const(48).localGet(2).i32Const(10).emit(0x6f).emit(0x6b); // 48 - (n rem 10)
  b.emit(0x3a, 0x00, 0x00);                                // store8
  b.localGet(2).i32Const(10).emit(0x6d).localSet(2);       // n /= 10
  b.localGet(2).i32Const(0).emit(0x47).brIf(0);            // loop while n != 0
  b.end();
  b.localGet(0).i32Const(0).emit(0x48).if_();              // if v < 0: prepend '-'
  b.localGet(1).i32Const(1).emit(0x6b).localSet(1);
  b.localGet(1).i32Const(45).emit(0x3a, 0x00, 0x00);
  b.end();
  b.i32Const(0).localGet(1).emit(0x36, 0x02, 0x00);        // iov.base = p
  b.i32Const(4).i32Const(32).localGet(1).emit(0x6b).emit(0x36, 0x02, 0x00); // iov.len = 32 - p
  b.i32Const(1).i32Const(0).i32Const(1).i32Const(8).call(fdWrite).drop();
  return mb.addFunc(['i32'], [], b, ['i32', 'i32']);
}

function emitExpr(b: Op, e: Expr): void {
  if (e.k === 'num') { b.i32Const(e.v); return; }
  emitExpr(b, e.l);
  emitExpr(b, e.r);
  b.emit(OPCODE[e.op]);
}

export function compile(src: string, file = 'main.toy'): Result {
  try {
    const stmts = parse(lex(src));
    const mb = new ModuleBuilder();
    const fdWrite = mb.importFunc('wasi_snapshot_preview1', 'fd_write', ['i32', 'i32', 'i32', 'i32'], ['i32']);
    mb.setMemory(1);
    mb.exportMemory('memory');
    const printIdx = printFunc(mb, fdWrite);
    const start = new Op();
    for (const s of stmts) { emitExpr(start, s.e); start.call(printIdx); }
    const mainIdx = mb.addFunc([], [], start);
    mb.exportFunc('_start', mainIdx);
    return { ok: true, bytes: mb.toBytes() };
  } catch (err) {
    if (err instanceof CompileError) {
      return { ok: false, diagnostics: [{ code: err.code, message: err.message, span: err.span, file }] };
    }
    throw err;
  }
}

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 } as const;

// Parenthesise only where precedence or associativity needs it.
function show(e: Expr, parent = 0, right = false): string {
  if (e.k === 'num') return String(e.v);
  const p = PREC[e.op];
  const body = `${show(e.l, p, false)} ${e.op} ${show(e.r, p, true)}`;
  return p < parent || (p === parent && right) ? `(${body})` : body;
}

// Canonical text: one `print` per line. Returns the source unchanged when it does not parse.
export function format(src: string): string {
  try {
    return parse(lex(src)).map((s) => `print ${show(s.e)}\n`).join('');
  } catch (err) {
    if (err instanceof CompileError) return src;
    throw err;
  }
}
