import sys
lines = sys.stdin.read().splitlines()
for line in sorted(lines, key=lambda l: -len(l.replace(' ', ''))):
    print(line)
