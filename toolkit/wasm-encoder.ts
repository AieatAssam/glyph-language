// WebAssembly binary encoder. Pure library: knows nothing about any source language.
// Erasable TypeScript only (Node 24 type stripping): no enums, namespaces or parameter properties.

export type ValTypeName = 'i32' | 'i64' | 'f32' | 'f64';
// null is the empty block type, a number is a type index, otherwise a single result type.
export type BlockType = ValTypeName | number | null;

const VALTYPE: Record<ValTypeName, number> = { i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c };
const EXPORT_KIND = { func: 0x00, table: 0x01, memory: 0x02, global: 0x03 } as const;
export type ExportKind = keyof typeof EXPORT_KIND;

export function uleb(value: number | bigint): number[] {
  let v = BigInt(value);
  if (v < 0n) throw new RangeError(`uleb: negative value ${value}`);
  const out: number[] = [];
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v !== 0n) b |= 0x80;
    out.push(b);
  } while (v !== 0n);
  return out;
}

export function sleb(value: number | bigint): number[] {
  let v = BigInt(value);
  const out: number[] = [];
  for (;;) {
    const b = Number(v & 0x7fn);
    v >>= 7n;
    const signBit = (b & 0x40) !== 0;
    if ((v === 0n && !signBit) || (v === -1n && signBit)) {
      out.push(b);
      return out;
    }
    out.push(b | 0x80);
  }
}

function concat(parts: ArrayLike<number>[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const bytes = (...xs: number[]): Uint8Array => Uint8Array.from(xs);
const uleb8 = (n: number | bigint): Uint8Array => Uint8Array.from(uleb(n));
const vec = (items: Uint8Array[]): Uint8Array => concat([uleb8(items.length), ...items]);
const name = (s: string): Uint8Array => {
  const b = new TextEncoder().encode(s);
  return concat([uleb8(b.length), b]);
};
const section = (id: number, body: Uint8Array): Uint8Array => concat([bytes(id), uleb8(body.length), body]);

function floatBytes(v: number, bits: 32 | 64): number[] {
  const dv = new DataView(new ArrayBuffer(bits / 8));
  if (bits === 32) dv.setFloat32(0, v, true);
  else dv.setFloat64(0, v, true);
  return [...new Uint8Array(dv.buffer)];
}

// A typed constant instruction (opcode included), also used for global and data initialisers.
function constBytes(type: ValTypeName, v: number | bigint): number[] {
  switch (type) {
    case 'i32': return [0x41, ...sleb(BigInt.asIntN(32, BigInt(v)))];
    case 'i64': return [0x42, ...sleb(BigInt.asIntN(64, BigInt(v)))];
    case 'f32': return [0x43, ...floatBytes(Number(v), 32)];
    case 'f64': return [0x44, ...floatBytes(Number(v), 64)];
  }
}

// Instruction emitter. Methods return `this` so calls chain. Every op is emitted as its raw
// binary encoding; the body of a function does not need its final `end`, ModuleBuilder adds it.
export class Op {
  code: number[] = [];

  emit(...xs: number[]): this {
    this.code.push(...xs);
    return this;
  }

  unreachable(): this { return this.emit(0x00); }
  nop(): this { return this.emit(0x01); }
  block(type: BlockType = null): this { return this.emit(0x02, ...blockType(type)); }
  loop(type: BlockType = null): this { return this.emit(0x03, ...blockType(type)); }
  if_(type: BlockType = null): this { return this.emit(0x04, ...blockType(type)); }
  else_(): this { return this.emit(0x05); }
  end(): this { return this.emit(0x0b); }
  br(label: number): this { return this.emit(0x0c, ...uleb(label)); }
  brIf(label: number): this { return this.emit(0x0d, ...uleb(label)); }
  brTable(labels: number[], defaultLabel: number): this {
    const out: number[] = [0x0e, ...uleb(labels.length)];
    for (const l of labels) out.push(...uleb(l));
    out.push(...uleb(defaultLabel));
    return this.emit(...out);
  }
  return_(): this { return this.emit(0x0f); }
  call(funcIndex: number): this { return this.emit(0x10, ...uleb(funcIndex)); }
  callIndirect(typeIndex: number, table = 0): this { return this.emit(0x11, ...uleb(typeIndex), ...uleb(table)); }
  drop(): this { return this.emit(0x1a); }
  select(): this { return this.emit(0x1b); }

  localGet(i: number): this { return this.emit(0x20, ...uleb(i)); }
  localSet(i: number): this { return this.emit(0x21, ...uleb(i)); }
  localTee(i: number): this { return this.emit(0x22, ...uleb(i)); }
  globalGet(i: number): this { return this.emit(0x23, ...uleb(i)); }
  globalSet(i: number): this { return this.emit(0x24, ...uleb(i)); }

  i32Const(v: number | bigint): this { return this.emit(...constBytes('i32', v)); }
  i64Const(v: number | bigint): this { return this.emit(...constBytes('i64', v)); }
  f32Const(v: number): this { return this.emit(...constBytes('f32', v)); }
  f64Const(v: number): this { return this.emit(...constBytes('f64', v)); }

  memorySize(): this { return this.emit(0x3f, 0x00); }
  memoryGrow(): this { return this.emit(0x40, 0x00); }

  toBytes(): Uint8Array { return Uint8Array.from(this.code); }
}

function blockType(t: BlockType): number[] {
  if (t === null) return [0x40];
  if (typeof t === 'number') return sleb(t);
  return [VALTYPE[t]];
}

// Loads and stores take (offset = 0, align = natural alignment as log2). Memarg is align then offset.
const MEM_OPS: Record<string, [number, number]> = {
  i32Load: [0x28, 2], i64Load: [0x29, 3], f32Load: [0x2a, 2], f64Load: [0x2b, 3],
  i32Load8S: [0x2c, 0], i32Load8U: [0x2d, 0], i32Load16S: [0x2e, 1], i32Load16U: [0x2f, 1],
  i64Load8S: [0x30, 0], i64Load8U: [0x31, 0], i64Load16S: [0x32, 1], i64Load16U: [0x33, 1],
  i64Load32S: [0x34, 2], i64Load32U: [0x35, 2],
  i32Store: [0x36, 2], i64Store: [0x37, 3], f32Store: [0x38, 2], f64Store: [0x39, 3],
  i32Store8: [0x3a, 0], i32Store16: [0x3b, 1], i64Store8: [0x3c, 0], i64Store16: [0x3d, 1],
  i64Store32: [0x3e, 2],
};
for (const [opName, [code, naturalAlign]] of Object.entries(MEM_OPS)) {
  Object.defineProperty(Op.prototype, opName, {
    configurable: true,
    writable: true,
    value: function (this: Op, offset = 0, align = naturalAlign): Op {
      return this.emit(code, ...uleb(align), ...uleb(offset));
    },
  });
}

// Operators without immediates: comparisons, arithmetic, bitwise, conversions, sign extension.
// Named <type><Op>, e.g. i32Add, i64LtU, f64Sqrt, i32WrapI64, i64ExtendI32S.
const SIMPLE_OPS: Record<string, number> = {
  i32Eqz: 0x45, i32Eq: 0x46, i32Ne: 0x47, i32LtS: 0x48, i32LtU: 0x49, i32GtS: 0x4a, i32GtU: 0x4b,
  i32LeS: 0x4c, i32LeU: 0x4d, i32GeS: 0x4e, i32GeU: 0x4f,
  i64Eqz: 0x50, i64Eq: 0x51, i64Ne: 0x52, i64LtS: 0x53, i64LtU: 0x54, i64GtS: 0x55, i64GtU: 0x56,
  i64LeS: 0x57, i64LeU: 0x58, i64GeS: 0x59, i64GeU: 0x5a,
  f32Eq: 0x5b, f32Ne: 0x5c, f32Lt: 0x5d, f32Gt: 0x5e, f32Le: 0x5f, f32Ge: 0x60,
  f64Eq: 0x61, f64Ne: 0x62, f64Lt: 0x63, f64Gt: 0x64, f64Le: 0x65, f64Ge: 0x66,
  i32Clz: 0x67, i32Ctz: 0x68, i32Popcnt: 0x69, i32Add: 0x6a, i32Sub: 0x6b, i32Mul: 0x6c,
  i32DivS: 0x6d, i32DivU: 0x6e, i32RemS: 0x6f, i32RemU: 0x70, i32And: 0x71, i32Or: 0x72,
  i32Xor: 0x73, i32Shl: 0x74, i32ShrS: 0x75, i32ShrU: 0x76, i32Rotl: 0x77, i32Rotr: 0x78,
  i64Clz: 0x79, i64Ctz: 0x7a, i64Popcnt: 0x7b, i64Add: 0x7c, i64Sub: 0x7d, i64Mul: 0x7e,
  i64DivS: 0x7f, i64DivU: 0x80, i64RemS: 0x81, i64RemU: 0x82, i64And: 0x83, i64Or: 0x84,
  i64Xor: 0x85, i64Shl: 0x86, i64ShrS: 0x87, i64ShrU: 0x88, i64Rotl: 0x89, i64Rotr: 0x8a,
  f32Abs: 0x8b, f32Neg: 0x8c, f32Ceil: 0x8d, f32Floor: 0x8e, f32Trunc: 0x8f, f32Nearest: 0x90,
  f32Sqrt: 0x91, f32Add: 0x92, f32Sub: 0x93, f32Mul: 0x94, f32Div: 0x95, f32Min: 0x96,
  f32Max: 0x97, f32Copysign: 0x98,
  f64Abs: 0x99, f64Neg: 0x9a, f64Ceil: 0x9b, f64Floor: 0x9c, f64Trunc: 0x9d, f64Nearest: 0x9e,
  f64Sqrt: 0x9f, f64Add: 0xa0, f64Sub: 0xa1, f64Mul: 0xa2, f64Div: 0xa3, f64Min: 0xa4,
  f64Max: 0xa5, f64Copysign: 0xa6,
  i32WrapI64: 0xa7, i32TruncF32S: 0xa8, i32TruncF32U: 0xa9, i32TruncF64S: 0xaa, i32TruncF64U: 0xab,
  i64ExtendI32S: 0xac, i64ExtendI32U: 0xad, i64TruncF32S: 0xae, i64TruncF32U: 0xaf,
  i64TruncF64S: 0xb0, i64TruncF64U: 0xb1, f32ConvertI32S: 0xb2, f32ConvertI32U: 0xb3,
  f32ConvertI64S: 0xb4, f32ConvertI64U: 0xb5, f32DemoteF64: 0xb6, f64ConvertI32S: 0xb7,
  f64ConvertI32U: 0xb8, f64ConvertI64S: 0xb9, f64ConvertI64U: 0xba, f64PromoteF32: 0xbb,
  i32ReinterpretF32: 0xbc, i64ReinterpretF64: 0xbd, f32ReinterpretI32: 0xbe, f64ReinterpretI64: 0xbf,
  i32Extend8S: 0xc0, i32Extend16S: 0xc1, i64Extend8S: 0xc2, i64Extend16S: 0xc3, i64Extend32S: 0xc4,
};
for (const [opName, code] of Object.entries(SIMPLE_OPS)) {
  Object.defineProperty(Op.prototype, opName, {
    configurable: true,
    writable: true,
    value: function (this: Op): Op {
      return this.emit(code);
    },
  });
}

export interface FuncType {
  params: ValTypeName[];
  results: ValTypeName[];
}

interface DefinedFunc {
  type: number;
  locals: ValTypeName[];
  body: Uint8Array | null;
}

// Local-function locals are run-length encoded as (count, type) pairs.
function encodeLocals(locals: ValTypeName[]): Uint8Array {
  const groups: Uint8Array[] = [];
  let i = 0;
  while (i < locals.length) {
    let j = i;
    while (j < locals.length && locals[j] === locals[i]) j++;
    groups.push(bytes(...uleb(j - i), VALTYPE[locals[i]]));
    i = j;
  }
  return vec(groups);
}

export class ModuleBuilder {
  types: FuncType[] = [];
  typeMap = new Map<string, number>();
  imports: { module: string; name: string; type: number }[] = [];
  funcs: DefinedFunc[] = [];
  memory: { min: number; max?: number } | null = null;
  globals: { type: ValTypeName; mutable: boolean; init: number | bigint }[] = [];
  exports: { name: string; kind: ExportKind; index: number }[] = [];
  datas: { offset: number; bytes: Uint8Array }[] = [];
  startFunc: number | null = null;

  // Deduplicated: identical signatures share one type index.
  typeIndex(params: ValTypeName[], results: ValTypeName[]): number {
    const key = `${params.join(',')}>${results.join(',')}`;
    let index = this.typeMap.get(key);
    if (index === undefined) {
      index = this.types.length;
      this.types.push({ params: [...params], results: [...results] });
      this.typeMap.set(key, index);
    }
    return index;
  }

  // Imports come first in the function index space, so they must precede every local function.
  importFunc(module: string, field: string, params: ValTypeName[], results: ValTypeName[]): number {
    if (this.funcs.length > 0) throw new Error('importFunc: imports must be added before functions');
    this.imports.push({ module, name: field, type: this.typeIndex(params, results) });
    return this.imports.length - 1;
  }

  // Reserves a local function index. Give its body later with defineFunc (allows forward calls).
  declareFunc(params: ValTypeName[], results: ValTypeName[]): number {
    this.funcs.push({ type: this.typeIndex(params, results), locals: [], body: null });
    return this.imports.length + this.funcs.length - 1;
  }

  defineFunc(index: number, body: Op | Uint8Array, locals: ValTypeName[] = []): void {
    const f = this.funcs[index - this.imports.length];
    if (index < this.imports.length || !f) throw new RangeError(`defineFunc: ${index} is not a declared local function`);
    if (f.body) throw new Error(`defineFunc: function ${index} already has a body`);
    f.locals = [...locals];
    f.body = body instanceof Uint8Array ? body : body.toBytes();
  }

  addFunc(params: ValTypeName[], results: ValTypeName[], body: Op | Uint8Array, locals: ValTypeName[] = []): number {
    const index = this.declareFunc(params, results);
    this.defineFunc(index, body, locals);
    return index;
  }

  setMemory(min: number, max?: number): void {
    this.memory = max === undefined ? { min } : { min, max };
  }

  addGlobal(type: ValTypeName, mutable: boolean, init: number | bigint): number {
    this.globals.push({ type, mutable, init });
    return this.globals.length - 1;
  }

  exportFunc(name: string, index: number): void { this.addExport(name, 'func', index); }
  exportMemory(name: string, index = 0): void { this.addExport(name, 'memory', index); }
  exportGlobal(name: string, index: number): void { this.addExport(name, 'global', index); }

  private addExport(name: string, kind: ExportKind, index: number): void {
    if (this.exports.some((e) => e.name === name)) throw new Error(`duplicate export "${name}"`);
    this.exports.push({ name, kind, index });
  }

  // Active data segment in memory 0.
  addData(offset: number, data: Uint8Array | string): void {
    const b = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this.datas.push({ offset, bytes: b });
  }

  setStart(index: number): void {
    this.startFunc = index;
  }

  toBytes(): Uint8Array {
    for (let i = 0; i < this.funcs.length; i++) {
      if (!this.funcs[i].body) throw new Error(`function ${this.imports.length + i} was declared but never defined`);
    }
    const parts: Uint8Array[] = [bytes(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)];
    if (this.types.length) {
      parts.push(section(1, vec(this.types.map((t) => concat([
        bytes(0x60),
        vec(t.params.map((p) => bytes(VALTYPE[p]))),
        vec(t.results.map((r) => bytes(VALTYPE[r]))),
      ])))));
    }
    if (this.imports.length) {
      parts.push(section(2, vec(this.imports.map((im) => concat([
        name(im.module), name(im.name), bytes(0x00), uleb8(im.type),
      ])))));
    }
    if (this.funcs.length) {
      parts.push(section(3, vec(this.funcs.map((f) => uleb8(f.type)))));
    }
    if (this.memory) {
      const m = this.memory;
      const limits = m.max === undefined ? concat([bytes(0x00), uleb8(m.min)]) : concat([bytes(0x01), uleb8(m.min), uleb8(m.max)]);
      parts.push(section(5, vec([limits])));
    }
    if (this.globals.length) {
      parts.push(section(6, vec(this.globals.map((g) => concat([
        bytes(VALTYPE[g.type], g.mutable ? 1 : 0),
        bytes(...constBytes(g.type, g.init), 0x0b),
      ])))));
    }
    if (this.exports.length) {
      parts.push(section(7, vec(this.exports.map((e) => concat([
        name(e.name), bytes(EXPORT_KIND[e.kind]), uleb8(e.index),
      ])))));
    }
    if (this.startFunc !== null) {
      parts.push(section(8, uleb8(this.startFunc)));
    }
    if (this.funcs.length) {
      parts.push(section(10, vec(this.funcs.map((f) => {
        const body = concat([encodeLocals(f.locals), f.body as Uint8Array, bytes(0x0b)]);
        return concat([uleb8(body.length), body]);
      }))));
    }
    if (this.datas.length) {
      parts.push(section(11, vec(this.datas.map((d) => concat([
        bytes(0x00, ...constBytes('i32', d.offset), 0x0b),
        uleb8(d.bytes.length),
        d.bytes,
      ])))));
    }
    return concat(parts);
  }
}
