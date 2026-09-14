# Hydration serialization experiments, September 8, 2026

No production optimization is retained from this round. Combining positional projection and string
encoding did not improve rendering. Removing depth/node accounting did not establish a Node gain;
Bun showed a modest improvement in one complete-accounting-removal capture. This does not settle
whether resource limits should be optional as an API policy.

## Existing work and experiment scope

Component resumption capture already reserves and populates final indexed records while components
render. Publication performs root-prop positional projection with value validation in the same walk,
then serializes the resulting payload once. It does not generically revalidate the resulting
positional arrays. Moving those operations earlier without eliminating work is not itself a saving.

The fused prototype writes positional JSON directly, avoiding intermediate positional arrays. It
keeps finite primitive checks, shape/ownership checks, active-ancestor detection, and script escaping.
Variants move request-created helper closures to shared functions and specialize record writers to
their schemas. The latter uses dynamic Function construction only in the ignored experiment, with
compilation outside measurement. A production version would require compiler-emitted code, not
runtime evaluation.

These are feasibility probes, not replacement codecs. Generic authored values still use the existing
validator and encoder; their combined graph budget is not fully reproduced. The prototypes do not
implement named-prop fallback on schema mismatch or existing diagnostic paths, and bypass generated
version-one projectors. They therefore cannot be integrated on the strength of output equivalence
for these fixtures alone. They add no support for NaN, infinities, undefined, or other rejected values.

## Method

Node 26.8.1 and Bun 1.4.2 execute snapshots of the same production Node comparison artifact, including
the preceding request-domain optimization. This isolates JavaScript rendering under each engine;
it is not a native Bun HTTP test. Engines run sequentially in production mode. Each fixture has
3, 20, or 200 incidents, with deterministic rewritten IDs and the same selected route for all variants.
The three-incident fixture is not byte-identical to the prior public benchmark page.

Complete-render runs warm each variant for 2,000 iterations, then take 12 rounds in alternating
variant order. Each round uses 5,000 iterations, or 700 for the largest fixture. Every variant must
produce identical markup and reported UTF-8 bytes before timing. The sink consumes output and byte
counts. There are no HTTP requests, drivers, or concurrent build/test processes in these measurements.

Numbers below are mean microseconds per operation. Baselines belong to their own capture; do not
combine different controls into a capacity estimate. Raw rounds, scripts, snapshots, input data, and
hashes are preserved in the evidence archive and machine-readable summary.

## Complete rendering

| Candidate and capture        | 3 incidents, baseline / candidate | 20 incidents, baseline / candidate | 200 incidents, baseline / candidate |
| ---------------------------- | --------------------------------: | ---------------------------------: | ----------------------------------: |
| Node fused, request closures |                     14.18 / 15.23 |                      41.72 / 45.54 |                     340.32 / 381.69 |
| Node fused, shared helpers   |                     14.43 / 14.58 |                      42.76 / 45.92 |                     344.33 / 377.25 |
| Node schema-specific writer  |                     14.30 / 14.24 |                      41.90 / 43.11 |                     339.94 / 356.74 |
| Bun fused, shared helpers    |                     14.45 / 17.15 |                      43.53 / 56.44 |                     380.43 / 517.10 |
| Bun schema-specific writer   |                     14.45 / 16.45 |                      43.53 / 54.48 |                     380.43 / 486.93 |

Shared helpers and specialization reduce the prototype's overhead, but do not establish a win over
the existing implementation. A separate options-copy removal probe was also inconsistent: Node
14.43 / 14.17, 42.76 / 44.85, and 344.33 / 350.51. It is not integrated.

## Resource accounting

The first probe removes depth/node accounting from the interpreter only. The later
`unbudgeted-all` variant additionally removes five checks in generated projectors, covering the
remaining projection accounting exercised by these fixtures. It retains the encoded-byte limit,
UTF-8 counting, value checks, ownership/shape checks, and cycle detection. It deliberately changes
resource policy and is not a compatible implementation candidate as written.

| Full projection budget removal | 3 incidents, baseline / candidate | 20 incidents, baseline / candidate | 200 incidents, baseline / candidate |
| ------------------------------ | --------------------------------: | ---------------------------------: | ----------------------------------: |
| Node                           |                     14.24 / 14.30 |                      42.13 / 41.58 |                     339.37 / 340.51 |
| Bun                            |                     14.46 / 13.90 |                      45.32 / 44.41 |                     409.00 / 392.67 |

The Node result ranges from roughly 0.4% slower to 1.3% faster. Bun improves about 2-4% in this
capture, but that does not establish a Node throughput benefit or an HTTP capacity gain. Earlier
interpreter-only runs and individual rounds remain available rather than being pooled with this run.

## Isolated hydration

This separately repeats publication from captured component inputs, including projection,
serialization, escaping, script markup, and byte counting. It warms each operation for 3,000 calls,
then measures 12 alternating rounds of 15,000 calls, or 2,000 for 200 incidents. The native-JSON-only
control starts with a parsed, already projected payload. Its excluded preparation and publication
costs make it a reference cost, not a proposed replacement.

| Node operation                  | 3 incidents | 20 incidents | 200 incidents |
| ------------------------------- | ----------: | -----------: | ------------: |
| Existing hydration publication  |        2.83 |         9.36 |         69.32 |
| Fused shared helpers            |        3.34 |        12.29 |        103.14 |
| Schema-specific writer          |        3.19 |        10.61 |         88.61 |
| Native JSON only, prepared data |        0.58 |         1.93 |         16.34 |

Bun gives the same direction for fused writers; its full results are in the summary. These timings
are not the earlier HTTP profile's sampled stack-residence measurements. They exclude capture during
component execution and cannot be subtracted from that profile or substituted into its bucket table.

## Verification and decision

All measured variants pass fixture markup and byte-count equality checks. An additional 92 assertions
compare generic-state output, script delimiters, Unicode separators, unpaired surrogates, surrogate
pairs, sparse arrays, and unsupported-value rejection. This is focused experimental verification,
not certification of fallback, cancellation, retries, or the full codec contract. An initial shared
helper generation error was caught before timing and corrected; no results from that failed attempt
are retained as performance evidence.

Keep native JSON over the current positional representation. No SSR source, compiler contract,
published package behavior, resource default, or ABI changes in this round. Public docs-app charts
are unchanged because this is an internal experiment with no fresh HTTP or browser measurement.
The evidence does not establish a hydration throughput improvement, so it should not be described
as one. A future proposal must identify work beyond the already combined projection/validation pass,
or deliberately justify a different serialization policy, before claiming that another traversal
can simply be removed.

Evidence: [summary](ssr-hydration-fusion-2026-09-08.json) and
[scripts, snapshots, and raw measurements](ssr-hydration-fusion-2026-09-08-evidence.zip).
