# Native sink integration measurements

Date: 2026-09-09. Experimental compiler/runtime integration. Production selection unchanged.

The native compiler now emits sibling reference preparation and conditional continuations. An
isolated compiler executable selects that emitter in its copied build tree; the production
selection is restored in a finally block. The actual comparison application builds with this
compiler through Vite. All 25 writer functions are linked by compiler program identity into the
existing target-methods sink prototype, with component binding equality checked before linking.
Writer statements are emitted by Go, not reconstructed by JavaScript regular expressions.

This is still an integration experiment. The runtime retains prototype transforms and guards
around unsupported enhancement capture. The full-app streaming benchmark still uses its complete
document collector; it does not measure early-head delivery. The separate scheduled-component
fixture exercises actual progressive publication, task waits, and transport backpressure.

## First complete comparison

Microseconds per complete application document, lower is better. Each cell averages two fresh
production-mode processes with reversed variant ordering, 5,000 warmups and 12,000 measured
renders per process. Node 26.8.1 and Bun 1.4.2. Small has three incidents; large has 96. Both have
four assets and their framework-owned shell and hydration/bootstrap output. Streams are fully
consumed with Response.text. These are renderer measurements, not HTTP requests/s. React resolves
React DOM 19.2.0 from its participant directory. All samples are retained; no build or test ran
concurrently with timing. Complete eXact document hashes match across all paired variants.

| Runtime | Mode | Document | Current eXact | Previous prototype | First native emitter | React |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| node | string | assets | 35.15 | 37.04 | 37.56 | 22.13 |
| node | string | large | 160.66 | 162.12 | 178.01 | 131.06 |
| node | stream | assets | 55.91 | 57.74 | 58.68 | 66.86 |
| node | stream | large | 195.72 | 190.38 | 200.01 | 336.12 |
| bun | string | assets | 35.66 | 34.40 | 35.43 | 33.06 |
| bun | string | large | 223.82 | 214.07 | 216.70 | 187.35 |
| bun | stream | assets | 50.61 | 50.42 | 52.33 | 53.29 |
| bun | stream | large | 295.23 | 262.74 | 270.62 | 272.43 |

For large string rendering, the first native emitter widens Node's excess time over React from
22.6% to 35.8%, while narrowing Bun's from 19.5% to 15.7%. Its Bun large-stream result is only
0.7% below React, too close to establish a reliable throughput advantage. The dramatic isolated
writer gains from the preceding report did not translate into a dramatic application gain.

## Removing unnecessary continuation work

The hypothesis was that operation checks with impossible asynchronous outcomes, and continuation
state for a single synchronous terminal write, contributed avoidable overhead. Known synchronous
serialization operations now omit Promise checks. Other operations remain conservative. A lone
synchronous write skips continuation state but still waits for its final sink drain. This does
not introduce a separate traversal engine or discard backpressure.

The next 48 processes compare the same preceding prototype, frozen first native emitter, and
refinement using the same protocol. These are a separate paired run from the React table above.

| Runtime | Mode | Document | Previous prototype | First native emitter | Refined emitter | Refined vs first |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| node | string | assets | 36.06 | 37.45 | 37.03 | -1.1% |
| node | string | large | 163.31 | 176.13 | 171.54 | -2.6% |
| node | stream | assets | 57.06 | 58.92 | 57.37 | -2.6% |
| node | stream | large | 197.16 | 205.88 | 202.55 | -1.6% |
| bun | string | assets | 34.75 | 35.34 | 35.82 | +1.4% |
| bun | string | large | 210.33 | 219.82 | 215.02 | -2.2% |
| bun | stream | assets | 51.14 | 51.44 | 52.00 | +1.1% |
| bun | stream | large | 265.63 | 268.91 | 266.13 | -1.0% |

The refinements recover part of the large-document regression on both runtimes. They do not
recover the previous prototype's large string result, and Bun's small cases regress slightly.
The refined emitter remains integration work, not a production performance win.

## Pending-property experiment, rejected

Replacing the 77 generated readiness calls with reads of a pending property tested whether
avoiding no-op method dispatch helps the non-suspending collector. Sixteen fresh string-rendering
processes used the same warmup and iteration counts. This was a complete-collector experiment,
not validation of a replacement backpressure protocol.

| Runtime | Document | Pair 1: refined / property | Pair 2: refined / property |
| --- | --- | ---: | ---: |
| node | assets | 36.79 / 36.00 | 36.42 / 36.75 |
| node | large | 167.10 / 166.54 | 166.29 / 173.04 |
| bun | assets | 35.19 / 34.70 | 34.95 / 34.92 |
| bun | large | 208.74 / 216.63 | 218.02 / 214.66 |

Direction changes between pairs in both large cases. This experiment is not retained, and the
native emitter continues to use sink.ready().

## Correctness and scope

The native-generated scheduled document matches production HTML and hydration records both with
and without component markers on Node and Bun: 553 and 747 bytes respectively. Twelve transport
pressure/cancellation cases cover 1-, 8-, and 8,192-byte flush thresholds. Both child tasks must
start before their test gate opens; both children dispose, host ancestry unwinds, and hydration
is serialized once after success. The tests assert only one outstanding transport write.

Real Chromium adopts the marked documents generated by Node and Bun. Elements, text nodes, and
the hydration script retain identity; restored child values are correct, server tasks do not
restart, and both children dispose. This is correctness coverage, not browser timing.

The actual application passes 40 budget cases across ASCII/hostile Unicode and five byte limits,
plus eight fully consumed stream comparisons with production. Eleven low-level native-emitted
writer cases pass on each runtime, including the optimized terminal write with a pending drain.
Native tests cover empty and wide plans, sibling reference identity and preparation ordering.
The native compiler and command tests pass, as does the source-architecture check.

The first isolated Vite attempt ran from the repository root and failed package authorization.
Running it from the comparison application's normal working directory succeeded. No package
authorization rule or manifest was weakened. A runtime-link assertion initially expected const
where the bundle emitted var; the corrected unique-site check passed. Neither failed attempt
was timed or counted as validation.

Production ABI migration, broader runtime integration, early publication in the actual app, and
React parity remain unfinished. Current production package artifacts were not replaced by these
experimental compiler or runtime builds.
