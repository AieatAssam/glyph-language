import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
vals = [int(x) for x in sys.stdin.read().split()]
best = cur = 1
for i in range(1, len(vals)):
    ok = vals[i] > vals[i - 1] if VARIANT else vals[i] == vals[i - 1]
    cur = cur + 1 if ok else 1
    best = max(best, cur)
print(best)
