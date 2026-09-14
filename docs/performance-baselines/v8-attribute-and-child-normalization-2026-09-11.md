# V8 attribute and child-normalization follow-up, September 11, 2026

Retained: child normalization now appends recursively into one output array. Two attribute-inlining
candidates remain unadopted. This follows the [initial bytecode investigation](v8-bytecode-2026-09-11.md).
The shared renderer, sinks, adapters, React implementation, package versions, and ABI epoch are unchanged.
Measurements use production Node 26.8.1 (V8 14.6.202.34-node.28) and Bun 1.4.2.

## Attribute experiments

Instrumentation of the complete authored application finds 13 compiled dynamic attribute calls in the
small fixture and 199 in the large fixture. Compiler-proven safe class strings account for 7 and 193
respectively. Each fixture also has three ordinary string attributes, two URLs, and one boolean.
String and stream counts match. These counts justify investigating the existing common branch rather
than indiscriminately splitting every large function that V8 declines to inline.

The class-only candidate retains the safe-class branch in `renderCompiledNativeAttribute` and moves
general handling to a private helper. Bytecode shrinks from 650 to 143 bytes, and the trace confirms
inlining into `rootOpening`. However, Node small-string rendering slows in both reversed orders:
20.82 to 21.51 and 20.54 to 21.10 microseconds. Other results are mixed. It is rejected.

The refined candidate also retains ordinary string attributes in the entry. It is 227 bytes and
also inlines into `rootOpening`. Its string results are promising, but Node small streaming is slower
in both orders. This runtime/mode tradeoff does not justify retaining the additional dispatch boundary.
Neither candidate changes escaping, URL sanitization, class normalization, unsafe-HTML consent, dates,
boolean/null handling, or accounting. Each passes 816 differential input/context cases on Node and Bun.

All attribute timing processes use production mode, 50,000 warmups, and two reversed populations.
Small fixtures measure 25,000 renders; large fixtures measure 5,000. Means below are microseconds per
complete document, lower is better. Strings are consumed by UTF-8 byte counting; streams by Response.text
and byte counting. They are not HTTP RPS. Complete eXact output hashes match.

| Runtime | Fixture | Mode   | baseline | attributeStrings |
| ------- | ------- | ------ | -------: | ---------------: |
| node    | small   | string |    21.54 |            21.18 |
| node    | large   | string |   128.74 |           126.17 |
| bun     | small   | string |    26.73 |            26.48 |
| bun     | large   | string |   215.29 |           209.53 |

| Runtime | Fixture | Mode   | baseline | attributeStrings |
| ------- | ------- | ------ | -------: | ---------------: |
| node    | small   | stream |    38.19 |            39.32 |
| node    | large   | stream |   245.28 |           251.60 |
| bun     | small   | stream |    54.45 |            54.17 |
| bun     | large   | stream |   316.30 |           305.59 |

The large Node stream candidate changes direction between orders. Bun small stream populations are
also variable. Raw populations are retained; favorable means are not treated as universal gains.
Earlier combined hydration-escaping scans were reviewed and not repeated without new evidence.

## Retained child normalization

The previous `normalizeChildren` allocated a fresh array for every nested child array, recursively
filled it, and spread its contents into the parent's result. The retained implementation allocates
one result at the entry and passes it through a private recursive append helper. It preserves
depth-first iteration, sparse-array holes becoming undefined, all child values, object identity,
and input ownership. `normalizeRenderResult` still returns an already flat array unchanged.

The hypothesis is a substantial improvement for nested arrays from removing temporary arrays,
repeated copying, and variadic calls, with approximately neutral flat-array cost. The nested fixture
has 512 leaves in 129 array containers. Previously each normalization created 129 result arrays;
now it creates one. This is a structural count, not a claim about all backing-store allocations.
The deep fixture has 32 wrappers around a flat 32-item array. Flat has 32 items.

Each fresh process warms 20,000 calls and measures 100,000, retaining the last 32 results and consuming
their lengths. Three populations reverse variant order in the middle population. Values below are
microseconds per normalization call, not component renders or HTTP requests.

| Runtime | Fixture | Mode      | baseline | children |
| ------- | ------- | --------- | -------: | -------: |
| node    | flat    | normalize |    0.095 |    0.093 |
| node    | nested  | normalize |    6.350 |    2.470 |
| node    | deep    | normalize |    2.404 |    0.201 |
| bun     | flat    | normalize |    0.123 |    0.125 |
| bun     | nested  | normalize |   15.463 |    2.947 |
| bun     | deep    | normalize |   10.008 |    0.292 |

Flat performance is within observed run variability. Nested normalization is approximately 61% faster
on Node and 81% faster on Bun. The deep fixture particularly benefits from avoiding repeated copying;
its improvement must not be projected onto ordinary shallow applications.

A separate Node GC diagnostic brackets 100,000 nested calls with full collections and phase markers.
Summing reported allocation fields gives approximately 4.34 GB before and 1.16 GB after, about 73%
less allocation. Young-generation collection counts fall from 164 to 91. These are diagnostic totals,
including minor harness overhead, not retained heap size or request allocations. Forced boundary
collections are not counted as young-generation collections. Instrumented elapsed times are not
acceptance timings. V8 bytecode dumps and raw GC output are preserved.

The new regression test also normalizes a 200,000-item nested list, avoiding the previous spread-call
argument ceiling. Recursion depth is not redesigned; this change does not promise unlimited nesting
or cyclic child graphs. No new public API, compiler helper signature, or serialized contract is added.

## Rebuilt full-document check

Core TypeScript output, target-specific core artifacts, and all three comparison application outputs
(client, Node server, Bun server) were rebuilt. Both server bundles differ from their frozen controls
only in child normalization. The rejected attribute candidates are absent.

This small full-document fixture provides little nested-array work, so the large normalization gain
does not imply a large SSR gain. Fresh Node/Bun string/stream comparisons use unchanged React controls,
50,000 warmups and 25,000 measured renders, in two reversed orders. All eXact document hashes match.
Values are render/consumer microseconds, not HTTP rates or browser performance.

| Runtime | Fixture | Mode   | baseline | childrenCurrent | react |
| ------- | ------- | ------ | -------: | --------------: | ----: |
| node    | small   | string |    21.61 |           21.06 | 23.44 |
| node    | small   | stream |    38.77 |           38.64 | 57.08 |
| bun     | small   | string |    26.82 |           26.45 | 36.85 |
| bun     | small   | stream |    52.10 |           59.64 | 53.22 |

The first Bun stream current run was 66.00 microseconds and the second was 53.29, against controls
52.16/52.03. That outlier is preserved. A three-population follow-up includes a byte-identical second
baseline under a separate module path:

| Runtime | Fixture | Mode   | baseline | identical | childrenCurrent |
| ------- | ------- | ------ | -------: | --------: | --------------: |
| bun     | small   | stream |    51.25 |     52.46 |           52.54 |

The two identical controls differ nearly as much as the candidate does, weakening causal attribution
of the small remaining gap. A further check copies each selected artifact into one fixed module path
before starting its fresh process. All six permutations balance order and position:

| Runtime | Fixture | Mode   | baseline | identical | childrenCurrent |
| ------- | ------- | ------ | -------: | --------: | --------------: |
| bun     | small   | stream |    53.91 |     52.48 |           52.27 |

An untouched baseline also produces a 62.06-microsecond outlier in the fixed-path check. Across these
balanced populations the retained build is close to the identical control; a reproducible slowdown
is not established. No slow population is dropped to obtain that conclusion.

All populations remain in the evidence. Workstation load varies, and no build, browser test, profile,
or compression task overlaps timed processes. These checks do not replace the public HTTP benchmark
baseline or establish an HTTP throughput improvement.

## Validation and scope

- 263 core tests and 418 SSR tests pass, including four new normalization regressions.
- Test type checking, focused ESLint/formatting, source architecture, and JSDoc checks pass.
- Frozen 0.5.0 artifact behavior and ABI epoch-one release policy pass without regenerating fixtures.
- Platform-boundary and published-package content checks pass. The package-content script was run
  with npm's CLI path supplied after direct invocation hit Windows npm.cmd spawning behavior.
- 28 eXact browser checks pass across Node/Bun and string/stream modes, including initial HTML,
  hydration, navigation, and interactions. Browser timings were not benchmarked.

This is an internal allocation optimization with preserved public composition semantics. Engineering
evidence is updated here; public documentation and comparison charts are not changed to advertise
kernel measurements as application performance. No app-specific shortcut, response cache, alternate
renderer, or runtime-specific implementation is introduced.

The subsequent [full benchmark checkpoint](v8-normalization-full-2026-09-11.md) refreshes
HTTP string/stream capacity, browser, startup, heap, and framework measurements for the retained build.
It updates the public charts with application measurements independently of the focused results above.

## Evidence

The adjacent archive contains frozen variants, rebuilt server bundles, fixtures, runners, bytecode
and inlining traces, GC captures, all timing populations, browser logs, and source/test snapshots.
Runners assume the repository-root working directory and installed workspace dependencies. The original
investigation's archive remains unchanged.

Archive SHA-256: `1731332d85053af517a621216d97b0786aa2bad56727d879833075f1891923d8`.
