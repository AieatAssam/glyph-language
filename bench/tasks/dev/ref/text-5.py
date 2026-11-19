import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
from collections import Counter
counts = Counter(c.lower() for c in sys.stdin.read() if c.isascii() and c.isalpha())
if not counts:
    print('none')
else:
    best = min(counts.values()) if VARIANT else max(counts.values())
    print(min(c for c in counts if counts[c] == best))
