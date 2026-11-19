import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
ROM = [(1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'), (100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'), (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')]
s = sys.stdin.read().strip()
if VARIANT:
    n = int(s)
    out = ''
    for v, sym in ROM:
        while n >= v:
            out += sym
            n -= v
    print(out)
else:
    vals = dict((sym, v) for v, sym in ROM)
    total = 0
    for i, c in enumerate(s):
        nxt = vals[s[i + 1]] if i + 1 < len(s) else 0
        total += -vals[c] if vals[c] < nxt else vals[c]
    print(total)
