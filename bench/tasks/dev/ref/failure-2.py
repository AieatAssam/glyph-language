import sys
vals = [int(x) for x in sys.stdin.read().split()]
if 0 in vals:
    print('error')
    sys.exit(1)
p = 1
for v in vals:
    p *= v
print(p)
