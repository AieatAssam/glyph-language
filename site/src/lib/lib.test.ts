import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDiff, sideBySide } from "./diff.ts";
import { b64urlEncode, b64urlDecode } from "./b64.ts";
import { md, esc, safeHref } from "./dom.ts";
import { countInstructions } from "./wasm.ts";

test("lineDiff marks removals and additions", () => {
  const ops = lineDiff(["a", "b", "c"], ["a", "x", "c", "d"]);
  assert.deepEqual(ops.map((o) => o.t + o.s), [" a", "-b", "+x", " c", "+d"]);
  assert.equal(sideBySide(ops).filter((r) => r.kind === "change").length, 2);
});

test("base64url round-trips non-ASCII and has no padding or +/", () => {
  const s = "fn main() { print(\"héllo ✓ >>> ??? \") }\n";
  const e = b64urlEncode(s);
  assert.match(e, /^[A-Za-z0-9_-]+$/);
  assert.equal(b64urlDecode(e), s);
});

test("markdown escapes raw HTML and rejects javascript: links", () => {
  assert.equal(esc("<b>&"), "&lt;b&gt;&amp;");
  assert.ok(!md("<script>alert(1)</script>").includes("<script>"));
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.match(md("[x](javascript:alert(1))"), /href="#"/);
  assert.match(md("[x](https://example.com/a)"), /href="https:\/\/example.com\/a"/);
});

test("countInstructions counts a minimal module (i32.const 1; end)", () => {
  const bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, // type: () -> i32
    0x03, 0x02, 0x01, 0x00, // function section
    0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x01, 0x0b, // code: i32.const 1, end
  ]);
  assert.equal(countInstructions(bytes), 2);
});
