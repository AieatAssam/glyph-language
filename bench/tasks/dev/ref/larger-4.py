"""Mini spreadsheet. Each input line is CELL = EXPR. EXPR is built from integers, cell names
(such as B12), binary + - * and parentheses. Cells are evaluated on demand and memoised.
A reference to an undefined cell gives #REF. A reference loop gives #CYCLE. Malformed formulas give #ERR.
Output lists every cell as CELL VALUE, sorted by row then column.
"""
import re
import sys
TOKEN = re.compile(r"\s*(?:(\d+)|([A-Z]+\d+)|([-+*()]))")


class RefError(Exception):
    pass


class CycleError(Exception):
    pass


class FormulaError(Exception):
    pass


def tokenize(text):
    tokens, pos = [], 0
    text = text.rstrip()
    while pos < len(text):
        m = TOKEN.match(text, pos)
        if not m:
            raise FormulaError("bad character at %d" % pos)
        if m.group(1):
            tokens.append(("num", int(m.group(1))))
        elif m.group(2):
            tokens.append(("ref", m.group(2)))
        else:
            tokens.append(("op", m.group(3)))
        pos = m.end()
    return tokens


class Parser:
    def __init__(self, tokens, resolve):
        self.tokens = tokens
        self.pos = 0
        self.resolve = resolve

    def peek(self):
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return (None, None)

    def take(self):
        tok = self.peek()
        self.pos += 1
        return tok

    def expr(self):
        value = self.term()
        while self.peek() in (("op", "+"), ("op", "-")):
            _, op = self.take()
            rhs = self.term()
            value = value + rhs if op == "+" else value - rhs
        return value

    def term(self):
        value = self.atom()
        while self.peek() == ("op", "*"):
            self.take()
            value = value * self.atom()
        return value

    def atom(self):
        kind, val = self.take()
        if kind == "num":
            return val
        if kind == "ref":
            return self.resolve(val)
        if (kind, val) == ("op", "("):
            value = self.expr()
            if self.take() != ("op", ")"):
                raise FormulaError("missing )")
            return value
        raise FormulaError("unexpected token")


class Sheet:
    def __init__(self, formulas):
        self.formulas = formulas
        self.values = {}
        self.active = set()

    def value(self, cell):
        if cell in self.values:
            return self.values[cell]
        if cell in self.active:
            raise CycleError(cell)
        if cell not in self.formulas:
            raise RefError(cell)
        self.active.add(cell)
        try:
            tokens = tokenize(self.formulas[cell])
            parser = Parser(tokens, self.value)
            result = parser.expr()
            if parser.pos != len(tokens):
                raise FormulaError("trailing tokens")
        finally:
            self.active.discard(cell)
        self.values[cell] = result
        return result

    def display(self, cell):
        try:
            return str(self.value(cell))
        except CycleError:
            return "#CYCLE"
        except RefError:
            return "#REF"
        except FormulaError:
            return "#ERR"


def parse_sheet(lines):
    formulas = {}
    for line in lines:
        if "=" not in line:
            continue
        name, expr = line.split("=", 1)
        formulas[name.strip()] = expr.strip()
    return formulas


def sort_key(cell):
    m = re.fullmatch(r"([A-Z]+)(\d+)", cell)
    return (int(m.group(2)), len(m.group(1)), m.group(1))


def main():
    formulas = parse_sheet(sys.stdin.read().splitlines())
    sheet = Sheet(formulas)
    rows = [(cell, sheet.display(cell)) for cell in sorted(formulas, key=sort_key)]
    for cell, shown in rows:
        print(cell, shown)


if __name__ == "__main__":
    main()
