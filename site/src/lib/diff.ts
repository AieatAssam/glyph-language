// Line diff by longest common subsequence. Above the cap it reports a full replace
// (ceiling: O(n*m) memory; spec files are far below the cap).

export type Op = { t: " " | "-" | "+"; s: string };

const CAP = 25_000_000;

export function lineDiff(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  if (n * m > CAP) return [...a.map((s) => ({ t: "-" as const, s })), ...b.map((s) => ({ t: "+" as const, s }))];
  const W = m + 1;
  const L = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i * W + j] = a[i] === b[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: " ", s: a[i] });
      i++;
      j++;
    } else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) {
      ops.push({ t: "-", s: a[i++] });
    } else {
      ops.push({ t: "+", s: b[j++] });
    }
  }
  while (i < n) ops.push({ t: "-", s: a[i++] });
  while (j < m) ops.push({ t: "+", s: b[j++] });
  return ops;
}

export interface Row {
  kind: "ctx" | "change";
  left: string | null;
  right: string | null;
}

// Side-by-side rows: a run of removals and additions is paired into one row each.
export function sideBySide(ops: Op[]): Row[] {
  const rows: Row[] = [];
  let dels: string[] = [];
  let adds: string[] = [];
  const flush = () => {
    const k = Math.max(dels.length, adds.length);
    for (let x = 0; x < k; x++)
      rows.push({ kind: "change", left: x < dels.length ? dels[x] : null, right: x < adds.length ? adds[x] : null });
    dels = [];
    adds = [];
  };
  for (const op of ops) {
    if (op.t === " ") {
      flush();
      rows.push({ kind: "ctx", left: op.s, right: op.s });
    } else if (op.t === "-") dels.push(op.s);
    else adds.push(op.s);
  }
  flush();
  return rows;
}
