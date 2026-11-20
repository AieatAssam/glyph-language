// Stage 0 compiler core for the toy language (M1). Pure: no Node APIs, so the CLI (main.ts) and the
// playground entry (browser.ts) share it. Erasable TypeScript only, run by Node 24.
// Language: lines of `print EXPR`, EXPR over i32 with + - * / and parentheses.
// Stages: lex -> parse (AST) -> lower (IR) -> emit (wasm). `dump` exposes the first three.
import { ModuleBuilder, Op } from '../../../toolkit/wasm-encoder.ts';

export type Span = { line: number; col: number };
export type Diagnostic = { code: string; message: string; span: Span; end: Span; file: string };
export type Expr = { k: 'num'; v: number } | { k: 'bin'; op: '+' | '-' | '*' | '/'; l: Expr; r: Expr };
export type Stmt = { line: number; e: Expr };
export type Tok = { t: 'int' | 'op' | 'lp' | 'rp' | 'print' | 'nl' | 'eof'; text: string; span: Span; v?: number };
export type IrOp = { op: 'const'; v: number } | { op: 'bin'; sym: '+' | '-' | '*' | '/' } | { op: 'call'; fn: 'print' };
export type Result = { ok: true; bytes: Uint8Array } | { ok: false; diagnostics: Diagnostic[] };
export type Stage = 'tokens' | 'ast' | 'ir';
type Outcome<T> = { ok: true; value: T } | { ok: false; diagnostics: Diagnostic[] };

class CompileError extends Error {
  code: string;
  span: Span;
  end: Span;
  constructor(code: string, message: string, span: Span, end?: Span) {
    super(message);
    this.code = code;
    this.span = span;
    this.end = end ?? { line: span.line, col: span.col + 1 };
  }
}

// End of a token's text on its line. At least one column, so an empty end-of-file token still has a span.
function tokEnd(t: Tok): Span {
  return { line: t.span.line, col: t.span.col + Math.max(1, t.text.length) };
}

export function lex(src: string): Tok[] {
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
      if (v > 2147483647) throw new CompileError('E0004', `integer literal ${text} does not fit in i32`, span, { line, col: col + text.length });
      out.push({ t: 'int', text, span, v }); col += j - i; i = j; continue;
    }
    if (/[a-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-z]/.test(src[j]!)) j++;
      const word = src.slice(i, j);
      if (word !== 'print') throw new CompileError('E0001', `unknown word "${word}"`, span, { line, col: col + word.length });
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

export function parse(toks: Tok[]): Stmt[] {
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
      if (peek().t !== 'rp') throw new CompileError('E0003', 'expected ")"', peek().span, tokEnd(peek()));
      take();
      return e;
    }
    throw new CompileError('E0002', 'expected expression', t.span, tokEnd(t));
  };
  const stmts: Stmt[] = [];
  while (peek().t !== 'eof') {
    if (peek().t === 'nl') { take(); continue; }
    const kw = peek();
    if (kw.t !== 'print') throw new CompileError('E0002', 'expected "print"', kw.span, tokEnd(kw));
    take();
    const e = expr();
    stmts.push({ line: kw.span.line, e });
    if (peek().t !== 'nl' && peek().t !== 'eof') throw new CompileError('E0003', 'expected end of line after expression', peek().span, tokEnd(peek()));
  }
  return stmts;
}

// Lower the AST to a flat stack-machine IR: one `call print` after each statement's expression.
function lowerExpr(e: Expr, out: IrOp[]): void {
  if (e.k === 'num') { out.push({ op: 'const', v: e.v }); return; }
  lowerExpr(e.l, out);
  lowerExpr(e.r, out);
  out.push({ op: 'bin', sym: e.op });
}

export function lower(stmts: Stmt[]): IrOp[] {
  const out: IrOp[] = [];
  for (const s of stmts) { lowerExpr(s.e, out); out.push({ op: 'call', fn: 'print' }); }
  return out;
}

const OPCODE = { '+': 0x6a, '-': 0x6b, '*': 0x6c, '/': 0x6d } as const;
const DIV_TRAP = 'trap: division by zero\n';

// div(a, b): a / b, or the defined runtime failure: the message on stderr and exit status 1 (SPEC section 8).
// Guarding here keeps a raw wasm trap out of every program; i32.div_s would trap with no message.
function divFunc(mb: ModuleBuilder, fdWrite: number, procExit: number): number {
  const b = new Op();
  b.localGet(1).i32Const(0).emit(0x46).if_();              // if b == 0
  b.i32Const(0).i32Const(64).emit(0x36, 0x02, 0x00);       // iov.base = message at 64
  b.i32Const(4).i32Const(DIV_TRAP.length).emit(0x36, 0x02, 0x00); // iov.len
  b.i32Const(2).i32Const(0).i32Const(1).i32Const(8).call(fdWrite).drop(); // fd 2
  b.i32Const(1).call(procExit);
  b.end();
  b.localGet(0).localGet(1).emit(OPCODE['/']);
  return mb.addFunc(['i32', 'i32'], ['i32'], b);
}

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

// Emit IR as stack code. Expression operands are pushed in order, so binary ops need no reordering.
function emitIr(ir: IrOp[], printIdx: number, divIdx: number): Op {
  const b = new Op();
  for (const o of ir) {
    if (o.op === 'const') b.i32Const(o.v);
    else if (o.op === 'bin') { if (o.sym === '/') b.call(divIdx); else b.emit(OPCODE[o.sym]); }
    else b.call(printIdx);
  }
  return b;
}

// Run a stage and turn its CompileError into diagnostics. Other exceptions are bugs and propagate.
function guard<T>(file: string, f: () => T): Outcome<T> {
  try {
    return { ok: true, value: f() };
  } catch (err) {
    if (err instanceof CompileError) {
      return { ok: false, diagnostics: [{ code: err.code, message: err.message, span: err.span, end: err.end, file }] };
    }
    throw err;
  }
}

export function compile(src: string, file = 'main.toy'): Result {
  const r = guard(file, () => {
    const stmts = parse(lex(src));
    const mb = new ModuleBuilder();
    const fdWrite = mb.importFunc('wasi_snapshot_preview1', 'fd_write', ['i32', 'i32', 'i32', 'i32'], ['i32']);
    const procExit = mb.importFunc('wasi_snapshot_preview1', 'proc_exit', ['i32'], []);
    mb.setMemory(1);
    mb.exportMemory('memory');
    mb.addData(64, DIV_TRAP);
    const printIdx = printFunc(mb, fdWrite);
    const divIdx = divFunc(mb, fdWrite, procExit);
    const mainIdx = mb.addFunc([], [], emitIr(lower(stmts), printIdx, divIdx));
    mb.exportFunc('_start', mainIdx);
    return mb.toBytes();
  });
  return r.ok ? { ok: true, bytes: r.value } : { ok: false, diagnostics: r.diagnostics };
}

// Canonical dump of one stage: tokens, the AST statements, or the IR ops.
export function dump(src: string, stage: Stage, file = 'main.toy'): Outcome<unknown> {
  return guard(file, () => {
    const toks = lex(src);
    if (stage === 'tokens') return toks;
    const stmts = parse(toks);
    return stage === 'ast' ? stmts : lower(stmts);
  });
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
