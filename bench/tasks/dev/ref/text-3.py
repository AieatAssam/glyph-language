import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
for line in sys.stdin.read().splitlines():
    letters = [c.lower() for c in line if c.isascii() and c.isalpha()]
    vowels = sum(1 for c in letters if c in 'aeiou')
    print(len(letters) - vowels if VARIANT else vowels)
