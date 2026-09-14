# SSR hot-path experiments, September 8, 2026

The [fresh profiles](ssr-current-hotpaths-2026-09-08.md) led to two retained changes: native-capable
accounting for long dynamic text without HTML escaping, and reuse of complete-body byte facts when
Node prepares the final response. Positional-projector and hydration serialization experiments did
not justify changing their implementations.

## Retained implementation

`escapeSsrText` uses a native search for `&`, `<` and `>` when the input has at least 32 UTF-16 code
units. Text without those characters goes through the output sink's native-capable accounting.
Short strings and strings requiring escaping retain the existing combined escaping/counting loop.
The sink preserves exact output limits and surrogate pairing across adjacent spans.

The optional `ExactSynchronousResponseEnvironment.setBodyByteLength(bytes)` capability carries the
complete body's UTF-8 size after its final write. The compiler-closed response factory supplies
its existing HTML-plus-hydration byte fact. The comparison's document producer adds its prefix,
suffix and padding before publishing the complete size. This updates the comparison to exercise
the framework capability; it does not change its content or give React different work.

The Node adapter validates the numeric hint and prepares known-length headers after production,
scope cleanup and cancellation checks succeed. Node 26's `maybePrepareFinalChunk` otherwise scans
the final string even when `setHeader('content-length', ...)` has already been called. Explicitly
preparing the header with `writeHead` is necessary to avoid that scan. Bodyless status codes,
explicit transfer encoding and already-prepared headers preserve their existing handling. Body-only
writes omit the complete-response hint because their caller can surround the body with other output.

The new capability is optional in both directions. Old components and producers keep working with
the new adapter, and old adapters can ignore the hint. No compiler helper signature, hydration
encoding, supported serialized value, validation limit or ABI epoch changes.

## Experiments

Twelve alternating renderer rounds used the original fixture, a moderate Unicode extension, and
the 80KB Unicode fixture. Every render checked output equivalence and exact UTF-8 accounting.
The timing includes that common assertion, so absolute timings are not interchangeable with
older renderer-only loops that omitted it.

| Candidate                                                            | Observation                                                                                                          | Decision                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Long-text native-capable accounting                                  | Large Unicode rendering fell from 103.18 to 55.78 us; nine HTTP rounds improved 20.4%, winning all nine              | Retain                                     |
| Enable existing generated projectors for arrays shorter than 16      | Original renderer rose from 18.22 to 19.22 us; moderate Unicode also regressed                                       | Reject                                     |
| Guard long hydration JSON with one combined escaping search          | Large Unicode renderer rose from 106.69 to 110.19 us                                                                 | Reject                                     |
| Build dense positional arrays instead of preallocating their lengths | Large Unicode renderer changed from 107.43 to 105.88 us, winning only six of twelve; moderate Unicode mean regressed | Reject                                     |
| Set known content length without preparing headers                   | Does not bypass Node's final byte scan                                                                               | Do not use as the optimization             |
| Prepare known-length headers after cleanup                           | Diagnostic Unicode HTTP gain of 6.4%, winning all nine                                                               | Test with real ownership overhead          |
| Add callback/environment bookkeeping on top of the text fast path    | Unicode HTTP gain of 3.7%, winning eight of nine; original document changed only 0.5%                                | Retain, then verify final guards and build |

On the actual pre-stringification payload, isolated Unicode `JSON.stringify` averaged 19.21 us,
versus 2.77 us for the existing three escaping replacements. The proposed guarded replacement path
took 6.42 us. On the original payload, stringify took 0.67 us and escaping 0.12 us. These microbenchmarks
identify the dominant operation within serialization; they do not reproduce the inspector's sampled
HTTP timings. Captured payloads used no reactive-collection replacer. Serialization remains unchanged.

## Final HTTP comparison

| Workload              | eXact before RPS | eXact retained RPS | React RPS | eXact improvement | Behind React |
| --------------------- | ---------------: | -----------------: | --------: | ----------------: | -----------: |
| Original document     |           13,391 |             13,492 |    14,937 |             +0.8% |         9.7% |
| 80KB Unicode document |            4,188 |              5,254 |     5,655 |            +25.5% |         7.1% |

The final Unicode candidate wins all nine rounds. The original candidate wins seven of nine, but
its 0.8% mean difference is too small to establish a meaningful gain on this workstation. All
benchmark stages have zero errors. The retained build improves the larger workload substantially
while remaining behind React in both final means.

A subsequent [count audit](ssr-count-audit-2026-09-08.md) confirms the request arithmetic and
independently reconciles server completions with client counts. Its current-build-only capture
does not reproduce the exact small-document gap, so these means should not be treated as stable
framework capacity or a precise enduring React/eXact ratio.

Both participants run on Node 26.8.1. Two independent drivers use 32 total concurrency and
three-second blocks. Nine rounds rotate and reverse control, candidate and React order after
warmup. Control and candidate alternate in the same eXact worker, using preserved and rebuilt
renderer/adapter artifacts respectively. Every response must match its expected SHA-256 identity.
Artifact hashes are checked before and after each complete capture. Builds, tests and timing runs
do not overlap. Other workstation activity remains uncontrolled.

The original documents remain 3,485 bytes for eXact and 3,384 for React. The Unicode documents
remain 80,485 and 80,384 bytes. Both eXact variants produce identical complete response bodies.
These are targeted concurrency experiments, not offered-load saturation tests or replacements
for the public multi-framework benchmark suite. Public aggregate charts remain unchanged.

An earlier combined capture before the final prepared-header guards showed a 31.0% improvement and
was 1.3% behind React's mean. It remains in the evidence but is not substituted for the final-build
results above. Separate captures vary enough that the experiments do not establish general React
parity or attribute every cross-capture difference to a particular source line.

## Validation and evidence

The SSR/server/Node-adapter suites cover 424 passing tests across the full run and focused reruns.
New coverage checks Unicode, escaping, the 32-character threshold, exact limits, and split surrogate
pairs with native and portable counters. Compiler-closed response tests verify that the complete
byte fact follows the final span. Real HTTP tests cover known and unknown lengths, explicit chunked
encoding, 204 responses, caller-prepared headers, invalid hints, render failures, and asynchronous
cleanup failures. Error responses retain generic bodies and discard stale content lengths.

The rebuilt comparison passes all 14 eXact/React browser tests. Frozen 0.5.0 artifacts pass tasks,
reactive updates, keyed identity, SSR, hydration and disposal. Release ABI checks, platform boundaries,
test type checking, focused lint, source architecture and JSDoc checks pass. Package documentation,
engineering references and the docs application's compiler tour describe the resulting behavior.

The [machine-readable report](ssr-hotpath-experiments-2026-09-08.json) includes individual HTTP rounds,
renderer samples, stage timings, identities and artifact hashes. The
[evidence archive](ssr-hotpath-experiments-2026-09-08-evidence.zip) preserves raw captures, candidate
implementations, runners, source snapshots and a verified SHA-256 inventory.
