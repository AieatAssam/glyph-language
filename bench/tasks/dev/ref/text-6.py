import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
for line in sys.stdin.read().splitlines():
    if VARIANT:
        s = [c.lower() for c in line if c != ' ']
    else:
        s = [c.lower() for c in line if c.isascii() and c.isalpha()]
    print('yes' if s == s[::-1] else 'no')
