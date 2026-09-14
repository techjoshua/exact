# Shared SSR result getters experiment

Date: 2026-09-09. Prototype rejected; production unchanged.

The hypothesis was that sharing lazy result getters could save about 1-3% on small string
renders by removing request-local accessor closures. The prototype uses shared property
descriptors and a WeakMap containing request-local materialization state. It changes only the
two result factories in the frozen current text-surroundings build. Traversal, hydration
validation, document generation, and stream consumption remain identical.

Thirty-two fresh production processes cover Node/Bun, string/consumed stream, three/96 incidents
with two script and two stylesheet assets, and two reversed-order pairs per cell. Each process
performs 5,000 warmups and 12,000 measured renders. All paired full-document hashes match.
These are local renderer timings, not HTTP throughput or browser performance.

Positive percentages mean slower rendering. No completed population was discarded.

| Runtime | Mode   | Fixture | Pair 1 time change | Pair 2 time change |
| ------- | ------ | ------- | -----------------: | -----------------: |
| node    | string | small   |             -4.24% |             +1.37% |
| node    | string | large   |             -1.01% |             -1.88% |
| node    | stream | small   |             -3.95% |             -2.88% |
| node    | stream | large   |             -0.55% |             -4.27% |
| bun     | string | small   |             +1.16% |             +3.98% |
| bun     | string | large   |             -0.91% |             +6.49% |
| bun     | stream | small   |            +11.29% |             +6.61% |
| bun     | stream | large   |             -1.06% |             +2.28% |

Node streaming and large Node strings improved in both pairs. Small Bun strings and streams
regressed in both pairs, with small Bun streaming particularly unfavorable. Large Bun results
were mixed. This does not justify adopting the WeakMap representation across the shared engine.
The result does not isolate map access from descriptor construction or garbage collection.

Focused behavior checks passed in both runtimes: enumerable/configurable own getters, assignment
rejection, delayed materialization and memoization, frozen preload metadata, deferred resumption
reads, 75 document split positions per variant, and malformed-document rejection.
One reflection behavior differs: calling a detached getter with an unrelated receiver returns the
original captured value in the control but throws TypeError in the prototype. This would require
an explicit contract decision before any adoption. It is not a hydration regression.

No production files changed, and no new package or browser test result is claimed. The next
allocation experiment should target an actual intermediate object in the render pipeline rather
than replace closures with another request-local lookup layer. The broader direct-sink work and
React parity goal remain incomplete.

The adjacent evidence archive contains both frozen bundles, benchmark and audit scripts,
all 32 raw observations, both runtime audit results, fixed input, and a verified SHA-256 manifest.
