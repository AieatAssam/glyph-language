---
amends: RFC 0020 E4 (operand types of the ordering operators); RFC 0035 TX7 (ordering
  on Text, deferred)
builds-on: RFC 0014 (lexical-syntax-v3), RFC 0020 (kernel-v8), RFC 0035 (text-query,
  accepted)
class: language
slug: text-order
status: accepted
supersedes: none. Settles open user issue
votes:
  designer-min: approve
  designer-safe: approve
  impl-1: approve
  tester: approve
  user-1: approve
  user-2: approve
---
# RFC draft: Ordering on Text with `<`

## Summary

Allow `<` to take two `Text` operands and compare them byte by byte, as unsigned bytes, with a proper prefix counting as less than the longer text. The result is `Bool`. No other ordering operator accepts `Text`. The rule adds no function, allocates nothing, and cannot fail, so it adds no trap kind.

## Motivation

The readiness item `text` (`docs/SPEC.md`, section 9) asks for "indexing, slicing, comparison, and building". RFC 0035 (accepted) meets indexing and equality. It deferred ordering in TX7 and listed it as open question 5, because issue #69 was unresolved. Equality alone cannot sort or search names in order, so the word "comparison" is only half met.

Issue #69 says the ordering rule for `Text` conflicts between the rejected draft RFC 0026 (TX6, which orders `Text`) and the accepted RFC 0020 (E4, where `<` takes `Int` operands only). That conflict is the reason no ordering rule has landed. This draft takes a side: `<` orders `Text`, and E4 is amended to say so. The other three ordering operators stay `Int`-only, because issue #52 about `>`, `>=` and `<=` is still open, and this draft does not touch it.

The benchmark gives no signal for this feature. Dev fitness is 0.0 and the held-out totals do not split by feature. The case is the checklist and issue #69.

## Design

### The rule

OR1. `<` accepts two operands that are both `Text`. It compares their bytes from index 0 upward. The first differing byte decides: the text whose byte is smaller is less. Bytes compare as unsigned values 0 to 255. If one text is a proper prefix of the other, the shorter text is less. Two equal texts are not less than each other.

OR2. The result is `Bool`. Operands are evaluated left to right (RFC 0020 E10). The comparison reads its two arguments and nothing else, so it cannot fail or allocate.

OR3. `Text` with any other type is E0200, as E4 already gives for `Bool` and mixed operands. For example, `"a" < 1` is E0200.

OR4. `<=`, `>` and `>=` do not accept `Text`. Each is E0200 on `Text` operands, as E4 already says for any non-`Int` operand. A program that wants "greater than" writes the operands in the other order, `b < a`.

OR5. `==` and `!=` are unchanged. RFC 0035 TX6 already gives them `Text` operands.

### Amendments

OR6. RFC 0020 E4 is replaced by: "`<`, `<=`, `>` and `>=` take two `Int` operands. `<` also takes two `Text` operands, with the order in RFC 0035 OR1 (`text-order`). Otherwise E0200."

OR7. RFC 0035 TX7 is replaced by OR1 to OR4 of this RFC.

## Alternatives

- **Order all four operators on `Text`.** Rejected for this RFC. `<=`, `>` and `>=` depend on how issue #52 is settled, and that is a separate decision. Adding them here would bind this RFC to #52.
- **Use `+` or a `text_cmp` function returning an `Int`.** Rejected. `+` is an `Int` operator (RFC 0020 E1), and a second meaning is the overloading the constitution forbids. A `text_cmp` would add a third way to write the same test and would return a sign instead of a `Bool`.
- **Compare by code point instead of by byte.** Rejected. RFC 0035 TX4 says indexes count bytes, and a code-point order would need a decoder, which belongs to the standard library.
- **Signed byte comparison.** Rejected. Byte values above 127 would sort before 0, which is not what any reader expects of UTF-8 order. Unsigned byte order makes the order of valid UTF-8 match its code-point order.

## Cost

Adds: the `Text` case of `<` (OR1 to OR3), and one sentence in E4 (OR6). Estimate: about 60 tokens of core spec. The tokeniser has not been run on this draft, because `spec/` is not in this checkout. The merge bot's count is the real one.

Removes: the words in E4 that give `<` only `Int` operands, and the open question in RFC 0035 TX7. No diagnostic code is added: OR3 and OR4 reuse E0200, which `spec/errors.json` lists as a type mismatch (issue #31 is still open about the code used for a mismatch in other drafts; the accepted RFC 0020 uses E0200 and this draft follows it). No trap is added.

Spec card: about 15 tokens. One line: "`<` compares two Text values byte by byte; `<=`, `>` and `>=` take Int only."

## Test plan

Run tests (in `conformance/text/`; each file has a `--- meta` block with `id`, `rfc` and `kind`). Test names use the prefix `ord-` so they do not collide with any existing file:

- `text/ord-lt.test` (run): `if "a" < "b" { print(1) }`, `if "ab" < "abc" { print(2) }`, `if "" < "a" { print(3) }` print `1`, `2` and `3` in that order. Each `if` is written separately, so `print` needs only `Int`.
- `text/ord-bytes.test` (run): `if "Z" < "a" { print(4) }` prints `4`, because `0x5A` is less than `0x61`. `if "z" < "é" { print(5) }` prints `5`, because `é` is the bytes `0xC3 0xA9`, which are above `z` (`0x7A`) as unsigned bytes.
- `text/ord-equal.test` (run): `if "a" < "a" { print(6) }` prints nothing.

Compile-error tests:

- `text/ord-mixed.test` (E0200): `if "a" < 1 { print(1) }`. This checks OR3.
- `text/ord-le.test` (E0200): `if "a" <= "b" { print(1) }`. This checks OR4.

Coverage: OR1 and OR2 are covered by `ord-lt`, `ord-bytes` and `ord-equal`. OR3 is covered by `ord-mixed`. OR4 is covered by `ord-le`. OR6 is covered by the grammar coverage script, because the operator production is unchanged.

## Open questions

1. Roadmap, M2b. `ROADMAP.md` says no new RFC is proposed before the first compiler merges onto `main`. This draft was requested by the assignment, so it is written here. If the orchestrator keeps the roadmap, withdraw it and hold it until then. RFC 0035 raised the same point.
2. Issue #52. If the team decides `<=`, `>` and `>=` should accept `Text`, a follow-on RFC adds them, and OR4 is removed.
3. Issue #31. The code for a mixed-type comparison is E0200 here, because the accepted RFC 0020 uses it. If #31 settles on another code, OR3 and OR4 change with it.
4. The checklist word "building" is not met by this RFC. It needs the memory decision (RFC 0025 and the designer's memory rules) and a later RFC.
