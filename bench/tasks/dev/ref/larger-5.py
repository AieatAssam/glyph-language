"""Bank ledger with overdraft protection and statements. Commands, one per line:
  open NAME                 creates an account with balance zero
  deposit NAME AMOUNT       adds money
  withdraw NAME AMOUNT      takes money out; rejected if it would go below zero
  transfer FROM TO AMOUNT   moves money between two accounts, all or nothing
  statement NAME            prints every entry for the account with the running balance
Amounts are whole units. Rejected commands are collected and reported at the end.
Output: statements in order, then the rejections.
"""
import sys
from dataclasses import dataclass, field


class BankError(Exception):
    pass


@dataclass
class Account:
    balance: int = 0
    history: list = field(default_factory=list)


class Bank:
    def __init__(self):
        self.accounts = {}
        self.output = []
        self.rejected = []

    def account(self, name):
        if name not in self.accounts:
            raise BankError("no account " + name)
        return self.accounts[name]

    def open(self, name):
        if name in self.accounts:
            raise BankError("exists " + name)
        self.accounts[name] = Account()

    def post(self, name, label, amount):
        acct = self.account(name)
        if acct.balance + amount < 0:
            raise BankError("insufficient funds in %s for %s" % (name, label))
        acct.balance += amount
        acct.history.append((label, amount))

    def deposit(self, name, amount):
        if amount <= 0:
            raise BankError("bad amount")
        self.post(name, "deposit", amount)

    def withdraw(self, name, amount):
        if amount <= 0:
            raise BankError("bad amount")
        self.post(name, "withdraw", -amount)

    def transfer(self, src, dst, amount):
        if amount <= 0:
            raise BankError("bad amount")
        if src == dst:
            raise BankError("same account")
        self.account(dst)
        self.post(src, "to " + dst, -amount)
        self.post(dst, "from " + src, amount)

    def statement(self, name):
        acct = self.account(name)
        running = 0
        for label, amount in acct.history:
            running += amount
            self.output.append("%s %s %+d %d" % (name, label, amount, running))
        self.output.append("%s balance %d" % (name, acct.balance))

    def total(self):
        return sum(acct.balance for acct in self.accounts.values())

    def apply(self, line):
        parts = line.split()
        if not parts:
            return
        cmd, args = parts[0], parts[1:]
        try:
            if cmd == "open":
                self.open(args[0])
            elif cmd == "deposit":
                self.deposit(args[0], int(args[1]))
            elif cmd == "withdraw":
                self.withdraw(args[0], int(args[1]))
            elif cmd == "transfer":
                self.transfer(args[0], args[1], int(args[2]))
            elif cmd == "statement":
                self.statement(args[0])
            else:
                raise BankError("unknown command " + cmd)
        except (BankError, IndexError, ValueError) as exc:
            self.rejected.append(str(exc))


def main():
    bank = Bank()
    for line in sys.stdin.read().splitlines():
        bank.apply(line)
    for line in bank.output:
        print(line)
    for why in bank.rejected:
        print("rejected: " + why)


if __name__ == "__main__":
    main()
