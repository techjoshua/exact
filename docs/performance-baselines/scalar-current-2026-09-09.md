# Compiler scalar root capture, September 9, 2026

Status: implemented and retained after focused validation and comparative renderer measurements.
The shared renderer remains in place. The overall React throughput goal remains unresolved.

## Change and hypothesis

The preceding [isolated experiment](scalar-root-2026-09-09.md) suggested that removing redundant
root attribute objects would reduce large-workload render time by a few percent. The production
compiler now captures a single dynamic root attribute directly when all remaining properties are
literal strings and the attribute plan is closed. It rejects spreads, duplicate names, special
prototype keys, and additional dynamic properties. The emitted shared factory retains raw static
properties and reconstructs the original object only when active target contributions require it.

The initializer stays in its original eager slot. It bypasses normal slot-reader rewriting so a
reactive wrapper stored as the attribute value is preserved. The original compiler property tree
remains available for safe-class proofs and preparation decisions. Escaping, URL policy, class
normalization, target merges, traversal limits, hydration, and task scheduling use existing paths.
This implementation emits scalar plans for incident rows, severity badges, and stylesheet links.
It does not introduce child inspection, a separate renderer, or request-data caching.

The scalar factory extends the initial unreleased 0.5.0 root-attribute tuple. New artifacts require
the matching compiler/core/SSR provider. The operation type now references the shared tuple instead
of duplicating it. Engineering and release guidance document this contract; frozen fixtures are
unchanged. Public APIs and historical docs-app performance charts have not changed.

## Measurement

Sixty fresh sequential production processes compare the previous safe-class build, rebuilt scalar
build, and React. Every population performs 5,000 warmups and 12,000 measured renders. The large
96-incident case rotates all three positions across three rounds; the small 3-incident case has two
rotations and is not fully position-balanced. Both Node and Bun load the same portable renderer
bundle. Stream output is fully consumed through Response.text(). Full application-owned documents
are rendered with empty client asset tags. Every eXact population checks its complete final-response
hash against the previous eXact artifact and verifies document framing.

Median microseconds per complete render, lower is better. The final column is the median of each
round's percentage reduction versus previous eXact, not the ratio of independently calculated medians.

| Runtime | Mode   | Size  | Previous eXact | Current eXact |  React | Paired reduction |
| ------- | ------ | ----- | -------------: | ------------: | -----: | ---------------: |
| node    | string | small |          35.41 |         35.00 |  23.47 |            +1.2% |
| node    | string | large |         207.71 |        196.96 | 147.38 |            +9.5% |
| node    | stream | small |          46.46 |         45.25 |  64.86 |            +2.6% |
| node    | stream | large |         213.39 |        202.50 | 341.33 |            +5.3% |
| bun     | string | small |          32.29 |         32.98 |  31.30 |            -2.2% |
| bun     | string | large |         269.19 |        248.95 | 195.40 |            +7.5% |
| bun     | stream | small |          48.26 |         47.19 |  47.36 |            +2.2% |
| bun     | stream | large |         318.50 |        313.15 | 265.96 |            -0.0% |

The change is retained for the consistent large-string gains on both runtimes and the Node-stream
gain. Large Bun streaming is effectively unchanged by paired results, despite a slightly lower
independent median. Small Bun strings are approximately 0.7 microseconds slower and regress in both
rounds; this is an accepted tradeoff, not a universal performance win. eXact still trails React in
string rendering and large Bun streaming. Small Bun streams are essentially tied in this capture.

These are short renderer experiments on the shared PC, not HTTP throughput or browser timing.
Absolute Node large-string control timings varied substantially within the capture. Pairing and
rotating order help, but do not establish confidence intervals or eliminate workload interference.
The earlier HTTP and browser timing captures predate this change. No new HTTP RPS claim is made.

## Validation

- Full native compiler and command tests pass, and the compiler executable is rebuilt and stamped.
- 251 core tests, 276 SSR tests, and test type checking pass.
- Compiler coverage checks scalar eligibility, dynamic-root preparation, SVG namespace inheritance,
  conditional classes, and interactive server projections. Three old representation assertions were
  updated for scalar slots and their composition factories.
- Runtime coverage verifies array-valued classes, escaping, no allocation for absent or consumed
  target layers, reconstruction for an active layer, once-only consumption, and UTF-8 accounting.
- All 56 production browser checks pass across Node/Bun and string/stream for eXact and React.
- Affected-file lint, source architecture, JSDoc, explicit-any, platform boundaries, compiled ABI,
  frozen release ABI, and package-content checks pass.
- All eXact benchmark response hashes match the previous artifact.

The first package typecheck caught the duplicate tuple declaration and an incomplete test-context
cast. These were corrected before the final rebuild. A native semantic test also encountered stale
core declarations during that rebuild; rebuilding core first resolved the build-order mismatch.
Final logs in the archive are from the passing runs.

## Evidence

The accompanying JSON retains each population and artifact SHA-256. The ZIP contains source
snapshots, previous/current renderer bundles, the React bundle, fixed input, benchmark scripts,
raw results, and validation logs. No benchmark server is used for renderer timing. Browser servers
are owned and closed by the existing test harness.
