// Kernel value types, trap kinds and limits (RFC 0020: Types, TR1, TR2, TR3).
// Constants and type names only. Nothing here does I/O or allocates.

// Int is a signed 64-bit two's complement integer (T1). The compiler holds it as bigint.
export type Int = bigint;
// Bool is true or false (T2).
export type Bool = boolean;
// Text is an immutable sequence of UTF-8 bytes (T3).
export type Text = Uint8Array;

// The range of Int (T1).
export const INT_MAX = 9223372036854775807n;
export const INT_MIN = -9223372036854775808n;

// Trap kinds (TR1). A trap writes its line to standard error and exits with status 1.
export const TRAP_KINDS = ['overflow', 'divide-by-zero', 'stack-exhausted', 'step-exhausted'] as const;
export type TrapKind = (typeof TRAP_KINDS)[number];

export const TRAP_LINE: Readonly<Record<TrapKind, string>> = {
  overflow: 'trap: overflow',
  'divide-by-zero': 'trap: divide-by-zero',
  'stack-exhausted': 'trap: stack-exhausted',
  'step-exhausted': 'trap: step-exhausted',
};

// Largest call depth before a trap (TR2). A call that would make the depth 10001 traps.
export const MAX_DEPTH = 10000;

// Largest number of while-condition evaluations in one run before a trap (TR3).
export const MAX_STEPS = 1000000000;
