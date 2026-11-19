import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
digits = sys.stdin.read().strip()
def arr(s):
    if len(s) <= 1:
        return {s}
    out = set()
    for i, c in enumerate(s):
        for rest in arr(s[:i] + s[i + 1:]):
            out.add(c + rest)
    return out
for p in sorted(arr(digits)):
    if VARIANT and p == ''.join(sorted(p)):
        continue
    print(p)
