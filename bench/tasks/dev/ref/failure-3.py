import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
w = sys.stdin.read().strip()
if any(c.isdigit() for c in w):
    print('error')
    sys.exit(1)
print(w.upper() if VARIANT else w[::-1])
