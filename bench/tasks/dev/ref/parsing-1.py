import re
import sys
s = sys.stdin.read().strip()
print(sum(int(t) for t in re.findall(r'[+-]?\d+', s)))
