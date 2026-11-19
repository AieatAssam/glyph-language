import sys
c = 0
for line in sys.stdin.read().splitlines():
    c = c + 1 if line == 'inc' else (c - 1 if line == 'dec' else 0)
    print(c)
