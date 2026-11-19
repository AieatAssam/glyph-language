"""Generic packrat PEG interpreter used to check spec/grammar.peg against conformance sources.

Grammar syntax:
  Name <- expr          rules; the first rule is the start rule
  e1 e2                 sequence
  e1 / e2               ordered choice
  e* e+ e?              repetition and option
  &e  !e                and / not predicates (no input consumed, no rule hits recorded)
  (e)                   grouping
  'lit' "lit"           literals with escapes \\n \\r \\t \\\\ \\' \\" \\[ \\] \\- \\0 \\xHH \\uHHHH
  [a-z_] [^...]         character classes with ranges and ^ negation
  .                     any single character
  # ...                 comment to end of line

There is no implicit whitespace. A parse is accepted only if the start rule consumes the whole input.

API:
  parse(grammar_text, source) -> (accepted, rules_hit, error_pos)
      rules_hit: names of rules that succeeded on the successful derivation (empty set when the
      start rule fails outright). error_pos: None when accepted, else the farthest failing offset.
  rule_names(grammar_text) -> list of rule names in definition order.
  Malformed grammars and left recursion raise PegError.

CLI: python -m tools.check.peg GRAMMAR FILE   (exit 0 accept, 1 reject, 2 grammar error)
"""
from __future__ import annotations

import functools
import re
import sys

_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_-]*")
_ESC = {"n": "\n", "r": "\r", "t": "\t", "\\": "\\", "'": "'", '"': '"',
        "[": "[", "]": "]", "-": "-", "0": "\0"}
_EMPTY = frozenset()


class PegError(ValueError):
    """Malformed grammar, or left recursion met while parsing."""


def _linecol(text, pos):
    line = text.count("\n", 0, pos) + 1
    col = pos - (text.rfind("\n", 0, pos) + 1) + 1
    return line, col


def _read_char(text, i, stop=None):
    """Read one (possibly escaped) character at i. Returns (char, next_index)."""
    n = len(text)
    if i >= n:
        raise PegError("unexpected end of grammar at %d:%d" % _linecol(text, i))
    c = text[i]
    if c == "\n" and stop is not None:
        raise PegError("newline inside literal or class at %d:%d" % _linecol(text, i))
    if c != "\\":
        return c, i + 1
    if i + 1 >= n:
        raise PegError("dangling escape at %d:%d" % _linecol(text, i))
    e = text[i + 1]
    if e in _ESC:
        return _ESC[e], i + 2
    if e in "xu":
        width = 2 if e == "x" else 4
        digits = text[i + 2:i + 2 + width]
        if len(digits) != width or not all(d in "0123456789abcdefABCDEF" for d in digits):
            raise PegError("bad \\%s escape at %d:%d" % ((e,) + _linecol(text, i)))
        return chr(int(digits, 16)), i + 2 + width
    raise PegError("unknown escape \\%s at %d:%d" % ((e,) + _linecol(text, i)))


def _tokenize(text):
    toks = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n":
            i += 1
        elif c == "#":
            while i < n and text[i] != "\n":
                i += 1
        elif c in "'\"":
            start, q = i, c
            i += 1
            buf = []
            while True:
                if i >= n or text[i] == "\n":
                    raise PegError("unterminated literal at %d:%d" % _linecol(text, start))
                if text[i] == q:
                    i += 1
                    break
                ch, i = _read_char(text, i, stop=True)
                buf.append(ch)
            toks.append(("lit", "".join(buf), start))
        elif c == "[":
            start = i
            i += 1
            neg = i < n and text[i] == "^"
            if neg:
                i += 1
            ranges = []
            while True:
                if i >= n or text[i] == "\n":
                    raise PegError("unterminated class at %d:%d" % _linecol(text, start))
                if text[i] == "]":
                    i += 1
                    break
                lo, i = _read_char(text, i, stop=True)
                hi = lo
                if i + 1 < n and text[i] == "-" and text[i + 1] != "]":
                    hi, i = _read_char(text, i + 1, stop=True)
                    if hi < lo:
                        raise PegError("reversed range at %d:%d" % _linecol(text, start))
                ranges.append((lo, hi))
            if not ranges:
                raise PegError("empty class at %d:%d" % _linecol(text, start))
            toks.append(("class", (neg, tuple(ranges)), start))
        elif text.startswith("<-", i):
            toks.append(("op", "<-", i))
            i += 2
        elif c in "/*+?&!().":
            toks.append(("op", c, i))
            i += 1
        else:
            m = _NAME.match(text, i)
            if not m:
                raise PegError("unexpected character %r at %d:%d" % ((c,) + _linecol(text, i)))
            toks.append(("name", m.group(0), i))
            i = m.end()
    return toks


class _Grammar(object):
    def __init__(self, names, rules):
        self.names = names
        self.rules = rules
        self.start = names[0]


class _GrammarParser(object):
    def __init__(self, text):
        self.text = text
        self.toks = _tokenize(text)
        self.i = 0

    def peek(self, k=0):
        j = self.i + k
        return self.toks[j] if j < len(self.toks) else None

    def is_op(self, tok, *ops):
        return tok is not None and tok[0] == "op" and tok[1] in ops

    def at_rule_start(self):
        t, t2 = self.peek(), self.peek(1)
        return t is not None and t[0] == "name" and self.is_op(t2, "<-")

    def fail(self, msg, tok=None):
        pos = tok[2] if tok is not None else len(self.text)
        raise PegError("%s at %d:%d" % ((msg,) + _linecol(self.text, pos)))

    def parse(self):
        names, rules = [], {}
        while self.peek() is not None:
            if not self.at_rule_start():
                self.fail("expected rule definition 'Name <- expr'", self.peek())
            name = self.peek()[1]
            if name in rules:
                self.fail("duplicate rule %s" % name, self.peek())
            self.i += 2
            rules[name] = self.choice()
            names.append(name)
        if not names:
            raise PegError("grammar defines no rules")
        for name in names:
            _check_refs(rules, name, rules[name], self.text)
        return _Grammar(names, rules)

    def choice(self):
        alts = [self.sequence()]
        while self.is_op(self.peek(), "/"):
            self.i += 1
            alts.append(self.sequence())
        return alts[0] if len(alts) == 1 else ("choice", tuple(alts))

    def sequence(self):
        items = []
        while True:
            t = self.peek()
            if t is None or self.at_rule_start() or self.is_op(t, "/", ")"):
                break
            items.append(self.prefix())
        if not items:
            self.fail("empty expression", self.peek())
        return items[0] if len(items) == 1 else ("seq", tuple(items))

    def prefix(self):
        t = self.peek()
        if self.is_op(t, "&", "!"):
            self.i += 1
            kind = "and" if t[1] == "&" else "not"
            return (kind, self.suffix())
        return self.suffix()

    def suffix(self):
        e = self.primary()
        t = self.peek()
        if self.is_op(t, "*", "+", "?"):
            self.i += 1
            e = {"*": "star", "+": "plus", "?": "opt"}[t[1]], e
        return e

    def primary(self):
        t = self.peek()
        if t is None:
            self.fail("unexpected end of grammar")
        self.i += 1
        if t[0] == "name":
            return ("ref", t[1])
        if t[0] == "lit":
            return ("lit", t[1])
        if t[0] == "class":
            return ("class", t[1][0], t[1][1])
        if self.is_op(t, "."):
            return ("any",)
        if self.is_op(t, "("):
            e = self.choice()
            if not self.is_op(self.peek(), ")"):
                self.fail("missing ')'", t)
            self.i += 1
            return e
        self.fail("unexpected token %r" % (t[1],), t)


def _check_refs(rules, owner, node, text):
    kind = node[0]
    if kind == "ref":
        if node[1] not in rules:
            raise PegError("undefined rule %s (used in %s)" % (node[1], owner))
    elif kind in ("seq", "choice"):
        for sub in node[1]:
            _check_refs(rules, owner, sub, text)
    elif kind in ("star", "plus", "opt", "and", "not"):
        _check_refs(rules, owner, node[1], text)


@functools.lru_cache(maxsize=16)
def compile_grammar(grammar_text):
    """Parse grammar text into a _Grammar. Raises PegError on malformed input."""
    return _GrammarParser(grammar_text).parse()


def rule_names(grammar_text):
    return list(compile_grammar(grammar_text).names)


class _Matcher(object):
    """Packrat matcher. Every match returns (end, hits) or (None, _EMPTY).

    hits are the rule names on the successful derivation only: failed alternatives and failed
    sequences contribute nothing, and predicates (& and !) contribute nothing.
    """

    def __init__(self, rules, src):
        self.rules = rules
        self.src = src
        self.n = len(src)
        self.memo = {}
        self.active = set()
        self.farthest = 0

    def _fail(self, pos):
        if pos > self.farthest:
            self.farthest = pos
        return None, _EMPTY

    def rule(self, name, pos):
        key = (name, pos)
        if key in self.memo:
            return self.memo[key]
        if key in self.active:
            raise PegError("left recursion in rule %s at offset %d" % (name, pos))
        self.active.add(key)
        end, hits = self.match(self.rules[name], pos)
        self.active.discard(key)
        res = (end, hits | frozenset([name])) if end is not None else (None, _EMPTY)
        self.memo[key] = res
        return res

    def match(self, node, pos):
        kind = node[0]
        if kind == "ref":
            return self.rule(node[1], pos)
        if kind == "lit":
            s = node[1]
            if self.src.startswith(s, pos):
                return pos + len(s), _EMPTY
            return self._fail(pos)
        if kind == "class":
            if pos >= self.n:
                return self._fail(pos)
            ch = self.src[pos]
            inside = False
            for lo, hi in node[2]:
                if lo <= ch <= hi:
                    inside = True
                    break
            if inside == node[1]:
                return self._fail(pos)
            return pos + 1, _EMPTY
        if kind == "any":
            if pos >= self.n:
                return self._fail(pos)
            return pos + 1, _EMPTY
        if kind == "seq":
            hits = set()
            p = pos
            for sub in node[1]:
                end, h = self.match(sub, p)
                if end is None:
                    return None, _EMPTY
                p = end
                hits |= h
            return p, frozenset(hits)
        if kind == "choice":
            for sub in node[1]:
                end, h = self.match(sub, pos)
                if end is not None:
                    return end, h
            return None, _EMPTY
        if kind in ("star", "plus"):
            sub = node[1]
            hits = set()
            p = pos
            count = 0
            while True:
                end, h = self.match(sub, p)
                if end is None:
                    break
                hits |= h
                count += 1
                if end == p:
                    break
                p = end
            if kind == "plus" and count == 0:
                return None, _EMPTY
            return p, frozenset(hits)
        if kind == "opt":
            end, h = self.match(node[1], pos)
            if end is None:
                return pos, _EMPTY
            return end, h
        if kind == "and":
            end, _ = self.match(node[1], pos)
            if end is None:
                return None, _EMPTY
            return pos, _EMPTY
        if kind == "not":
            end, _ = self.match(node[1], pos)
            if end is None:
                return pos, _EMPTY
            return None, _EMPTY
        raise PegError("internal: unknown node %r" % (kind,))


def parse(grammar_text, source):
    """Parse source against the grammar. Returns (accepted, rules_hit, error_pos)."""
    grammar = compile_grammar(grammar_text)
    matcher = _Matcher(grammar.rules, source)
    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old_limit, 20000))
    try:
        end, hits = matcher.rule(grammar.start, 0)
    finally:
        sys.setrecursionlimit(old_limit)
    if end is not None and end == len(source):
        return True, set(hits), None
    error_pos = max(matcher.farthest, end or 0)
    return False, set(hits), error_pos


def _main(argv):
    if len(argv) != 2:
        print("usage: python -m tools.check.peg GRAMMAR FILE", file=sys.stderr)
        return 2
    try:
        with open(argv[0], encoding="utf-8") as f:
            grammar_text = f.read()
        with open(argv[1], encoding="utf-8") as f:
            source = f.read()
        accepted, _, error_pos = parse(grammar_text, source)
    except (PegError, OSError) as e:
        print("grammar error: %s" % e, file=sys.stderr)
        return 2
    if accepted:
        print("accept")
        return 0
    line, col = _linecol(source, error_pos)
    print("reject at %d:%d" % (line, col))
    return 1


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
