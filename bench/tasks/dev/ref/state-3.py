import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
bal = 0
for line in sys.stdin.read().splitlines():
    op, n = line.split()
    n = int(n)
    if op == 'deposit':
        bal += n
    elif n <= bal:
        bal -= n
    elif VARIANT:
        bal = 0
    print(bal)
