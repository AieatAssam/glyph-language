import sys
print(sum(1 for w in sys.stdin.read().split() if len(w) > 3))
