import os
import sys
VARIANT = os.environ.get("BENCH_VARIANT") == "1"
from collections import deque
q = deque()
for line in sys.stdin.read().splitlines():
    p = line.split()
    if p[0] == 'enq':
        q.append(int(p[1]))
    elif q:
        print(q.pop() if VARIANT else q.popleft())
    else:
        print('none')
