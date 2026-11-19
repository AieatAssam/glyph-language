import functools
import sys
@functools.lru_cache(None)
def f(n):
    if n < 0:
        return 0
    if n == 0:
        return 1
    return f(n - 1) + f(n - 2) + f(n - 3)
print(f(int(sys.stdin.read().split()[0])))
