"""Inventory ledger. Commands, one per line:
  add ITEM QTY PRICE   adds stock and sets the unit price (PRICE is whole cents)
  remove ITEM QTY      removes stock; rejected when the item is unknown or short
  price ITEM PRICE     changes the unit price of a known item
  report               appends the full report at this point in the log
Anything else is rejected. Output: the log, then the final report sorted by name.
"""
import sys
from dataclasses import dataclass


@dataclass
class Item:
    qty: int = 0
    price: int = 0


class Ledger:
    def __init__(self):
        self.items = {}
        self.log = []
        self.rejected = 0

    def reject(self, why):
        self.rejected += 1
        self.log.append("rejected: " + why)

    def add(self, name, qty, price):
        item = self.items.setdefault(name, Item())
        item.qty += qty
        item.price = price

    def remove(self, name, qty):
        item = self.items.get(name)
        if item is None:
            self.reject("unknown item " + name)
        elif item.qty < qty:
            self.reject("only %d of %s" % (item.qty, name))
        else:
            item.qty -= qty
            if item.qty == 0:
                del self.items[name]

    def set_price(self, name, price):
        if name not in self.items:
            self.reject("unknown item " + name)
        else:
            self.items[name].price = price

    def value(self, name):
        item = self.items[name]
        return item.qty * item.price

    def total(self):
        return sum(self.value(name) for name in self.items)

    def report_lines(self):
        rows = []
        for name in sorted(self.items):
            item = self.items[name]
            rows.append("%-6s qty %3d price %4d value %6d" % (name, item.qty, item.price, self.value(name)))
        rows.append("total %d" % self.total())
        return rows

    def apply(self, line):
        parts = line.split()
        if not parts:
            return
        cmd, args = parts[0], parts[1:]
        try:
            if cmd == "add":
                self.add(args[0], int(args[1]), int(args[2]))
            elif cmd == "remove":
                self.remove(args[0], int(args[1]))
            elif cmd == "price":
                self.set_price(args[0], int(args[1]))
            elif cmd == "report":
                self.log.extend(self.report_lines())
            else:
                self.reject("unknown command " + cmd)
        except (IndexError, ValueError):
            self.reject("malformed: " + line.strip())


def main():
    ledger = Ledger()
    for line in sys.stdin.read().splitlines():
        ledger.apply(line)
    for entry in ledger.log:
        print(entry)
    for row in ledger.report_lines():
        print(row)


if __name__ == "__main__":
    main()
