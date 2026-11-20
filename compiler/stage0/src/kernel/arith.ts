// Checked i64 arithmetic (RFC 0020, E1 and E2). Adds six functions, add, sub, mul, div, rem and neg,
// each taking and returning i64. A case the RFC makes a trap calls rt.trap with the kind's index in
// TRAP_KINDS and does not return. Each divisor is tested before the wasm division runs, so the
// engine's own traps on division are never reached.
//
// The functions are added in dependency order: neg uses sub, and mul and div use neg.
import { Op, type ModuleBuilder } from '../../../../toolkit/wasm-encoder.ts';
import { TRAP_KINDS } from './types.ts';
import type { TrapRuntime } from './rt-trap.ts';

const OVERFLOW = TRAP_KINDS.indexOf('overflow');
const DIVIDE_BY_ZERO = TRAP_KINDS.indexOf('divide-by-zero');

export interface ArithRuntime {
  // Function indices. Each takes (i64, i64) and returns i64, except neg, which takes one i64.
  add: number;
  sub: number;
  mul: number;
  div: number;
  rem: number;
  neg: number;
}

// Call once per module, after addTrapRuntime.
export function addArith(m: ModuleBuilder, rt: TrapRuntime): ArithRuntime {
  // a + b overflowed when a and b have the same sign and r = a + b has the other one.
  // That is when ((a ^ r) & (b ^ r)) is negative.
  const add = m.addFunc(['i64', 'i64'], ['i64'], new Op()
    .localGet(0).localGet(1).i64Add().localSet(2)
    .localGet(0).localGet(2).i64Xor()
    .localGet(1).localGet(2).i64Xor()
    .i64And().i64Const(0).i64LtS()
    .if_().i32Const(OVERFLOW).call(rt.trap).end()
    .localGet(2), ['i64']);

  // a - b overflowed when a and b have different signs and r = a - b has the sign of b.
  // That is when ((a ^ b) & (a ^ r)) is negative.
  const sub = m.addFunc(['i64', 'i64'], ['i64'], new Op()
    .localGet(0).localGet(1).i64Sub().localSet(2)
    .localGet(0).localGet(1).i64Xor()
    .localGet(0).localGet(2).i64Xor()
    .i64And().i64Const(0).i64LtS()
    .if_().i32Const(OVERFLOW).call(rt.trap).end()
    .localGet(2), ['i64']);

  // -a is 0 - a, so it traps exactly when a is the minimum.
  const neg = m.addFunc(['i64'], ['i64'], new Op()
    .i64Const(0).localGet(0).call(sub));

  // 0 * b is 0. -1 * b is -b, which is neg(b), so it traps only for the minimum. Otherwise the
  // product p = a * b wrapped exactly when p / a is not b. Here a is neither 0 nor -1, so the
  // division cannot trap, and the quotient is exact when the product fits.
  const mul = m.addFunc(['i64', 'i64'], ['i64'], new Op()
    .localGet(0).i64Eqz().if_().i64Const(0).return_().end()
    .localGet(0).i64Const(-1).i64Eq().if_().localGet(1).call(neg).return_().end()
    .localGet(0).localGet(1).i64Mul().localSet(2)
    .localGet(2).localGet(0).i64DivS().localGet(1).i64Ne()
    .if_().i32Const(OVERFLOW).call(rt.trap).end()
    .localGet(2), ['i64']);

  // A zero divisor traps. b = -1 gives -a, which is neg(a), so it traps only for the minimum.
  // Otherwise i64.div_s truncates toward zero, as E2 requires.
  const div = m.addFunc(['i64', 'i64'], ['i64'], new Op()
    .localGet(1).i64Eqz().if_().i32Const(DIVIDE_BY_ZERO).call(rt.trap).end()
    .localGet(1).i64Const(-1).i64Eq().if_().localGet(0).call(neg).return_().end()
    .localGet(0).localGet(1).i64DivS());

  // A zero divisor traps. Any a % -1 is 0, so MIN % -1 is 0 and does not trap. Otherwise
  // i64.rem_s truncates toward zero and takes the sign of the dividend, as E2 requires.
  const rem = m.addFunc(['i64', 'i64'], ['i64'], new Op()
    .localGet(1).i64Eqz().if_().i32Const(DIVIDE_BY_ZERO).call(rt.trap).end()
    .localGet(1).i64Const(-1).i64Eq().if_().i64Const(0).return_().end()
    .localGet(0).localGet(1).i64RemS());

  return { add, sub, mul, div, rem, neg };
}
