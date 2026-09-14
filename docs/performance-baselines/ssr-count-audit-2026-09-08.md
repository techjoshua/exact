# SSR request-count audit, September 8, 2026

The saved React throughput arithmetic checks out, and an independent server-side count audit finds
no duplicated requests or omitted response work. The exact eXact/React gap is less stable than a
single reported average suggests. No framework implementation changed during this audit.

## Recalculation and workload inspection

All measured blocks in four recent small-document captures were recalculated from the raw driver
counts and timestamps. The numerator is the sum of fully validated responses from both drivers.
The denominator spans the earliest driver start through the latest completion, including drain.
Recalculated values match the saved values to floating-point precision. The largest driver start
skew is two milliseconds. There is no multiplication of an already-combined RPS value, inclusion
of warmup counts, or omission of completion time.

The receiver settles each HTTP request once across end/error/timeout events. Successful responses
are counted only after full-body reception, status validation, length validation and SHA-256
validation. React responses are not subject to the timestamp normalization reserved for TanStack.

React still invokes `renderToString` for each page request and serializes its initial state for the
document. Only the controlled-service data is preloaded, equally for both participants. The installed
React 19.2.0 legacy server renderer creates a fresh rendering request and performs its work on each
call. There is no rendered-document cache in this path. Both workers run Node 26.8.1 in production.

The recent React means are not monotonically increasing:

| Capture                      | React mean RPS | Individual round range |
| ---------------------------- | -------------: | ---------------------: |
| Native hydration counter     |         14,125 |       12,073 to 15,650 |
| Text accounting experiment   |         14,720 |       12,357 to 15,969 |
| Response metadata experiment |         13,324 |       12,273 to 14,547 |
| Final hot-path build         |         14,937 |       13,007 to 15,973 |

All four captures record the same React application-bundle SHA-256 hash. That alone is not a complete
runtime fingerprint: React and React DOM are external imports, and their dependency files were not
included in those historical application hashes. This audit records hashes for their current JS and
package metadata files. Those new hashes cannot retroactively prove historical dependency identity.

## Independent current-build audit

The audit uses the ordinary production worker, one current eXact build and one React build, with
equal five-second warmups and six alternating five-second rounds. Two independent load processes
provide 32 total concurrency. No old/candidate renderer switching runs inside either worker.

For every block, three server-side counters independently match the client totals: rendered bodies,
complete response sizes, and response-finish events. The only extra server requests are the two
explicit driver preflights outside the timed stage. Server response-byte sums also match the exact
expected bytes times the request count. Driver interval counts sum to their whole-stage counts.

| Participant | Timed valid responses | Server renders | Server completions | Driver preflights |
| ----------- | --------------------: | -------------: | -----------------: | ----------------: |
| eXact       |               359,139 |        359,151 |            359,151 |                12 |
| React       |               425,312 |        425,324 |            425,324 |                12 |

An independent monotonic timer in the owning process surrounds each complete driver run. Its
interval also includes preflight and IPC, producing slightly lower RPS. The largest discrepancy
from stage-based rates is below 0.19% for either participant, far too small to explain the observed
between-run movement. All blocks have zero errors and stable artifact/response hashes.

| Current original-document capture | Mean RPS |      Round range |
| --------------------------------- | -------: | ---------------: |
| eXact                             |   11,962 | 10,869 to 12,928 |
| React                             |   14,165 | 13,272 to 14,914 |

This current-build audit also varies substantially and does not reproduce the earlier precise gap.
The earlier experiment harness mixed two eXact builds in one process while React used one build.
That is an asymmetry in module loading, warmup and JIT history, but this audit does not establish its
causal effect. The new audit also uses longer blocks and telemetry snapshots between blocks, so its
difference from those captures is not a controlled measurement of that asymmetry alone.

The counts are trustworthy for the work completed in each measured interval. They do not establish
stable peak capacity or justify treating changes in separate session averages as framework changes.
Driver CPU readings are also substantial, so the captured RPS includes load-generator and host costs.
Future framework comparisons should keep one build per worker, identical warmup and duration,
repeated balanced populations, complete runtime fingerprints and per-round spread alongside means.

The [evidence archive](ssr-count-audit-2026-09-08-evidence.zip) contains the raw current capture,
historical recalculations, server/client counter checks, runner, relevant measurement source and
current external runtime snapshots with a verified SHA-256 inventory. All audit-owned processes
were closed. Public benchmark charts are unchanged.
