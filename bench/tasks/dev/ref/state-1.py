import sys
st = []
for line in sys.stdin.read().splitlines():
    p = line.split()
    if p[0] == 'push':
        st.append(int(p[1]))
    elif p[0] == 'pop':
        if st:
            st.pop()
    else:
        print(st[-1] if st else 'empty')
