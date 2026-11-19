import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
s = sys.stdin.read().strip()
depth = best = 0
ok = True
for c in s:
    depth += 1 if c == '(' else -1
    best = max(best, depth)
    ok = ok and depth >= 0
if VARIANT:
    print(best)
else:
    print('yes' if ok and depth == 0 else 'no')
