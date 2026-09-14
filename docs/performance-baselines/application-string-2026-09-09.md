# String sinks on the comparison application

Date: 2026-09-09. Experimental bundle transformations, production unchanged.

This moves the sink experiment from the scheduled-child fixture onto the actual comparison app.
The transformation chain starts from current production SHA-256
`3a0683d59c2264901d7e45eaf686e2d15b51e80eeaabc651f2062e77aea1bba2`, retains the earlier compiler
and runtime improvements, and creates the direct-writer accumulator with conditional sibling
cleanup. It then replaces accumulation with the native string sink. The first candidate counts
each incoming span and retains the existing final count; the second reuses completed sink
accounting at final collection, avoiding that repeated scan.

The hypothesis was that a specialized sink could make the shared traversal efficient on the
actual application. Unlike the earlier byte-collection fixture comparison, the control here is
production's already-optimized string renderer. Initial results contradict a broad improvement:
per-write UTF-8 accounting is substantially more expensive, especially on larger documents.
Removing the final rescan does not recover that cost.

Each row shows production / candidate microseconds per full string render, with percentage time
change. Positive means slower. Node 26.8.1 and Bun 1.4.2, production mode, fresh processes, 5,000
warmups and 12,000 measurements. Both framework-order pairs are retained. Assets means three
incidents with four assets; large means 96 incidents with the same four assets. All paired full
document hashes match. No concurrent build or test workload ran during measurements.

| Runtime | Scenario | Candidate | Pair 1 | Pair 2 |
| --- | --- | --- | --- | --- |
| node | assets | accumulator-control | 35.05 / 37.63 (+7.36%) | 34.78 / 35.73 (+2.71%) |
| node | assets | string-sink | 35.05 / 44.47 (+26.88%) | 34.78 / 45.26 (+30.11%) |
| node | assets | string-sink-accounted | 35.05 / 43.96 (+25.43%) | 34.78 / 44.29 (+27.34%) |
| node | large | accumulator-control | 157.21 / 163.65 (+4.10%) | 156.32 / 165.41 (+5.81%) |
| node | large | string-sink | 157.21 / 246.25 (+56.64%) | 156.32 / 251.47 (+60.86%) |
| node | large | string-sink-accounted | 157.21 / 252.98 (+60.92%) | 156.32 / 262.52 (+67.94%) |
| bun | assets | accumulator-control | 34.79 / 37.43 (+7.59%) | 35.37 / 37.31 (+5.48%) |
| bun | assets | string-sink | 34.79 / 40.35 (+15.98%) | 35.37 / 39.77 (+12.43%) |
| bun | assets | string-sink-accounted | 34.79 / 41.07 (+18.04%) | 35.37 / 40.21 (+13.68%) |
| bun | large | accumulator-control | 221.13 / 227.58 (+2.92%) | 225.36 / 228.85 (+1.55%) |
| bun | large | string-sink | 221.13 / 292.31 (+32.19%) | 225.36 / 268.42 (+19.11%) |
| bun | large | string-sink-accounted | 221.13 / 282.92 (+27.94%) | 225.36 / 272.00 (+20.70%) |

## Exact accounting at string completion

A distinct candidate bounds accumulated UTF-16 length during writes and counts exact UTF-8 bytes
once before successful completion. UTF-16 length is a lower bound for UTF-8 size, so a definitely
oversized allocation is rejected early. Non-ASCII size violations can be detected later, at final
validation. No partial string is published. This is a collecting-sink policy; it must not replace
incremental checks on a sink that publishes bytes progressively. The existing production string
path likewise validates completed root output before returning it.

| Runtime | Scenario | Candidate | Pair 1 | Pair 2 |
| --- | --- | --- | --- | --- |
| node | assets | string-sink-deferred | 36.04 / 36.74 (+1.93%) | 34.60 / 36.66 (+5.95%) |
| node | large | string-sink-deferred | 160.42 / 163.31 (+1.80%) | 158.84 / 165.01 (+3.88%) |
| bun | assets | string-sink-deferred | 35.20 / 34.66 (-1.53%) | 35.21 / 34.61 (-1.72%) |
| bun | large | string-sink-deferred | 224.51 / 214.64 (-4.39%) | 226.38 / 212.62 (-6.08%) |

The deferred collector improves Bun in both pairs for both sizes, but remains slower on Node.
Retain it as the collecting-sink candidate for integration, not as a production replacement.
This does not establish React parity or validate the staged renderer's complete architecture.
The application's outer stream still collects this tree before its existing transport path;
these artifacts do not implement early head publication on the actual application.

## Correctness and limits

On each runtime, 1,380 Unicode/split/budget cases compare final encoded bytes, size errors and
destruction with the incremental byte sink. Sixty application budget cases cover production,
per-write/accounted and deferred candidates, ASCII and hostile Unicode, and five limits. All
results and error messages match the corresponding production string API. Twelve consumed-stream
checks compare exact output to the production streaming API.

The initial stream assertion mistakenly compared against the string API, which sets a different
hydration flag (88 versus 72). It was corrected to compare the same API across variants; no
output normalization or hydration flag rewriting is used. The initial build also lacked a copied
runner dependency; the reproducible builder now includes it. All measurements were taken after
successful builds.

These cases do not establish arbitrary enhancement, rollback, nested asynchronous capture or
browser behavior. Compiler-native staging and broader integration remain outstanding. No
production code changed in this experiment and no new React or browser timings were collected.
The overall goal remains incomplete.

The archive contains the transformation chain, control/candidate artifacts, raw samples, fixed
input, sink sources, audits and SHA-256 manifest. Reproduction requires built workspace packages.
