import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
lines = sys.stdin.read().splitlines()
names = lines[0].split(',')
totals = [0] * len(names)
for row in lines[1:]:
    for i, v in enumerate(row.split(',')):
        totals[i] += int(v)
idx = totals.index(min(totals)) if VARIANT else totals.index(max(totals))
print(names[idx])
