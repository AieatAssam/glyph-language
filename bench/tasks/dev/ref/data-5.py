import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
recs = []
for line in sys.stdin.read().splitlines():
    n, s = line.split(',')
    recs.append((int(s), n))
best = min(recs, key=lambda t: (t[0], t[1])) if VARIANT else min(recs, key=lambda t: (-t[0], t[1]))
print(best[1])
