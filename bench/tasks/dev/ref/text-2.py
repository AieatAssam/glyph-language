import sys
for line in sys.stdin.read().splitlines():
    print(" ".join(line.split()[::-1]))
