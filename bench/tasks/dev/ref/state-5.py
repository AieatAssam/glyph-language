import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
pos = best = 0
for m in sys.stdin.read().strip():
    if m == 'R':
        pos += 1
    elif pos > 0 or VARIANT:
        pos -= 1
    best = max(best, pos)
print(best if VARIANT else pos)
