import functools
import sys
@functools.lru_cache(None)
def ways(n):
    return 1 if n <= 1 else ways(n - 1) + ways(n - 2)
print(ways(int(sys.stdin.read().split()[0])))
