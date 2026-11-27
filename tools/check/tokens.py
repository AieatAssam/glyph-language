"""Deterministic offline token counter (CONSTITUTION principle 8, SPEC section 6 rule 9).

Counts tokens with a real byte-pair-encoding vocabulary, so the figure tracks what a model pays.
The earlier counter charged ceil(letters/4) per word and nothing for whitespace. Under it `wh`
looked cheaper than `while` (both are one token) and spaces and line breaks looked free (they are
not), and design decisions followed those errors.

Vocabulary: `bpe_ranks.hex.xz`, the public `o200k_base` merge table (MIT, from tiktoken), one token
per line in rank order as hex bytes. It stands in for the benchmark model's own tokeniser, which
has no offline form. The measured output tokens of the nightly benchmark are the final judge;
this counter is what agents and the gate can run with no network.

Text is cut into pieces by the vocabulary's split rule and each piece is merged lowest rank first.
The count is the number of tokens left, times RULES caps.tokeniser_scale, rounded up.

CLI:
  python -m tools.check.tokens FILE [FILE...]     one line per file: COUNT PATH (`-` reads stdin)
  python -m tools.check.tokens --text 'fn f(){}'  count of the given text
  python -m tools.check.tokens --repo DIR         core spec and card totals
"""
from __future__ import annotations

import argparse
import lzma
import math
import re
import unicodedata
from fractions import Fraction
from pathlib import Path

_RANKS_FILE = Path(__file__).with_name("bpe_ranks.hex.xz")
_ranks = None
_cache = {}

# The o200k split rule, written over a class string (one class letter per source character) because
# the stdlib `re` has no \p{..}. Classes: A upper or title letter, a lower letter, o other letter,
# m mark, 0 number, n CR or LF, ' ' space, s other whitespace, p anything else.
_SPLIT = re.compile(
    r"[^nAao0]?[Aom]*[aom]+"      # optional lead, letters ending in lower case
    r"|[^nAao0]?[Aom]+[aom]*"     # optional lead, letters starting in upper case
    r"|0{1,3}"                    # up to three digits
    r"| ?[^ snAao0]+[n/]*"        # punctuation run
    r"|[ sn]*n+"                  # whitespace ending in line ends
    r"|[ sn]+(?![^ sn])"          # trailing whitespace
    r"|[ sn]+"                    # whitespace before a token: its last character joins that token
)
_CONTRACTIONS = ("'s", "'t", "'re", "'ve", "'m", "'ll", "'d")
_LETTER_END = re.compile(r"[Aaom]$")


def _cls(ch):
    if ch == " ":
        return " "
    if ch in "\r\n":
        return "n"
    if ch == "/":
        return "/"
    if "a" <= ch <= "z":
        return "a"
    if "A" <= ch <= "Z":
        return "A"
    if "0" <= ch <= "9":
        return "0"
    if ch < "\x80":
        return "s" if ch in "\t\x0b\x0c\x1c\x1d\x1e\x1f" else "p"
    cat = unicodedata.category(ch)
    if cat in ("Lu", "Lt"):
        return "A"
    if cat == "Ll":
        return "a"
    if cat in ("Lm", "Lo"):
        return "o"
    if cat[0] == "M":
        return "m"
    if cat[0] == "N":
        return "0"
    return "s" if ch.isspace() else "p"


def _load():
    global _ranks
    if _ranks is None:
        with lzma.open(_RANKS_FILE, "rt", encoding="ascii") as f:
            _ranks = {bytes.fromhex(line.strip()): i for i, line in enumerate(f)}
    return _ranks


def _merge(piece: bytes) -> int:
    """Number of tokens a piece becomes: repeatedly join the adjacent pair of lowest rank."""
    ranks = _load()
    if piece in ranks:
        return 1
    parts = [piece[i:i + 1] for i in range(len(piece))]
    while len(parts) > 1:
        best, at = None, -1
        for i in range(len(parts) - 1):
            r = ranks.get(parts[i] + parts[i + 1])
            if r is not None and (best is None or r < best):
                best, at = r, i
        if best is None:
            break
        parts[at:at + 2] = [parts[at] + parts[at + 1]]
    return len(parts)


def pieces(text):
    """The text cut by the split rule. Joined, the pieces give the text back."""
    classes = "".join(_cls(c) for c in text)
    out, pos = [], 0
    for m in _SPLIT.finditer(classes):
        if m.start() < pos:  # already taken by a contraction
            continue
        if m.start() > pos:  # nothing matches a lone character class: one piece each
            out.extend(text[pos:m.start()])
        end = m.end()
        if _LETTER_END.search(m.group(0)):
            tail = text[end:end + 3].lower()
            for c in _CONTRACTIONS:
                if tail.startswith(c):
                    end += len(c)
                    break
        out.append(text[m.start():end])
        pos = end
    out.extend(text[pos:])
    return out


def raw_count(text) -> int:
    total = 0
    for p in pieces(text):
        n = _cache.get(p)
        if n is None:
            n = _cache[p] = _merge(p.encode("utf-8"))
        total += n
    return total


def count(text, scale=1.0):
    return math.ceil(Fraction(str(scale)) * raw_count(text))


count_tokens = count


def core_text(repo):
    root = Path(repo) / "spec" / "core"
    files = sorted(root.rglob("*.md"), key=lambda p: p.relative_to(root).as_posix())
    if not files:
        raise FileNotFoundError("no spec/core/**/*.md files under %s" % repo)
    return "\n".join(f.read_text(encoding="utf-8") for f in files)


def card_text(repo):
    return (Path(repo) / "spec" / "card.md").read_text(encoding="utf-8")


def spec_counts(repo, scale=1.0):
    return {"core": count(core_text(repo), scale), "card": count(card_text(repo), scale)}


def _main(argv):
    import sys
    ap = argparse.ArgumentParser(prog="tools.check.tokens")
    ap.add_argument("files", nargs="*")
    ap.add_argument("--repo")
    ap.add_argument("--text")
    ap.add_argument("--scale", default="1.0")
    a = ap.parse_args(argv)
    if a.repo:
        print(spec_counts(a.repo, a.scale))
    if a.text is not None:
        print(count(a.text, a.scale))
    for f in a.files:
        text = sys.stdin.read() if f == "-" else Path(f).read_bytes().decode("utf-8")
        print(count(text, a.scale), f)
    if not (a.repo or a.files or a.text is not None):
        ap.error("give FILE, --text or --repo")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(_main(sys.argv[1:]))
