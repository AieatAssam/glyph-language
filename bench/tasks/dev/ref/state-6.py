import sys
store = {}
for line in sys.stdin.read().splitlines():
    p = line.split()
    if p[0] == 'set':
        store[p[1]] = p[2]
    else:
        print(store.get(p[1], 'unset'))
