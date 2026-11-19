import sys
for line in sys.stdin.read().splitlines():
    print(line[::-1])
