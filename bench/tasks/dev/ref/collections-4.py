import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
from collections import Counter
c = Counter(int(x) for x in sys.stdin.read().split())
for v in sorted(c):
    if VARIANT and c[v] < 2:
        continue
    print(f'{v}:{c[v]}')
