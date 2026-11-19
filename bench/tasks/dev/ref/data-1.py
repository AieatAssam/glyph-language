import sys
for line in sys.stdin.read().splitlines():
    print(sum(int(x) for x in line.split(',')))
