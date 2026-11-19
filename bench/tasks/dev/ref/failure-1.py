import math
import sys
n = int(sys.stdin.read().split()[0])
if n < 0:
    print('error')
    sys.exit(1)
print(math.isqrt(n))
