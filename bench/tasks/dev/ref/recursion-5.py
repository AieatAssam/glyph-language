import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
n = int(sys.stdin.read().split()[0])
a, b, c = ('1', '2', '3') if VARIANT else ('A', 'B', 'C')
def hanoi(k, src, dst, via):
    if k == 0:
        return
    hanoi(k - 1, src, via, dst)
    print(src, dst)
    hanoi(k - 1, via, dst, src)
hanoi(n, a, c, b)
