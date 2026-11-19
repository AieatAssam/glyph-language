import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
for line in sys.stdin.read().splitlines():
    a, b = map(int, line.split())
    q = abs(a) // abs(b)
    if (a < 0) != (b < 0):
        q = -q
    print(a - q * b if VARIANT else q)
