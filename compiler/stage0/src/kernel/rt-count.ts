// Call-depth and loop-step counters (RFC 0020, TR2 and TR3). Adds two mutable i32 globals, depth
// and steps, and three functions:
//   enter()  adds 1 to depth; traps stack-exhausted if the result exceeds MAX_DEPTH
//   leave()  subtracts 1 from depth
//   tick()   traps step-exhausted before an addition would make steps exceed MAX_STEPS, else adds 1
// The compiler calls enter on each function entry and leave on each exit (TR2), and tick before each
// while condition is tested (TR3). Both limits fit in i32: MAX_STEPS is 1000000000, below 2^31.
//
// tick traps when steps >= MAX_STEPS, which is the same as "steps + 1 would exceed MAX_STEPS".
import { Op, type ModuleBuilder } from '../../../../toolkit/wasm-encoder.ts';
import { MAX_DEPTH, MAX_STEPS, TRAP_KINDS } from './types.ts';
import type { TrapRuntime } from './rt-trap.ts';

const STACK_EXHAUSTED = TRAP_KINDS.indexOf('stack-exhausted');
const STEP_EXHAUSTED = TRAP_KINDS.indexOf('step-exhausted');

export interface CounterRuntime {
  // Global indices of the two counters.
  depth: number;
  steps: number;
  // Function indices.
  enter: number;
  leave: number;
  tick: number;
}

// Call once per module, after addTrapRuntime. The counters start at 0 in each module instance, so a
// run (or an example, which is its own module under EX3) starts with fresh counters.
export function addCounters(m: ModuleBuilder, rt: TrapRuntime): CounterRuntime {
  const depth = m.addGlobal('i32', true, 0);
  const steps = m.addGlobal('i32', true, 0);

  // Local 0 holds the new depth. It is checked before it is stored, so a trap leaves depth unchanged.
  const enter = m.addFunc([], [], new Op()
    .globalGet(depth).i32Const(1).i32Add().localTee(0)
    .i32Const(MAX_DEPTH).i32GtS()
    .if_().i32Const(STACK_EXHAUSTED).call(rt.trap).end()
    .localGet(0).globalSet(depth), ['i32']);

  // depth is at least 1 whenever the compiler pairs leave with enter, so no underflow check is made.
  const leave = m.addFunc([], [], new Op()
    .globalGet(depth).i32Const(1).i32Sub().globalSet(depth));

  const tick = m.addFunc([], [], new Op()
    .globalGet(steps).i32Const(MAX_STEPS).i32GeS()
    .if_().i32Const(STEP_EXHAUSTED).call(rt.trap).end()
    .globalGet(steps).i32Const(1).i32Add().globalSet(steps));

  return { depth, steps, enter, leave, tick };
}
