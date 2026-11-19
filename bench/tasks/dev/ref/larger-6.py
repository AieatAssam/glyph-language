"""Grid robot. Input: a line 'W H', then H map rows, then one line of commands.
Map: '#' is a wall, '.' is open, 'R' marks the start cell. The robot starts facing north.
Commands: F moves one cell forward, L and R turn left and right, other letters are ignored.
A forward move into a wall or off the map is a bump: the robot stays put and the bump counts.
Coordinates grow east (x) and south (y) from the top left.
Non-variant output: 'x y FACING bumps N', then the map with visited cells marked 'o' and the robot as '@'.
Variant output: the number of distinct cells visited, the start included.
"""
import os
import sys

VARIANT = os.environ.get("BENCH_VARIANT") == "1"
HEADINGS = [(0, -1), (1, 0), (0, 1), (-1, 0)]
NAMES = "NESW"


class Robot:
    def __init__(self, grid, start):
        self.grid = grid
        self.x, self.y = start
        self.heading = 0
        self.bumps = 0
        self.visited = {start}

    def inside(self, x, y):
        return 0 <= y < len(self.grid) and 0 <= x < len(self.grid[y])

    def forward(self):
        dx, dy = HEADINGS[self.heading]
        nx, ny = self.x + dx, self.y + dy
        if not self.inside(nx, ny) or self.grid[ny][nx] == "#":
            self.bumps += 1
            return
        self.x, self.y = nx, ny
        self.visited.add((nx, ny))

    def turn(self, step):
        self.heading = (self.heading + step) % 4

    def run(self, commands):
        for c in commands:
            if c == "F":
                self.forward()
            elif c == "L":
                self.turn(-1)
            elif c == "R":
                self.turn(1)


def find_start(grid):
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch == "R":
                return x, y
    raise SystemExit("no start cell")


def render(grid, robot):
    rows = []
    for y, row in enumerate(grid):
        chars = []
        for x, ch in enumerate(row):
            if (x, y) == (robot.x, robot.y):
                chars.append("@")
            elif (x, y) in robot.visited and ch != "#":
                chars.append("o")
            else:
                chars.append(ch)
        rows.append("".join(chars))
    return rows


def load(lines):
    width, height = map(int, lines[0].split())
    grid = [lines[1 + i].ljust(width, ".")[:width] for i in range(height)]
    commands = lines[1 + height].strip() if len(lines) > 1 + height else ""
    return grid, commands


def main():
    grid, commands = load(sys.stdin.read().splitlines())
    robot = Robot(grid, find_start(grid))
    robot.run(commands)
    if VARIANT:
        print("visited", len(robot.visited))
        return
    print("%d %d %s bumps %d" % (robot.x, robot.y, NAMES[robot.heading], robot.bumps))
    for row in render(grid, robot):
        print(row)


if __name__ == "__main__":
    main()
