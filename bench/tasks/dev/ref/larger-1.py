"""Stack machine. Reads a program, one instruction per line. A line ending in a colon is a label.

Ops: push N, pop, dup, swap, over, add, sub, mul, print, jmp L, jz L, call L, ret, halt.
Stops when it halts, runs off the end, hits an error, or reaches the step limit.
Non-variant output: one line per print, an error line if it stopped on one, then the step count.
"""
import os
import sys

VARIANT = os.environ.get("BENCH_VARIANT") == "1"
STEP_LIMIT = 1000
BINARY = {"add": lambda a, b: a + b, "sub": lambda a, b: a - b, "mul": lambda a, b: a * b}


class VMError(Exception):
    pass


def parse(lines):
    code, labels = [], {}
    for raw in lines:
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if line.endswith(":"):
            labels[line[:-1]] = len(code)
            continue
        code.append(line.split())
    return code, labels


class Machine:
    def __init__(self, code, labels):
        self.code = code
        self.labels = labels
        self.stack = []
        self.calls = []
        self.out = []
        self.pc = 0
        self.steps = 0

    def pop(self):
        if not self.stack:
            raise VMError("stack underflow at pc %d" % self.pc)
        return self.stack.pop()

    def need(self, n):
        if len(self.stack) < n:
            raise VMError("need %d values at pc %d" % (n, self.pc))

    def target(self, name):
        if name not in self.labels:
            raise VMError("unknown label " + name)
        return self.labels[name]

    def execute(self, op):
        name, args = op[0], op[1:]
        if name == "push":
            self.stack.append(int(args[0]))
        elif name == "pop":
            self.pop()
        elif name == "dup":
            self.need(1)
            self.stack.append(self.stack[-1])
        elif name == "swap":
            self.need(2)
            self.stack[-1], self.stack[-2] = self.stack[-2], self.stack[-1]
        elif name == "over":
            self.need(2)
            self.stack.append(self.stack[-2])
        elif name in BINARY:
            self.need(2)
            b, a = self.pop(), self.pop()
            self.stack.append(BINARY[name](a, b))
        elif name == "print":
            self.out.append(str(self.pop()))
        elif name == "jmp":
            self.pc = self.target(args[0])
        elif name == "jz":
            if self.pop() == 0:
                self.pc = self.target(args[0])
        elif name == "call":
            self.calls.append(self.pc)
            self.pc = self.target(args[0])
        elif name == "ret":
            if not self.calls:
                raise VMError("return without call")
            self.pc = self.calls.pop()
        elif name == "halt":
            self.pc = len(self.code)
        else:
            raise VMError("unknown op " + name)

    def run(self):
        error = None
        while self.pc < len(self.code):
            if self.steps == STEP_LIMIT:
                error = "step limit"
                break
            self.steps += 1
            op = self.code[self.pc]
            self.pc += 1
            try:
                self.execute(op)
            except VMError as exc:
                error = str(exc)
                break
            except ValueError:
                error = "bad integer in " + " ".join(op)
                break
        return error


def describe(machine, error):
    lines = list(machine.out)
    if error:
        lines.append("error: " + error)
    return lines


def main():
    code, labels = parse(sys.stdin.read().splitlines())
    machine = Machine(code, labels)
    error = machine.run()
    if VARIANT:
        print(" ".join(str(v) for v in machine.stack))
        return
    for line in describe(machine, error):
        print(line)
    print("steps " + str(machine.steps))


if __name__ == "__main__":
    main()
