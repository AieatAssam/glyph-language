import sys
total = 0
for line in sys.stdin.read().splitlines():
    v = int(line)
    if v == 0:
        break
    total += v
    if total > 100:
        print('error')
        sys.exit(1)
print(total)
