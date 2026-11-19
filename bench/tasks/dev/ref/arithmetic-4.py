import math
import sys
for line in sys.stdin.read().splitlines():
    a, b = map(int, line.split())
    print(math.gcd(a, b), a * b // math.gcd(a, b))
