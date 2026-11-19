import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
vals = sorted(int(x) for x in sys.stdin.read().split())
if not vals:
    print('error')
    sys.exit(1)
print(vals[len(vals) // 2] if VARIANT else vals[(len(vals) - 1) // 2])
