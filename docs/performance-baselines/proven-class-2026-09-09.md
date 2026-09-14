# Compiler-proven class output, September 9, 2026

The retained compiler/runtime change removes repeated escaping of root class strings whose entire
output is compiler-proven safe ASCII. Large-document strings and streams improve on Node and Bun.
Small Bun strings are slightly slower in the rebuilt capture. The broader performance goal remains
unmet: React still leads strings and large Bun streams.

## Implementation and proof

The compiler proves the completed root-attribute slot after its object literal has been constructed.
Each class value must consist only of safe string literals, concatenations of proven strings, or
conditionals with both output branches proven. Conditions retain their original evaluation and side
effects. The alphabet is deliberately narrow: ASCII letters, digits, spaces, underscores, and hyphens.
Unknown identifiers, call results, computed property names, spreads, unsafe punctuation, and Unicode
values retain the existing path. No request-data cache or second rendering engine is introduced.

The SSR root plan uses attribute kind 7 for this proof. Runtime output preserves empty classes and
exact ASCII byte accounting. Non-string values retain class normalization. Semantic-target
composition creates an effective prop bag and bypasses the proven plan, so contributed attributes
still undergo normal escaping. Compiler tests reject unknown and hostile class expressions; the
runtime test covers a target contribution containing a quote.

This extends the initial unreleased 0.5.0 contract. It is not compatible with an older provider that
does not understand kind 7. Frozen released-artifact fixtures were not regenerated. Public authored
syntax, HTML output, and hydration behavior remain unchanged.

An initial compiler implementation attempted the proof before the root slot existed. Focused tests
caught its failure to emit the optimization. Moving the proof to completed plan serialization fixed
that issue. Actual rebuilt Node and Bun bundles each contain the expected two proven class plans.

## Measurements

The initial generated-artifact experiment ran 12 large-string populations. A 24-population follow-up
covered small strings and small/large streaming. Both preserved full eXact response hashes. Initial
small Bun strings regressed, while larger workloads consistently improved.

The table below uses the actual rebuilt compiler and packages, with all prior retained improvements.
Node 26.8.1 and Bun 1.4.2 load the same portable Node-targeted participant artifact for this focused
renderer comparison. It does not include runtime-specific HTTP adapters. Production mode, full
application-owned documents, empty client asset tags, three or 96 incidents. Streams are completely
consumed through Response.text(). Each fresh process has 5,000 warmups and 12,000 measured renders.

There are 48 populations: two rotated orders of previous eXact, current eXact, and React per cell.
The eXact pair reverses order; React's position is not fully counterbalanced in this two-round capture.
These are short local measurements, not confidence intervals or a full benchmark replacement.
Median microseconds per document, lower is better:

| Runtime | Output | Workload | Previous eXact | Current eXact |  React | eXact time reduction |
| ------- | ------ | -------- | -------------: | ------------: | -----: | -------------------: |
| node    | string | small    |          40.58 |         39.59 |  27.08 |                +2.4% |
| node    | string | large    |         264.18 |        221.13 | 155.33 |               +16.3% |
| node    | stream | small    |          68.44 |         61.59 |  80.55 |               +10.0% |
| node    | stream | large    |         309.34 |        267.40 | 409.63 |               +13.6% |
| bun     | string | small    |          39.04 |         39.58 |  34.29 |                -1.4% |
| bun     | string | large    |         356.93 |        325.86 | 217.76 |                +8.7% |
| bun     | stream | small    |          60.73 |         56.97 |  57.31 |                +6.2% |
| bun     | stream | large    |         434.72 |        405.36 | 319.58 |                +6.8% |

The small Bun string median increases by about 0.54 microseconds (1.4%). This tradeoff is retained
alongside the larger and streaming gains; a universal improvement is not claimed. The result does
not isolate all causes of the gain beyond the tested compiler/runtime change, and earlier CPU sample
percentages should not be treated as exact removable wall-clock costs.

## Validation and remaining work

Full native compiler tests/build, 251 core tests, 275 SSR tests, test type checking, 56 production
browser correctness checks across Node/Bun and string/stream, affected-file lint, source architecture,
JSDoc, explicit-any, platform boundaries, compiled ABI, frozen release ABI, and package contents pass.
A targeted follow-up also verifies normal escaping after semantic-target composition.

The preceding HTTP and browser timing captures predate this change. No new HTTP throughput or
browser timing improvement is claimed here. The root-attribute object is still allocated; the change
only removes escape scans where the compiler can prove they are unnecessary. Its design is the next
discussion requested by the user, rather than grounds to claim the optimization goal is complete.

[Structured results](proven-class-2026-09-09.json) and
[evidence archive](proven-class-2026-09-09-evidence.zip) preserve prototypes, rebuilt artifacts,
source snapshots, tests, logs, and measurements. Reproduction requires locked workspace dependencies.
