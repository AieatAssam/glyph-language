"""Text adventure state machine. The world is fixed. Each input line is one command:
  go DIR | take ITEM | drop ITEM | look | inv
Each command prints a response. Impossible or unknown commands count as failed.
Non-variant output: every response, then a summary line. Variant output: failures and final room.
"""
import os
import sys

VARIANT = os.environ.get("BENCH_VARIANT") == "1"

WORLD = {
    "hall": {"exits": {"north": "library", "east": "kitchen"}, "items": ["lamp"]},
    "library": {"exits": {"south": "hall"}, "items": ["book", "key"]},
    "kitchen": {"exits": {"west": "hall", "down": "cellar"}, "items": ["bread"]},
    "cellar": {"exits": {"up": "kitchen", "east": "vault"}, "items": ["wine"]},
    "vault": {"exits": {"west": "cellar"}, "items": ["gold"]},
}
LOCKED = {("cellar", "east"): "key"}


class Game:
    def __init__(self):
        self.room = "hall"
        self.items = {name: list(info["items"]) for name, info in WORLD.items()}
        self.inventory = []
        self.failed = 0
        self.moves = 0
        self.responses = []

    def say(self, text):
        self.responses.append(text)

    def fail(self, text):
        self.failed += 1
        self.say(text)

    def go(self, direction):
        exits = WORLD[self.room]["exits"]
        if direction not in exits:
            self.fail("no way " + direction)
            return
        needed = LOCKED.get((self.room, direction))
        if needed and needed not in self.inventory:
            self.fail("the way %s is locked" % direction)
            return
        self.room = exits[direction]
        self.moves += 1
        self.say("you enter the " + self.room)

    def take(self, name):
        here = self.items[self.room]
        if name in here:
            here.remove(name)
            self.inventory.append(name)
            self.say("taken " + name)
        else:
            self.fail("no " + name + " here")

    def drop(self, name):
        if name in self.inventory:
            self.inventory.remove(name)
            self.items[self.room].append(name)
            self.say("dropped " + name)
        else:
            self.fail("you have no " + name)

    def look(self):
        exits = ", ".join(sorted(WORLD[self.room]["exits"]))
        things = ", ".join(self.items[self.room]) or "nothing"
        self.say("%s: exits %s; you see %s" % (self.room, exits, things))

    def inv(self):
        self.say("carrying " + (", ".join(self.inventory) or "nothing"))

    def play(self, line):
        parts = line.split()
        if not parts:
            return
        cmd = parts[0]
        arg = parts[1] if len(parts) > 1 else ""
        if cmd == "go":
            self.go(arg)
        elif cmd == "take":
            self.take(arg)
        elif cmd == "drop":
            self.drop(arg)
        elif cmd == "look":
            self.look()
        elif cmd == "inv":
            self.inv()
        else:
            self.fail("unknown command " + cmd)


def main():
    game = Game()
    for line in sys.stdin.read().splitlines():
        game.play(line)
    if VARIANT:
        print("failed", game.failed)
        print("room", game.room)
        return
    for text in game.responses:
        print(text)
    print("final %s moves %d failed %d" % (game.room, game.moves, game.failed))


if __name__ == "__main__":
    main()
