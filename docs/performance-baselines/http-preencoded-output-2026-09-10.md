# Pre-encoded socket output with complete rendering retained

Status: no consistent benefit from replacing the final string passed to Node with
a pre-encoded fixture buffer. This does not eliminate fresh-string consumption.
No production code changed.

## Hypothesis and scope

Encoding and preparing freshly rendered HTML for HTTP might affect subsequent
renderer cost through allocation or other execution pressure. Replace only the
final response.end argument with a pre-encoded copy while retaining the component
render and existing byte-count telemetry. A material renderer-time reduction would
support an indirect effect from that output work. Given the previous approximately
five-microsecond eXact/React response.end gap, inspect both that interval and render
invocation time; do not assume all end time is encoding or all of it is removable.

The diagnostic worker derives from `http-invocation-trace-2026-09-10.md`. It captures
the first full fixture string as a Buffer. At each switch to cached mode, the first
fresh string is encoded and checked for exact equality with that buffer, outside
the response.end timer. Subsequent socket writes use the cached buffer. Driver
preflights and every measured response validate the full served document identity.
This checks the transmitted cached document, not every discarded fresh rendering.

Each request still invokes the normal complete renderer and response adapter.
Buffer.byteLength telemetry is unchanged and still consumes the fresh string.
The common end wrapper also checks the doctype prefix on the fresh string. Thus
the test isolates final socket input substitution, not all string flattening,
byte counting, result retention, or encoding-related allocation. Buffer and string
arguments can take different Node output paths; their difference is part of this
treatment, not a pure encoding-cost measurement.

Four fresh production Node 26.8.1 workers run eXact, React, React, eXact. After ten
seconds of HTTP warmup, the first population measures fresh/cached/cached/fresh,
and the second cached/fresh/fresh/cached. Each block lasts three seconds with two
fresh drivers at concurrency 16 each. No isolated loops interrupt the blocks.
All processes run below normal priority without concurrent builds/tests/profilers.
User PC workload may vary. This deliberately cached-output diagnostic is not a
framework SSR benchmark baseline or an optimization proposal.

## Results

RPS means give equal weight to the two blocks per mode in each worker. Invocation
and response.end times are request-weighted means in microseconds.

| Worker  | Fresh RPS | Cached RPS | Change | Invocation fresh/cached | response.end fresh/cached |
| ------- | --------: | ---------: | -----: | ----------------------: | ------------------------: |
| eXact 1 |     9,299 |      9,316 | +0.18% |           46.87 / 46.33 |             25.09 / 26.39 |
| React 1 |    12,086 |     12,580 | +4.09% |           34.22 / 33.50 |             19.41 / 18.42 |
| React 2 |    13,122 |     12,611 | -3.89% |           31.84 / 32.93 |             18.10 / 18.57 |
| eXact 2 |     9,582 |      8,973 | -6.36% |           45.36 / 47.39 |             24.42 / 27.43 |

The 16 blocks contain 526,211 valid responses and zero errors, excluding warmups
and preflights. Full document sizes remain 4,672 bytes for eXact and 3,660 for React.
The runner verifies artifact hashes and unchanged server/adapter inventories.
All owned processes close; only the user's existing Codex Node remains.

No consistent renderer or throughput improvement appears. In both eXact workers,
the cached Buffer takes longer inside response.end than the fresh string. Do not
conclude that encoding is intrinsically free, or that Buffer output is universally
slower. This is one small-document Node workload with its existing header paths.

## Remaining distinction

Fresh output is still consumed before the socket substitution. A further diagnostic
would need to remove those fresh-string reads as well, using fixture byte facts
and a cached encoded output while continuing to execute the complete renderer.
Avoid checking startsWith on each fresh string in that treatment. Separate initial
and mode-transition equality checks from measured work. Such an ablation would
test combined output consumption and encoding, not a deployable implementation.

Preserve normal full-render benchmarks and do not accept cached-output RPS as
progress toward the framework performance goal. The adjacent archive preserves
worker, runner, log, capture, summary, measured participant artifacts and verified
SHA-256 manifest. No browser/package acceptance or production improvement is claimed.
