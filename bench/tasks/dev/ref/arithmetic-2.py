import sys
n = abs(int(sys.stdin.read().split()[0]))
print(sum(int(d) for d in str(n)))
