import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
n = int(sys.stdin.read().split()[0])
m = 998244353 if VARIANT else 1000000007
a, b = 0, 1
for _ in range(n):
    a, b = b, (a + b) % m
print(a)
