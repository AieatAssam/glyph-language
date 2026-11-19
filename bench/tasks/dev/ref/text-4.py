import sys
for line in sys.stdin.read().splitlines():
    print(''.join(c for c in line.upper() if c not in 'AEIOU'))
