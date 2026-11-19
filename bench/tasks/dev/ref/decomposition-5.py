import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
from collections import Counter
c = Counter(len(w) for w in sys.stdin.read().split())
for n in sorted(c):
    if VARIANT and n % 2:
        continue
    print(n, c[n])
