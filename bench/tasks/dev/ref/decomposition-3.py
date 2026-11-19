import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
rows = [[int(x) for x in l.split()] for l in sys.stdin.read().splitlines()]
rs = [sum(r) for r in rows]
cs = [sum(c) for c in zip(*rows)]
if VARIANT:
    print(max(rs), max(cs))
else:
    print(' '.join(map(str, rs)))
    print(' '.join(map(str, cs)))
