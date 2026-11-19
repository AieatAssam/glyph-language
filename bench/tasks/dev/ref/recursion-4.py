import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
n = int(sys.stdin.read().split()[0])
if not VARIANT:
    print(1 if n == 0 else 2 ** (n - 1))
else:
    top = n * (n + 1) // 2
    ways = [0] * (top + 1)
    ways[0] = 1
    for k in range(1, n + 1):
        for s in range(top, k - 1, -1):
            ways[s] += ways[s - k]
    print(sum(w for s, w in enumerate(ways) if s % 3 == 0))
