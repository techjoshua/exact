# Byte-counter and static-root experiments, September 9, 2026

Status: neither prototype adopted. The retained build remains document-tail plus scalar-root and
earlier improvements. No production source, API, ABI, or public benchmark chart changed here.

## Root byte-count audit and experiment

The prior profile attributed substantial Bun self-samples to native byteLength through the root
sink's charge/append. Inspection of render/tree-output.ts confirms that this is the exact root
UTF-8 check after rendering with a conservative UTF-16 character bound. It is not a second count
of already-accounted descendant bytes. A conservative bound can sometimes prove the output is
within the limit without an exact count; the earlier root-bound shortcut already tested that
alternative and was not retained. The current counter is retained on performance evidence.

Hypothesis: the existing portable counter might outperform the host counter on mostly ASCII
documents by using native regex searches to skip ASCII spans, yielding at most a few percent overall.
The bundle-only experiment changes only utf8ByteLength dispatch to the existing portable function.
It does not change encoding, counters, limits, surrogate handling, or the algorithms themselves.

Thirty-two fresh production processes cover Node/Bun, string/stream, the 96-incident large case,
and the existing Unicode case (3 incidents with repeated accented, astral, and Japanese title text).
Each uses 5,000 warmups and 12,000 measured renders, with two reversed-order pairs per combination.

Median microseconds per complete render, lower is better. Positive paired change means slower.
Paired change is the median of each round's percentage change, not a ratio of independent medians.

| Runtime | Mode   | Scenario | Control us | Candidate us | Paired change |
| ------- | ------ | -------- | ---------: | -----------: | ------------: |
| bun     | stream | large    |     286.84 |       344.22 |        +20.2% |
| bun     | stream | unicode  |      81.35 |        93.97 |        +15.7% |
| bun     | string | large    |     251.66 |       280.66 |        +11.5% |
| bun     | string | unicode  |      47.27 |        61.67 |        +30.5% |
| node    | stream | large    |     193.46 |       213.41 |        +10.3% |
| node    | stream | unicode  |      89.88 |       112.18 |        +24.9% |
| node    | string | large    |     167.06 |       182.44 |         +9.3% |
| node    | string | unicode  |      50.73 |        71.65 |        +41.3% |

Native counting wins throughout these cases, including every paired Unicode result. Portable
counting is retained as the host-capability fallback, not selected as a performance optimization.
The result rejects this hypothesis without weakening validation or adding runtime-specific dispatch.

## Static-root allocation experiment

Hypothesis: sharing immutable static attribute objects could reduce small-document rendering time
by roughly 1-3%. An AST pass hoists 21 call-site root objects whose properties are all literal
primitives or absent, freezes them once, and reuses them in prepared program invocations. It skips
spreads, computed keys, prototype keys, and nonliteral initializers. Dynamic roots are unchanged.
Twenty-one is the number of eligible source sites, not the number exercised on each request.

The control is the same retained bundle passed through the same TypeScript printer. Twenty-four
fresh processes cover Node/Bun and string/stream on the small 3-incident case, with 5,000 warmups,
20,000 measured renders, and three alternating-order pairs per combination.

| Runtime | Mode   | Scenario | Control us | Candidate us | Paired change |
| ------- | ------ | -------- | ---------: | -----------: | ------------: |
| bun     | stream | small    |      43.11 |        43.02 |         -1.0% |
| bun     | string | small    |      30.67 |        30.13 |         -1.6% |
| node    | stream | small    |      41.29 |        40.93 |         -0.1% |
| node    | string | small    |      27.22 |        27.34 |         +0.4% |

Results are mixed. Bun strings show a small gain in two of three pairs, while Node strings regress
in two of three pairs. Stream results also vary. These short shared-PC runs do not establish a
consistent benefit, so the experiment does not justify a compiler change at this point. This is not
evidence that immutable hoisting can never help; it lowers its priority relative to the measured
hydration projection and allocation costs. No minimum percentage cutoff was used for acceptance.

## Scope and evidence

All 56 timing populations validate full-document framing and final complete-response SHA-256
against their eXact control. Streams are fully consumed through Response.text, asset tags are empty,
and both runtimes use the same portable renderer artifact. These are renderer experiments, not
HTTP or browser timing. React was not rerun. No production tests were rerun for discarded bundle
experiments; existing UTF-8 tests already compare native and portable counters with platform
encoding across all UTF-16 code units and mixed surrogate boundaries.

The JSON and accompanying ZIP retain raw populations, artifact hashes, prototypes and controls,
builders, runners, fixed input, and the production sources inspected. Child processes exited and
no benchmark server was started. Next work should investigate hydration projection allocation and
repeated shape/field work rather than remove exact byte accounting or retry this counter dispatch.
