import sys
for pair in sys.stdin.read().strip().split(';'):
    if pair:
        print(pair.split('=')[0])
