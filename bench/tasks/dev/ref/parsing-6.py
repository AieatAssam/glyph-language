import re
import sys
print(sum(int(x) for x in re.findall(r'-?\d+', sys.stdin.read())))
