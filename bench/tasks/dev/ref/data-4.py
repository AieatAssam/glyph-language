import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
lines = sys.stdin.read().splitlines()
for line in sorted(lines, key=lambda l: l.split(',')[0], reverse=VARIANT):
    print(line)
