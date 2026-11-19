import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
import math
vals = [int(x) for x in sys.stdin.read().split()]
def is_prime(n):
    return n > 1 and all(n % d for d in range(2, int(n ** 0.5) + 1))
def is_sq(v):
    return v >= 0 and math.isqrt(v) ** 2 == v
test = is_sq if VARIANT else is_prime
print(' '.join(str(v) for v in vals if test(v)))
print(sum(1 for v in vals if not test(v)))
