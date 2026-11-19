import sys
lines = sys.stdin.read().splitlines()
prefix = lines[1].strip()
for w in lines[0].split():
    if w.startswith(prefix):
        print(w)
