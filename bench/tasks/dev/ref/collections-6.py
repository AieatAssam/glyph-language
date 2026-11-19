import sys
v = [int(x) for x in sys.stdin.read().split()]
print(sum(1 for i in range(len(v)) for j in range(i + 1, len(v)) if v[i] + v[j] == 10))
