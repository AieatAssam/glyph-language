import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
vals = [int(x) for x in sys.stdin.read().split()]
print(sum(abs(v) for v in vals) if VARIANT else sum(vals))
