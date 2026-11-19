import sys
recs = [int(l.split(',')[1]) for l in sys.stdin.read().splitlines()]
print(sum(recs) // len(recs))
