import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
vals = [int(x) for x in sys.stdin.read().split()]
if VARIANT:
    out = sorted(set(vals), reverse=True)
else:
    out = list(dict.fromkeys(vals))
print(' '.join(map(str, out)))
