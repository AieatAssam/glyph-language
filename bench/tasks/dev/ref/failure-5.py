import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
lines = sys.stdin.read().splitlines()
key = lines[0].strip()
table = dict(l.split(',') for l in lines[1:])
if key in table:
    print(table[key])
elif VARIANT:
    print(0)
else:
    print('error')
    sys.exit(1)
