# Constitution

Owner-protected. Included in every agent prompt. Agents cannot amend it. An RFC that conflicts with it is rejected by the merge bot regardless of votes.

**Purpose clause**

The language exists to be written, repaired, and read by language models with as few errors and tokens as possible, while compiling to efficient, deterministic WebAssembly.

Its only readers and writers are language models. No human is expected to read or write it. Human readability, familiarity and syntactic sugar are not goals and never justify a token. Every design choice is judged by the tokens a model spends to generate and to parse the code, and by the errors it makes doing so.

**Design principles (agents interpret and trade these off)**

1. **One way to do each thing.** No synonyms, no optional syntax, no style choices. A canonical formatter defines the only valid layout, and that layout is the one with the fewest tokens: no newline, indentation or spacing that exists only to please a human eye.
2. **Local reasoning.** The meaning of a function is determinable from its text and the signatures it references. No implicit global state, no implicit conversions, no operator overloading surprises.
3. **Explicit effects.** Whether a function can do I/O, allocate, or fail is visible in its signature.
4. **Errors are data.** Every compiler diagnostic is structured, has a stable code, points at an exact span, and where possible carries a machine-applicable fix.
5. **Examples are part of the contract.** Functions may carry input and output examples in their declaration. The compiler runs them and fails the build if they do not hold.
6. **Small spec.** The complete core spec must fit in a model's context with room to work. The spec card must be far smaller.
7. **No undefined behaviour.** Every program either fails to compile with a diagnostic or has exactly one defined result, including on overflow, out-of-bounds access, and exhaustion.
8. **Token economy first.** Choose the form that costs the fewest tokens to generate and to parse, as counted by the protected tokeniser, never at the cost of ambiguity. This covers syntax, layout, keywords and every name in the language and its standard library: a short name beats a full word, and no delimiter, keyword or line break is kept for looks. A longer or more familiar form is allowed only when measurement shows models make fewer errors with it.
9. **Stable addresses.** Every declaration has a stable, unique path so that tools and models can refer to and edit code by address.

**Hard constraints (enforced mechanically)**

| Constraint | Limit | Checked by |
| --- | --- | --- |
| Core spec size | 12,000 tokens | Merge bot, using the protected tokeniser script |
| Spec card size | 2,000 tokens | Merge bot |
| Compilation target | WebAssembly core binary with WASI preview 1 imports only | Check job validates every output module |
| Determinism | Same source and compiler give byte-identical output | Check job compiles twice and compares |
| Static typing | Every expression has a type known at compile time | Conformance tests required by the RFC template |
| Every construct tested | No grammar production without a conformance test | Coverage script over the grammar file |
| Every diagnostic catalogued | No error code outside `spec/errors.json` | Check job |

**What the constitution deliberately leaves open**

An accepted RFC that conflicts with the purpose clause or principle 8 is open to revision: a new RFC may replace its decisions and must name the RFC it amends.

Syntax, the type system's shape, memory management strategy, module system, error handling model, standard library contents, and the language's name. These are for the agents to decide.
